import { NextResponse } from "next/server";
import { resolveCompetition } from "../../../../lib/competition-catalog";
import { getFiveHundredJingcaiMatches } from "../../../../lib/five-hundred-jingcai";
import { getEspnResult } from "../../../../lib/espn-result";
import { getVzhanLiveResult } from "../../../../lib/vzhan-live";
import { getImportedResultsByDate } from "../../../../lib/history-store";

type AnyRecord = Record<string, any>;
const asRecord = (value: unknown): AnyRecord => typeof value === "object" && value !== null ? value as AnyRecord : {};
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

function dateInShanghai(offset: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function scoreOf(value: unknown) {
  if (typeof value === "string") {
    const score = value.trim().match(/(\d+)\s*[-:：]\s*(\d+)/);
    return score ? `${score[1]}-${score[2]}` : "";
  }
  const score = asRecord(value);
  const home = score.home ?? score.h ?? score.homeScore;
  const away = score.away ?? score.a ?? score.awayScore;
  return Number.isFinite(Number(home)) && Number.isFinite(Number(away)) ? `${home}-${away}` : "";
}

function resultLists(payload: AnyRecord) {
  const value = asRecord(payload.value);
  return [value.matchResultList, value.matchInfoList, value.matchList, value.list, value.records]
    .flatMap(asArray).flatMap((item) => {
      const group = asRecord(item);
      const children = group.subMatchList ?? group.matchList ?? group.list;
      return Array.isArray(children) ? children : [group];
    });
}

function normalizeMatch(value: unknown) {
  const match = asRecord(value);
  const fullTimeScore = scoreOf(match.sectionsNo999 ?? match.fullTimeScore ?? match.matchScore ?? match.finalScore ?? match.score);
  const homeTeam = String(match.homeTeamAllName ?? match.homeTeamAbbName ?? match.homeName ?? "").trim();
  const awayTeam = String(match.awayTeamAllName ?? match.awayTeamAbbName ?? match.awayName ?? "").trim();
  if (!homeTeam || !awayTeam || !fullTimeScore) return null;
  const [homeGoals, awayGoals] = fullTimeScore.split("-").map(Number);
  return {
    id: String(match.matchId ?? match.matchNumStr ?? `${homeTeam}-${awayTeam}`),
    matchNumber: String(match.matchNumStr ?? match.matchNum ?? "竞彩").trim(),
    league: String(match.leagueAbbName ?? match.leagueAllName ?? match.leagueName ?? "").trim(),
    homeTeam, awayTeam,
    kickoff: String(match.matchDate ?? match.matchTime ?? "").trim(),
    halfTimeScore: scoreOf(match.sectionsNo1 ?? match.halfTimeScore),
    fullTimeScore,
    result: homeGoals > awayGoals ? "主胜" : homeGoals < awayGoals ? "客胜" : "平",
    status: "完场",
  };
}

async function fetchPage(date: string, pageNo: number) {
  const url = new URL("https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultV1.qry");
  url.search = new URLSearchParams({ matchPage: String(pageNo), matchBeginDate: date, matchEndDate: date, leagueId: "", pageSize: "100", pageNo: String(pageNo), isFix: "0", pcOrWap: "1", clientCode: "3001" }).toString();
  const response = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*", Referer: "https://www.sporttery.cn/", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" }, cf: { cacheTtl: 60 } } as RequestInit);
  if (!response.ok) throw new Error(`官方赛果接口返回 ${response.status}`);
  const payload = asRecord(await response.json());
  if (payload.success !== true) throw new Error(String(payload.errorMessage || "官方赛果接口未返回有效数据"));
  return payload;
}

async function fetchBackupResults(date: string) {
  const matches = await getFiveHundredJingcaiMatches(date, false);
  const results = await Promise.all(matches.map(async (match) => {
    const live = await getEspnResult(match) || await getVzhanLiveResult(match);
    if (!live) return null;
    const isFinal = live.status === "完场";
    return {
      ...match,
      halfTimeScore: "halfTimeScore" in live ? live.halfTimeScore : "",
      goals: "goals" in live ? live.goals : [],
      cards: "cards" in live ? live.cards : [],
      fullTimeScore: `${live.homeScore}-${live.awayScore}`,
      result: isFinal
        ? (live.homeScore > live.awayScore ? "主胜" : live.homeScore < live.awayScore ? "客胜" : "平")
        : live.status,
      status: live.status,
      source: live.source,
      sourceUrl: live.sourceUrl,
    };
  }));
  return results.filter((match): match is NonNullable<typeof match> => Boolean(match));
}
export async function GET(request: Request) {
  const requestedDate = new URL(request.url).searchParams.get("date") || "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : dateInShanghai(-1);
  try {
    const first = await fetchPage(date, 1);
    const value = asRecord(first.value);
    const totalPages = Math.min(20, Math.max(1, Number(value.pages ?? value.totalPages ?? 1)));
    const payloads = [first];
    for (let page = 2; page <= totalPages; page += 1) payloads.push(await fetchPage(date, page));
    const matches = payloads.flatMap(resultLists).map(normalizeMatch).filter((match): match is NonNullable<typeof match> => Boolean(match));
    let uniqueMatches = [...new Map(matches.map((match) => [match.id, match])).values()];
    let source = "中国体彩网";
    let sourceUrl = "https://www.sporttery.cn/";

    if (!uniqueMatches.length) {
      const scheduleResponse = await fetch("https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry?clientCode=3001", {
        headers: { Accept: "application/json,text/plain,*/*", Referer: "https://www.sporttery.cn/", "User-Agent": "Mozilla/5.0" },
        cf: { cacheTtl: 60 },
      } as RequestInit);
      if (scheduleResponse.ok) {
        const schedule = asRecord(await scheduleResponse.json());
        const groups = asArray(asRecord(schedule.value).matchInfoList);
        const candidates = groups.flatMap((group) => asArray(asRecord(group).subMatchList)).map(asRecord)
          .filter((match) => String(match.businessDate || "").slice(0, 10) === date)
          .filter((match) => Boolean(resolveCompetition(String(match.leagueAbbName || match.leagueAllName || ""))));
        const supplemental = await Promise.all(candidates.map(async (match) => {
          const homeTeam = String(match.homeTeamAllName || match.homeTeamAbbName || "").trim();
          const awayTeam = String(match.awayTeamAllName || match.awayTeamAbbName || "").trim();
          const live = await getVzhanLiveResult({ homeTeam, awayTeam });
          if (!live) return null;
          const isFinal = live.status === "完场";
          return {
            id: String(match.matchId || match.matchNumStr), matchNumber: String(match.matchNumStr || "竞彩"),
            league: String(match.leagueAbbName || match.leagueAllName || ""), homeTeam, awayTeam,
            kickoff: `${match.matchDate || ""} ${match.matchTime || ""}`.trim(), halfTimeScore: "",
            fullTimeScore: `${live.homeScore}-${live.awayScore}`,
            result: isFinal ? (live.homeScore > live.awayScore ? "主胜" : live.homeScore < live.awayScore ? "客胜" : "平") : live.status,
            status: live.status, source: live.source, sourceUrl: live.sourceUrl,
          };
        }));
        uniqueMatches = supplemental.filter((match): match is NonNullable<typeof match> => Boolean(match));
        if (uniqueMatches.length) {
          source = "中国体彩网场次 + V站赛果";
          sourceUrl = "https://www.vzhan310.com/";
        }
      }
    }
    if (!uniqueMatches.length) {
      // EdgeOne has no D1 binding; use the scheduled Cloudflare Worker as the shared history backend.
      try {
        const origin = `https://pitch-intelligence.gongp1346.workers.dev/api/jingcai/yesterday?date=${date}`;
        const originResponse = await fetch(origin, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/json" } });
        if (originResponse.ok) {
          const originPayload = asRecord(await originResponse.json());
          const originMatches = asArray(originPayload.matches);
          if (originMatches.length) {
            return NextResponse.json({ ...originPayload, source: `${String(originPayload.source || "Cloudflare Worker")}（EdgeOne 回源）` }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
          }
        }
      } catch {
        // Continue to local/external fallbacks when the origin is unavailable.
      }
      const imported = await getImportedResultsByDate(date).catch(() => []);
      if (imported.length) { uniqueMatches = imported; source = "历史库兜底"; sourceUrl = ""; }
    }
    return NextResponse.json({ source, sourceUrl, date, checkedAt: new Date().toISOString(), matches: uniqueMatches }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (error) {
    try {
      const backupMatches = await fetchBackupResults(date);
      const matches = backupMatches.length ? backupMatches : await getImportedResultsByDate(date).catch(() => []);
      return NextResponse.json({
        source: "500彩票网竞彩 + V站/ESPN赛果",
        sourceUrl: "https://trade.500.com/jczq/",
        date,
        checkedAt: new Date().toISOString(),
        warning: error instanceof Error ? error.message : "官方竞彩赛果暂时无法同步",
        matches,
      }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
    } catch (backupError) {
      return NextResponse.json({
        error: backupError instanceof Error ? backupError.message : "备用竞彩赛果暂时无法同步",
        source: "中国体彩网 / 500彩票网 / V站 / ESPN",
        date,
        matches: [],
      }, { status: 503 });
    }
  }
}