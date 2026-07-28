import { NextResponse } from "next/server";
import { importHistoryMatches } from "../../../../lib/history-store";
import { normalizeTeamKey } from "../../../../lib/team-identity";
import type { HistoricalMatchInput } from "../../../../lib/history-csv";

type VzhanMatch = Partial<HistoricalMatchInput> & {
  sourceKey?: string;
  competition: string;
  season?: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
};

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resultFrom(homeGoals: number | null, awayGoals: number | null): "H" | "D" | "A" | null {
  if (homeGoals === null || awayGoals === null) return null;
  return homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D";
}

function normalizeMatch(input: VzhanMatch, index: number): HistoricalMatchInput {
  const homeKey = normalizeTeamKey(input.homeTeam);
  const awayKey = normalizeTeamKey(input.awayTeam);
  const homeGoals = nullableNumber(input.homeGoals);
  const awayGoals = nullableNumber(input.awayGoals);
  const matchDate = String(input.matchDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate) || !input.homeTeam || !input.awayTeam) {
    throw new Error(`第${index + 1}条比赛缺少有效日期或球队。`);
  }
  return {
    source: "V站",
    sourceKey: input.sourceKey || `vzhan|${matchDate}|${homeKey}|${awayKey}`.toLowerCase(),
    fileName: "vzhan-browser-import.json",
    competition: String(input.competition || ""),
    season: String(input.season || matchDate.slice(0, 4)),
    matchDate,
    kickoff: input.kickoff ? String(input.kickoff) : null,
    homeTeam: String(input.homeTeam),
    awayTeam: String(input.awayTeam),
    homeKey,
    awayKey,
    homeGoals,
    awayGoals,
    result: input.result === "H" || input.result === "D" || input.result === "A"
      ? input.result
      : resultFrom(homeGoals, awayGoals),
    referee: input.referee ? String(input.referee) : null,
    homeShots: nullableNumber(input.homeShots),
    awayShots: nullableNumber(input.awayShots),
    homeShotsTarget: nullableNumber(input.homeShotsTarget),
    awayShotsTarget: nullableNumber(input.awayShotsTarget),
    homeCorners: nullableNumber(input.homeCorners),
    awayCorners: nullableNumber(input.awayCorners),
    homeYellow: nullableNumber(input.homeYellow),
    awayYellow: nullableNumber(input.awayYellow),
    homeRed: nullableNumber(input.homeRed),
    awayRed: nullableNumber(input.awayRed),
    oddsHome: nullableNumber(input.oddsHome),
    oddsDraw: nullableNumber(input.oddsDraw),
    oddsAway: nullableNumber(input.oddsAway),
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { matches?: VzhanMatch[] } | VzhanMatch[];
    const rawMatches = Array.isArray(payload) ? payload : payload.matches;
    if (!Array.isArray(rawMatches) || rawMatches.length === 0 || rawMatches.length > 500) {
      return NextResponse.json({ error: "matches必须是1至500条比赛记录。" }, { status: 400 });
    }
    const matches = rawMatches.map(normalizeMatch);
    const seasons = [...new Set(matches.map((match) => match.season))];
    const result = await importHistoryMatches({
      matches,
      source: "V站",
      season: seasons.length === 1 ? seasons[0] : "multi-season",
      fileName: "vzhan-browser-import.json",
    });
    return NextResponse.json({ source: "V站", ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "V站数据导入失败。" },
      { status: 400 },
    );
  }
}
