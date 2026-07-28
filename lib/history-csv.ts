import { resolveCompetition } from "./competition-catalog";
import { normalizeTeamKey } from "./team-identity";

export { normalizeTeamKey } from "./team-identity";

export type HistoricalMatchInput = {
  source: string;
  sourceKey: string;
  fileName: string;
  competition: string;
  season: string;
  matchDate: string;
  kickoff: string | null;
  homeTeam: string;
  awayTeam: string;
  homeKey: string;
  awayKey: string;
  homeGoals: number | null;
  awayGoals: number | null;
  result: "H" | "D" | "A" | null;
  referee: string | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsTarget: number | null;
  awayShotsTarget: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLocaleUpperCase().replace(/[^A-Z0-9]/g, "");
}

function valueFrom(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[normalizedHeader(key)];
    if (value !== undefined && value !== "") return value.trim();
  }
  return "";
}

function nullableNumber(value: string) {
  if (!value) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value: string) {
  const number = nullableNumber(value);
  return number === null ? null : Math.trunc(number);
}

function parseDate(value: string) {
  const clean = value.trim();
  const iso = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const european = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!european) return null;
  const yearNumber = Number(european[3]);
  const year = yearNumber < 100 ? (yearNumber >= 70 ? 1900 : 2000) + yearNumber : yearNumber;
  return `${year}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}`;
}

function chooseOdds(record: Record<string, string>, side: "H" | "D" | "A") {
  return nullableNumber(
    valueFrom(record, `Avg${side}`, `PS${side}`, `B365${side}`, `Max${side}`, `WH${side}`, `IW${side}`),
  );
}

export function parseHistoricalCsv(
  text: string,
  options: { source: string; season: string; fileName: string },
) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV中没有可导入的比赛记录。");
  const headers = rows[0].map(normalizedHeader);
  const matches: HistoricalMatchInput[] = [];
  let invalid = 0;
  let excluded = 0;

  for (const values of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const matchDate = parseDate(valueFrom(record, "Date", "MatchDate"));
    const homeTeam = valueFrom(record, "HomeTeam", "Home");
    const awayTeam = valueFrom(record, "AwayTeam", "Away");
    const competitionInput = valueFrom(record, "Div", "Competition", "League");
    const competitionDefinition = resolveCompetition(competitionInput);
    if (!matchDate || !homeTeam || !awayTeam) {
      invalid += 1;
      continue;
    }
    if (!competitionDefinition) {
      excluded += 1;
      continue;
    }
    const competition = competitionDefinition.code;

    const homeGoals = nullableInteger(valueFrom(record, "FTHG", "HomeGoals", "HG"));
    const awayGoals = nullableInteger(valueFrom(record, "FTAG", "AwayGoals", "AG"));
    const statedResult = valueFrom(record, "FTR", "Result").toLocaleUpperCase();
    const result =
      statedResult === "H" || statedResult === "D" || statedResult === "A"
        ? statedResult
        : homeGoals !== null && awayGoals !== null
          ? homeGoals > awayGoals
            ? "H"
            : homeGoals < awayGoals
              ? "A"
              : "D"
          : null;
    const homeKey = normalizeTeamKey(homeTeam);
    const awayKey = normalizeTeamKey(awayTeam);
    const time = valueFrom(record, "Time", "Kickoff");
    const sourceKey = [options.source, competition, options.season, matchDate, homeKey, awayKey]
      .join("|")
      .toLocaleLowerCase();

    matches.push({
      source: options.source,
      sourceKey,
      fileName: options.fileName,
      competition,
      season: options.season,
      matchDate,
      kickoff: time ? `${matchDate}T${time.length === 5 ? time : time.slice(0, 5)}` : null,
      homeTeam,
      awayTeam,
      homeKey,
      awayKey,
      homeGoals,
      awayGoals,
      result,
      referee: valueFrom(record, "Referee") || null,
      homeShots: nullableInteger(valueFrom(record, "HS")),
      awayShots: nullableInteger(valueFrom(record, "AS")),
      homeShotsTarget: nullableInteger(valueFrom(record, "HST")),
      awayShotsTarget: nullableInteger(valueFrom(record, "AST")),
      homeCorners: nullableInteger(valueFrom(record, "HC")),
      awayCorners: nullableInteger(valueFrom(record, "AC")),
      homeYellow: nullableInteger(valueFrom(record, "HY")),
      awayYellow: nullableInteger(valueFrom(record, "AY")),
      homeRed: nullableInteger(valueFrom(record, "HR")),
      awayRed: nullableInteger(valueFrom(record, "AR")),
      oddsHome: chooseOdds(record, "H"),
      oddsDraw: chooseOdds(record, "D"),
      oddsAway: chooseOdds(record, "A"),
    });
  }

  return { matches, total: rows.length - 1, invalid, excluded };
}
