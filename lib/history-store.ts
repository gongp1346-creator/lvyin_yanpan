import { normalizeTeamKey, parseHistoricalCsv } from "./history-csv";
import { COMPETITION_CATALOG, resolveCompetition } from "./competition-catalog";
import type { HistoricalMatchInput } from "./history-csv";
import { estimateMatchFromHistory, HISTORY_MODEL_VERSION, runWalkForwardBacktest, type HistoricalMatchRow } from "./history-model";

const MATCH_SCHEMA = `CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  file_name TEXT,
  competition TEXT NOT NULL,
  season TEXT NOT NULL,
  match_date TEXT NOT NULL,
  kickoff TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_key TEXT NOT NULL,
  away_key TEXT NOT NULL,
  home_goals INTEGER,
  away_goals INTEGER,
  result TEXT,
  referee TEXT,
  home_shots INTEGER,
  away_shots INTEGER,
  home_shots_target INTEGER,
  away_shots_target INTEGER,
  home_corners INTEGER,
  away_corners INTEGER,
  home_yellow INTEGER,
  away_yellow INTEGER,
  home_red INTEGER,
  away_red INTEGER,
  odds_home REAL,
  odds_draw REAL,
  odds_away REAL,
  imported_at TEXT NOT NULL
)`;

const IMPORT_SCHEMA = `CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  file_name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  rows_imported INTEGER NOT NULL,
  rows_skipped INTEGER NOT NULL,
  rows_invalid INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`;

const PREDICTION_SCHEMA = `CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  prediction_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  kickoff TEXT,
  match_date TEXT NOT NULL,
  competition TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_key TEXT NOT NULL,
  away_key TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  predicted_outcome TEXT,
  probability_home REAL,
  probability_draw REAL,
  probability_away REAL,
  odds_home REAL,
  odds_draw REAL,
  odds_away REAL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL,
  actual_result TEXT,
  correct INTEGER,
  profit REAL,
  settled_at TEXT
)`;

async function database() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("历史数据库尚未绑定。");
  return env.DB;
}

async function ensureSchema() {
  const db = await database();
  await db.batch([
    db.prepare(MATCH_SCHEMA),
    db.prepare(IMPORT_SCHEMA),
    db.prepare(PREDICTION_SCHEMA),
    db.prepare("CREATE INDEX IF NOT EXISTS matches_date_idx ON matches (match_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS matches_home_key_idx ON matches (home_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS matches_away_key_idx ON matches (away_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS import_jobs_created_at_idx ON import_jobs (created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS predictions_status_date_idx ON predictions (status, match_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS predictions_match_idx ON predictions (competition, match_date, home_key, away_key)"),
  ]);
}

