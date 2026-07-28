import { NextResponse } from "next/server";
import { resolveCompetition } from "../../../../lib/competition-catalog";
import { getFiveHundredJingcaiMatches } from "../../../../lib/five-hundred-jingcai";
import { getEspnResult } from "../../../../lib/espn-result";
import { getVzhanLiveResult } from "../../../../lib/vzhan-live";
import { saveMarketSnapshots } from "../../../../lib/market-store";

type AnyRecord = Record<string, any>;
const asRecord = (value: unknown): AnyRecord => typeof value === "object" && value !== null ? value as AnyRecord : {};
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

function kickoffOf(match: AnyRecord) {
  const date = String(match.matchDate || "").trim();
  const time = String(match.matchTime || "").trim();
  const combined = date.includes(":") ? date : `${date} ${time}`.trim();
  const parsed = combined.replace(" ", "T").slice(0, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(parsed) ? parsed : combined;
}

function dateInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
export async function GET() {
  try {
    const url = "https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry?clientCode=3001";
    const response = await fetch(url, {
      headers: {
        Accept: "application/json,text/plain,*/*",
        Referer: "https://www.sporttery.cn/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      cf: { cacheTtl: 60 },
    } as RequestInit);
    if (!response.ok) throw new Error(`官方赛程接口返回 ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) throw new Error("官方赛程接口触发了安全拦截");
    const payload = asRecord(await response.json());
    if (payload.success !== true) throw new Error("官方赛程接口暂未返回有效数据");

    const groups = asArray(asRecord(payload.value).matchInfoList);
    const officialMatches = groups.flatMap((group) => asArray(asRecord(group).subMatchList))

      .map((matchValue) => {
        const match = asRecord(matchValue);
        const leagueName = String(match.leagueAbbName || match.leagueAllName || "").trim();
        const competition = resolveCompetition(leagueName);
        if (!competition) return null;
        const had = asArray(match.oddsList).map(asRecord).find((odds) => String(odds.poolCode).toUpperCase() === "HAD");
        return {
          id: String(match.matchId || match.matchNumStr || crypto.randomUUID()),
          matchNumber: String(match.matchNumStr || "竞彩").trim(),
          league: competition.nameZh,
          competitionCode: competition.code,
          homeTeam: String(match.homeTeamAllName || match.homeTeamAbbName || "").trim(),
          awayTeam: String(match.awayTeamAllName || match.awayTeamAbbName || "").trim(),
          kickoff: kickoffOf(match),
          odds: had && had.h && had.d && had.a ? { home: String(had.h), draw: String(had.d), away: String(had.a) } : null,
        };
      })
      .filter((match): match is NonNullable<typeof match> => Boolean(match?.homeTeam && match?.awayTeam && match?.kickoff))
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

    const matches = await Promise.all(officialMatches.map(async (match) => ({
      ...match,
      live: await getVzhanLiveResult(match) || await getEspnResult(match),
    })));
    await saveMarketSnapshots(matches, "中国体彩网").catch(() => undefined);

    return NextResponse.json({
      source: "中国体彩网",
      sourceUrl: "https://www.sporttery.cn/",
      checkedAt: new Date().toISOString(),
      matches,
    }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  } catch (error) {
    try {
      const backupMatches = await getFiveHundredJingcaiMatches(dateInShanghai());
      const matches = await Promise.all(backupMatches.map(async (match) => ({
        ...match,
        odds: match.odds,
        live: await getVzhanLiveResult(match) || await getEspnResult(match),
      })));
      await saveMarketSnapshots(matches, "500彩票网竞彩").catch(() => undefined);
      return NextResponse.json({
        source: "500彩票网竞彩",
        sourceUrl: "https://trade.500.com/jczq/",
        checkedAt: new Date().toISOString(),
        warning: error instanceof Error ? error.message : "官方竞彩赛程暂时无法同步",
        matches,
      }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
    } catch (backupError) {
      return NextResponse.json({
        error: backupError instanceof Error ? backupError.message : "备用竞彩赛程暂时无法同步",
        source: "中国体彩网 / 500彩票网",
        matches: [],
      }, { status: 503 });
    }
  }
}