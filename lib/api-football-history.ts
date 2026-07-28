import { competitionLabel, type CompetitionDefinition } from "./competition-catalog";
import { normalizeTeamKey, type HistoricalMatchInput } from "./history-csv";

type ApiRecord = Record<string, any>;

const asRecord = (value: unknown): ApiRecord =>
  typeof value === "object" && value !== null ? (value as ApiRecord) : {};
const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function parseApiFootballFixtures(
  payload: unknown,
  competition: CompetitionDefinition,
  season: number,
) {
  const rows = asArray(asRecord(payload).response);
  const matches: HistoricalMatchInput[] = [];
  let invalid = 0;

  for (const item of rows) {
    const row = asRecord(item);
    const fixture = asRecord(row.fixture);
    const teams = asRecord(row.teams);
    const home = asRecord(teams.home);
    const away = asRecord(teams.away);
    const goals = asRecord(row.goals);
    const matchDate = typeof fixture.date === "string" ? fixture.date.slice(0, 10) : "";
    const homeTeam = String(home.name || "").trim();
    const awayTeam = String(away.name || "").trim();
    if (!fixture.id || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate) || !homeTeam || !awayTeam) {
      invalid += 1;
      continue;
    }

    const homeGoals = nullableInteger(goals.home);
    const awayGoals = nullableInteger(goals.away);
    const result = homeGoals === null || awayGoals === null
      ? null
      : homeGoals > awayGoals
        ? "H"
        : homeGoals < awayGoals
          ? "A"
          : "D";
    const homeKey = normalizeTeamKey(homeTeam);
    const awayKey = normalizeTeamKey(awayTeam);

    matches.push({
      source: "API-Football",
      sourceKey: `api-football|fixture|${fixture.id}`,
      fileName: `api-football-${season}-${competition.code}.json`,
      competition: competition.code,
      season: String(season),
      matchDate,
      kickoff: typeof fixture.date === "string" ? fixture.date : null,
      homeTeam,
      awayTeam,
      homeKey,
      awayKey,
      homeGoals,
      awayGoals,
      result,
      referee: typeof fixture.referee === "string" && fixture.referee.trim() ? fixture.referee.trim() : null,
      homeShots: null,
      awayShots: null,
      homeShotsTarget: null,
      awayShotsTarget: null,
      homeCorners: null,
      awayCorners: null,
      homeYellow: null,
      awayYellow: null,
      homeRed: null,
      awayRed: null,
      oddsHome: null,
      oddsDraw: null,
      oddsAway: null,
    });
  }

  return { matches, total: rows.length, invalid };
}

export async function downloadApiFootballSeason(
  competition: CompetitionDefinition,
  season: number,
  apiKey: string,
) {
  if (!competition.apiFootballId) throw new Error(`${competitionLabel(competition.code)}缺少数据源编号。`);
  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("league", String(competition.apiFootballId));
  url.searchParams.set("season", String(season));
  let response = await fetch(url, { headers: { "x-apisports-key": apiKey, Accept: "application/json" } });
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 7_000));
    response = await fetch(url, { headers: { "x-apisports-key": apiKey, Accept: "application/json" } });
  }
  if (!response.ok) throw new Error(`${competition.nameZh}下载失败（${response.status}）。`);
  const payload = asRecord(await response.json());
  const errors = asRecord(payload.errors);
  if (Object.keys(errors).length) {
    const reason = Object.values(errors).map(String).filter(Boolean).join("；");
    throw new Error(`${competition.nameZh}：${reason || "数据源返回错误"}`);
  }
  return parseApiFootballFixtures(payload, competition, season);
}