const INSERT_MATCH = `INSERT OR IGNORE INTO matches (
  id, source, source_key, file_name, competition, season, match_date, kickoff,
  home_team, away_team, home_key, away_key, home_goals, away_goals, result, referee,
  home_shots, away_shots, home_shots_target, away_shots_target, home_corners, away_corners,
  home_yellow, away_yellow, home_red, away_red, odds_home, odds_draw, odds_away, imported_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const ALLOWED_COMPETITION_VALUES = [...new Set(COMPETITION_CATALOG.flatMap((competition) =>
  [competition.code, competition.csvCode].filter((value): value is string => Boolean(value)),
))];
const ALLOWED_COMPETITION_PLACEHOLDERS = ALLOWED_COMPETITION_VALUES.map(() => "?").join(",");

async function persistHistoricalMatches(input: {
  matches: HistoricalMatchInput[];
  total: number;
  invalid: number;
  excluded: number;
  source: string;
  season: string;
  fileName: string;
}) {
  await ensureSchema();
  const db = await database();
  const now = new Date().toISOString();
  let imported = 0;

  for (let offset = 0; offset < input.matches.length; offset += 25) {
    const chunk = input.matches.slice(offset, offset + 25);
    const identityClause = chunk.map(() => "(match_date = ? AND home_key = ? AND away_key = ?)").join(" OR ");
    const existing = await db.prepare(
      `SELECT match_date, home_key, away_key FROM matches WHERE ${identityClause}`,
    ).bind(...chunk.flatMap((match) => [match.matchDate, match.homeKey, match.awayKey])).all<{
      match_date: string;
      home_key: string;
      away_key: string;
    }>();
    const existingKeys = new Set(existing.results.map((match) =>
      `${match.match_date}|${match.home_key}|${match.away_key}`,
    ));
    const newMatches = chunk.filter((match) =>
      !existingKeys.has(`${match.matchDate}|${match.homeKey}|${match.awayKey}`),
    );
    if (!newMatches.length) continue;
    const results = await db.batch(
      newMatches.map((match) =>
        db.prepare(INSERT_MATCH).bind(
          crypto.randomUUID(), match.source, match.sourceKey, match.fileName, match.competition,
          match.season, match.matchDate, match.kickoff, match.homeTeam, match.awayTeam,
          match.homeKey, match.awayKey, match.homeGoals, match.awayGoals, match.result, match.referee,
          match.homeShots, match.awayShots, match.homeShotsTarget, match.awayShotsTarget,
          match.homeCorners, match.awayCorners, match.homeYellow, match.awayYellow,
          match.homeRed, match.awayRed, match.oddsHome, match.oddsDraw, match.oddsAway, now,
        ),
      ),
    );
    imported += results.reduce(
      (sum: number, result: { meta?: { changes?: number } }) =>
        sum + Number(result.meta?.changes || 0),
      0,
    );
  }

  const skipped = input.matches.length - imported;
  await db.prepare(
    "INSERT INTO import_jobs (id, source, file_name, season, status, rows_total, rows_imported, rows_skipped, rows_invalid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    crypto.randomUUID(), input.source, input.fileName, input.season, "completed",
    input.total, imported, skipped, input.invalid + input.excluded, now,
  ).run();

  await settlePendingPredictions(db);

  return { total: input.total, imported, skipped, invalid: input.invalid, excluded: input.excluded };
}

export async function importHistoryCsv(input: { text: string; source: string; season: string; fileName: string }) {
  const parsed = parseHistoricalCsv(input.text, input);
  return persistHistoricalMatches({ ...input, ...parsed });
}

export async function importHistoryMatches(input: {
  matches: HistoricalMatchInput[];
  source: string;
  season: string;
  fileName: string;
  total?: number;
  invalid?: number;
}) {
  const allowedMatches = input.matches.filter((match) => resolveCompetition(match.competition));
  return persistHistoricalMatches({
    ...input,
    matches: allowedMatches,
    total: input.total ?? input.matches.length,
    invalid: input.invalid ?? 0,
    excluded: input.matches.length - allowedMatches.length,
  });
}

export async function getImportedResultsByDate(date: string) {
  await ensureSchema();
  const db = await database();
  const rows = await db.prepare(`SELECT id, competition, match_date, kickoff, home_team, away_team, home_goals, away_goals, result, source FROM matches WHERE match_date = ? AND result IN ('H','D','A') ORDER BY kickoff ASC, id ASC`).bind(date).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    id: String(row.id || ''), matchNumber: '', league: String(row.competition || ''),
    homeTeam: String(row.home_team || ''), awayTeam: String(row.away_team || ''),
    kickoff: String(row.kickoff || row.match_date || ''), halfTimeScore: '',
    fullTimeScore: `${Number(row.home_goals)}-${Number(row.away_goals)}`,
    result: row.result === 'H' ? '主胜' : row.result === 'A' ? '客胜' : '平', status: '完场',
    source: String(row.source || '历史库'), sourceUrl: ''
  }));
}
export async function getHistorySummary() {
  await ensureSchema();
  const db = await database();
  const [counts, imports, competitionCounts] = await Promise.all([
    db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN result IN ('H','D','A') THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN odds_home IS NOT NULL AND odds_draw IS NOT NULL AND odds_away IS NOT NULL THEN 1 ELSE 0 END) AS with_odds,
      COUNT(DISTINCT competition) AS competitions,
      COUNT(DISTINCT season) AS seasons,
      MIN(match_date) AS date_from,
      MAX(match_date) AS date_to
    FROM matches WHERE competition IN (${ALLOWED_COMPETITION_PLACEHOLDERS})`)
      .bind(...ALLOWED_COMPETITION_VALUES).first<Record<string, number | string | null>>(),
    db.prepare("SELECT source, file_name, season, rows_total, rows_imported, rows_skipped, rows_invalid, created_at FROM import_jobs ORDER BY created_at DESC LIMIT 6").all(),
    db.prepare(`SELECT competition, COUNT(*) AS matches FROM matches
      WHERE competition IN (${ALLOWED_COMPETITION_PLACEHOLDERS}) GROUP BY competition`)
      .bind(...ALLOWED_COMPETITION_VALUES).all<Record<string, number | string>>(),
  ]);
  const coverageMap = new Map<string, number>();
  for (const row of competitionCounts.results) {
    const definition = resolveCompetition(String(row.competition || ""));
    if (definition) coverageMap.set(definition.code, (coverageMap.get(definition.code) || 0) + Number(row.matches || 0));
  }
  const total = Number(counts?.total || 0);
  return {
    total,
    completed: Number(counts?.completed || 0),
    withOdds: Number(counts?.with_odds || 0),
    competitions: coverageMap.size,
    seasons: Number(counts?.seasons || 0),
    dateFrom: counts?.date_from || null,
    dateTo: counts?.date_to || null,
    gate: total >= 1500 ? "foundation" : total >= 500 ? "preliminary" : "blocked",
    gateReason: total >= 1500
      ? "历史基础样本已达到1,500场；仍需通过回测后才能开放概率。"
      : total >= 500
        ? "已达到初步建模门槛，建议继续扩充到1,500场以上。"
        : `当前${total}场，低于500场基础门槛，概率输出保持关闭。`,
    coverage: COMPETITION_CATALOG.map((competition) => ({
      code: competition.code,
      name: competition.nameZh,
      group: competition.group,
      matches: coverageMap.get(competition.code) || 0,
    })),
    imports: imports.results,
  };
}

