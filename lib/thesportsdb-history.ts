import type { HistoricalMatchInput } from "./history-csv";
import { normalizeTeamKey } from "./history-csv";
import type { CompetitionDefinition } from "./competition-catalog";

type AnyRecord = Record<string, any>;
const asRecord = (value: unknown): AnyRecord => typeof value === "object" && value !== null ? value as AnyRecord : {};
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

export const SPORTS_DB_LEAGUES: Record<string, number> = {
  J1: 4633, EPL: 4328, ECH: 4329, BUN: 4331, ISA: 4332, FL1: 4334, FL2: 4401, LL: 4335,
  NOR: 4358, SWE: 4347, FIN: 4636, K1: 4689, MLS: 4346, BSA: 4351,
  JEC: 5637, EFL: 4570, DFB: 4485, CIT: 4506, CDF: 4484,
  CDR: 4483, NMC: 5634, SVC: 4756, SUC: 5186, KFAC: 5635,
};

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function parseSportsDbEvents(payload: unknown, competition: CompetitionDefinition, season: string) {
  const rows = asArray(asRecord(payload).events);
  const matches: HistoricalMatchInput[] = [];
  let invalid = 0;
  for (const value of rows) {
    const row = asRecord(value);
    const matchDate = String(row.dateEvent || row.strTimestamp || "").slice(0, 10);
    const homeTeam = String(row.strHomeTeam || "").trim();
    const awayTeam = String(row.strAwayTeam || "").trim();
    const homeGoals = nullableInteger(row.intHomeScore);
    const awayGoals = nullableInteger(row.intAwayScore);
    if (!row.idEvent || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate) || !homeTeam || !awayTeam || homeGoals === null || awayGoals === null) {
      invalid += 1;
      continue;
    }
    matches.push({
      source: "TheSportsDB", sourceKey: `thesportsdb|event|${row.idEvent}`,
      fileName: `thesportsdb-${season}-${competition.code}.json`, competition: competition.code, season,
      matchDate, kickoff: typeof row.strTimestamp === "string" ? row.strTimestamp : null,
      homeTeam, awayTeam, homeKey: normalizeTeamKey(homeTeam), awayKey: normalizeTeamKey(awayTeam),
      homeGoals, awayGoals, result: homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D",
      referee: null, homeShots: null, awayShots: null, homeShotsTarget: null, awayShotsTarget: null,
      homeCorners: null, awayCorners: null, homeYellow: null, awayYellow: null, homeRed: null, awayRed: null,
      oddsHome: null, oddsDraw: null, oddsAway: null,
    });
  }
  return { matches, total: rows.length, invalid };
}

export async function downloadSportsDbSeason(competition: CompetitionDefinition, season: string) {
  const leagueId = SPORTS_DB_LEAGUES[competition.code];
  if (!leagueId) throw new Error(`${competition.nameZh}缺少 TheSportsDB 赛事编号`);
  const url = new URL("https://www.thesportsdb.com/api/v1/json/123/eventsseason.php");
  url.searchParams.set("id", String(leagueId));
  url.searchParams.set("s", season);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "PitchIntelligence/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${competition.nameZh}下载失败（${response.status}）`);
  const parsed = parseSportsDbEvents(await response.json(), competition, season);
  if (!parsed.total) throw new Error(`${competition.nameZh} ${season} 暂无公开赛季数据`);
  return parsed;
}