async function completedMatches(cutoff?: string, competitionCode?: string) {
  await ensureSchema();
  const db = await database();
  const sql = `SELECT competition, match_date, home_key, away_key, result, home_goals, away_goals,
    odds_home, odds_draw, odds_away FROM matches
    WHERE result IN ('H','D','A') AND home_goals IS NOT NULL AND away_goals IS NOT NULL
    AND competition IN (${ALLOWED_COMPETITION_PLACEHOLDERS})
    ${competitionCode ? "AND competition = ?" : ""}
    ${cutoff ? "AND match_date < ?" : ""}
    ORDER BY match_date ASC, id ASC LIMIT 20000`;
  const params = [...ALLOWED_COMPETITION_VALUES];
  if (competitionCode) params.push(competitionCode);
  if (cutoff) params.push(cutoff);
  const query = db.prepare(sql).bind(...params);
  const rows = await query.all<HistoricalMatchRow>();
  return rows.results;
}

export async function getBacktestReport() {
  return runWalkForwardBacktest(await completedMatches());
}

async function getHeadToHeadMatches(input: { homeKey: string; awayKey: string; cutoff?: string; limit: number }) {
  await ensureSchema();
  const db = await database();
  const cutoffClause = input.cutoff ? "AND match_date < ?" : "";
  const params: Array<string | number> = [input.homeKey, input.awayKey, input.awayKey, input.homeKey];
  if (input.cutoff) params.push(input.cutoff);
  params.push(input.limit);
  const rows = await db.prepare(`SELECT competition, match_date, kickoff, home_team, away_team,
    home_goals, away_goals, result, source FROM matches
    WHERE result IN ('H','D','A') AND home_goals IS NOT NULL AND away_goals IS NOT NULL
    AND ((home_key = ? AND away_key = ?) OR (home_key = ? AND away_key = ?))
    ${cutoffClause}
    ORDER BY match_date DESC, id DESC LIMIT ?`).bind(...params).all<Record<string, string | number | null>>();
  return rows.results.map((row) => ({
    competition: String(row.competition || ""), date: String(row.match_date || ""),
    kickoff: row.kickoff ? String(row.kickoff) : null,
    homeTeam: String(row.home_team || ""), awayTeam: String(row.away_team || ""),
    homeGoals: Number(row.home_goals), awayGoals: Number(row.away_goals),
    result: String(row.result || ""), source: String(row.source || ""),
  }));
}

async function bestTeamCompetition(input: { homeKey: string; awayKey: string; cutoff?: string }) {
  await ensureSchema();
  const db = await database();
  const cutoffClause = input.cutoff ? "AND match_date < ?" : "";
  const params: Array<string> = [input.homeKey, input.awayKey];
  if (input.cutoff) params.push(input.cutoff);
  const rows = await db.prepare(`SELECT competition, COUNT(*) AS matches
    FROM matches WHERE (home_key = ? OR away_key = ?) ${cutoffClause}
    GROUP BY competition ORDER BY matches DESC LIMIT 5`).bind(...params).all<{ competition: string; matches: number }>();
  return rows.results.find((row) => Number(row.matches) >= 12)?.competition || null;
}

export async function getHistoricalModelEstimate(input: {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoff?: string;
  odds?: { home: number | null; draw: number | null; away: number | null };
}) {
  const competition = resolveCompetition(input.competition);
  if (!competition) return { status: "blocked" as const, reason: "赛事不在模型白名单内。", homeMatches: 0, awayMatches: 0, headToHead: [] };
  const cutoff = input.kickoff && /^\d{4}-\d{2}-\d{2}/.test(input.kickoff) ? input.kickoff.slice(0, 10) : undefined;
  const homeKey = normalizeTeamKey(input.homeTeam);
  const awayKey = normalizeTeamKey(input.awayTeam);
  let matches = await completedMatches(cutoff, competition.code);
  const headToHead = await getHeadToHeadMatches({ homeKey, awayKey, cutoff, limit: 10 });
  let estimate = estimateMatchFromHistory({
    matches,
    competition: competition.nameZh,
    homeKey,
    awayKey,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    odds: input.odds,
    cutoff,
  });
  let fallbackCompetition: string | null = null;
  if (estimate.status === "blocked") {
    fallbackCompetition = await bestTeamCompetition({ homeKey, awayKey, cutoff });
    if (fallbackCompetition && fallbackCompetition !== competition.code) {
      const fallbackMatches = await completedMatches(cutoff, fallbackCompetition);
      const fallbackEstimate = estimateMatchFromHistory({
        matches: fallbackMatches,
        competition: `${competition.nameZh}跨赛事回退`,
        homeKey,
        awayKey,
        homeTeam: input.homeTeam,
        awayTeam: input.awayTeam,
        odds: input.odds,
        cutoff,
      });
      if (fallbackEstimate.status === "ready") {
        matches = fallbackMatches;
        estimate = {
          ...fallbackEstimate,
          reason: `${fallbackEstimate.reason}；原赛事样本不足，已回退至${fallbackCompetition}球队数据，置信度下调。`,
        };
      }
    }
  }
  return { ...estimate, headToHead, fallbackCompetition };
}

async function settlePendingPredictions(db: any) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE predictions SET
    status = 'settled',
    actual_result = (SELECT m.result FROM matches m WHERE m.competition = predictions.competition
      AND m.match_date = predictions.match_date AND m.home_key = predictions.home_key
      AND m.away_key = predictions.away_key AND m.result IN ('H','D','A') LIMIT 1),
    correct = CASE
      WHEN predicted_outcome IS NULL THEN NULL
      WHEN predicted_outcome = (SELECT m.result FROM matches m WHERE m.competition = predictions.competition
        AND m.match_date = predictions.match_date AND m.home_key = predictions.home_key
        AND m.away_key = predictions.away_key AND m.result IN ('H','D','A') LIMIT 1) THEN 1
      WHEN predicted_outcome = 'HD' AND (SELECT m.result FROM matches m WHERE m.competition = predictions.competition
        AND m.match_date = predictions.match_date AND m.home_key = predictions.home_key
        AND m.away_key = predictions.away_key LIMIT 1) IN ('H','D') THEN 1
      WHEN predicted_outcome = 'DA' AND (SELECT m.result FROM matches m WHERE m.competition = predictions.competition
        AND m.match_date = predictions.match_date AND m.home_key = predictions.home_key
        AND m.away_key = predictions.away_key LIMIT 1) IN ('D','A') THEN 1
      ELSE 0 END,
    profit = CASE
      WHEN predicted_outcome IS NULL THEN NULL
      WHEN predicted_outcome NOT IN ('H','D','A') THEN NULL
      WHEN predicted_outcome = 'H' AND odds_home IS NULL THEN NULL
      WHEN predicted_outcome = 'D' AND odds_draw IS NULL THEN NULL
      WHEN predicted_outcome = 'A' AND odds_away IS NULL THEN NULL
      WHEN predicted_outcome = (SELECT m.result FROM matches m WHERE m.competition = predictions.competition
        AND m.match_date = predictions.match_date AND m.home_key = predictions.home_key
        AND m.away_key = predictions.away_key AND m.result IN ('H','D','A') LIMIT 1)
      THEN CASE predicted_outcome WHEN 'H' THEN odds_home - 1 WHEN 'D' THEN odds_draw - 1 WHEN 'A' THEN odds_away - 1 END
      ELSE -1 END,
    settled_at = ?
    WHERE status = 'pending' AND EXISTS (SELECT 1 FROM matches m WHERE m.competition = predictions.competition
      AND m.match_date = predictions.match_date AND m.home_key = predictions.home_key
      AND m.away_key = predictions.away_key AND m.result IN ('H','D','A'))`).bind(now).run();
}

export async function saveModelPrediction(input: {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoff?: string;
  recommendation: string;
  predictedOutcome: "H" | "D" | "A" | "HD" | "DA" | null;
  probabilities?: { homeWin: number; draw: number; awayWin: number } | null;
  odds?: { home: number | null; draw: number | null; away: number | null };
  modelVersion?: string;
}) {
  const competition = resolveCompetition(input.competition);
  const matchDate = input.kickoff?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!competition || !matchDate) return;
  await ensureSchema();
  const db = await database();
  const now = new Date().toISOString();
  const homeKey = normalizeTeamKey(input.homeTeam);
  const awayKey = normalizeTeamKey(input.awayTeam);
  const modelVersion = input.modelVersion || HISTORY_MODEL_VERSION;
  const predictionKey = `${competition.code}|${matchDate}|${homeKey}|${awayKey}|${modelVersion}`;
  await db.prepare(`INSERT INTO predictions (
    id, prediction_key, created_at, updated_at, kickoff, match_date, competition,
    home_team, away_team, home_key, away_key, recommendation, predicted_outcome,
    probability_home, probability_draw, probability_away, odds_home, odds_draw, odds_away,
    model_version, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  ON CONFLICT(prediction_key) DO UPDATE SET
    updated_at = excluded.updated_at, kickoff = excluded.kickoff,
    recommendation = excluded.recommendation, predicted_outcome = excluded.predicted_outcome,
    probability_home = excluded.probability_home, probability_draw = excluded.probability_draw,
    probability_away = excluded.probability_away, odds_home = excluded.odds_home,
    odds_draw = excluded.odds_draw, odds_away = excluded.odds_away
  WHERE predictions.status = 'pending'`).bind(
    crypto.randomUUID(), predictionKey, now, now, input.kickoff || null, matchDate, competition.code,
    input.homeTeam, input.awayTeam, homeKey, awayKey, input.recommendation, input.predictedOutcome,
    input.probabilities?.homeWin ?? null, input.probabilities?.draw ?? null, input.probabilities?.awayWin ?? null,
    input.odds?.home ?? null, input.odds?.draw ?? null, input.odds?.away ?? null, modelVersion,
  ).run();
}

export async function getPredictionAudit() {
  await ensureSchema();
  const db = await database();
  await settlePendingPredictions(db);
  const [summary, recent, grouped] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'settled' AND predicted_outcome IS NOT NULL THEN 1 ELSE 0 END) AS settled,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN profit IS NOT NULL THEN profit ELSE 0 END) AS profit,
      SUM(CASE WHEN profit IS NOT NULL THEN 1 ELSE 0 END) AS bets
      FROM predictions`).first<Record<string, number | null>>(),
    db.prepare(`SELECT match_date, competition, home_team, away_team, recommendation, status,
      actual_result, correct, profit, model_version FROM predictions ORDER BY match_date DESC, updated_at DESC LIMIT 20`).all(),
    db.prepare(`SELECT competition, recommendation, model_version, COUNT(*) AS samples,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN profit IS NOT NULL THEN profit ELSE 0 END) AS profit,
      SUM(CASE WHEN profit IS NOT NULL THEN 1 ELSE 0 END) AS bets
      FROM predictions WHERE status = 'settled' AND predicted_outcome IS NOT NULL
      GROUP BY competition, recommendation, model_version ORDER BY samples DESC`).all(),
  ]);
  const settled = Number(summary?.settled || 0);
  const bets = Number(summary?.bets || 0);
  return {
    total: Number(summary?.total || 0),
    pending: Number(summary?.pending || 0),
    settled,
    correct: Number(summary?.correct || 0),
    hitRate: settled ? Number(summary?.correct || 0) / settled : null,
    profit: Number(summary?.profit || 0),
    bets,
    roi: bets ? Number(summary?.profit || 0) / bets : null,
    feedback: grouped.results.map((row: Record<string, unknown>) => {
      const samples = Number(row.samples || 0);
      const rowBets = Number(row.bets || 0);
      const hitRate = samples ? Number(row.correct || 0) / samples : null;
      return { competition: String(row.competition || ""), recommendation: String(row.recommendation || ""), modelVersion: String(row.model_version || ""), samples, hitRate, roi: rowBets ? Number(row.profit || 0) / rowBets : null, adjustment: samples < 30 ? "样本不足，不调整" : hitRate !== null && hitRate < 0.42 ? "降低该档位信心上限，继续观察" : "维持当前权重，滚动复核" };
    }),
    recent: recent.results,
  };
}
