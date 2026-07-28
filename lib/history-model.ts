import { estimateGoals } from "./goal-model";
import { estimateMatchContext } from "./match-context-model";

export const HISTORY_MODEL_VERSION = "league-fusion-v1";

type MatchRow = {
  competition: string;
  match_date: string;
  home_key: string;
  away_key: string;
  result: "H" | "D" | "A";
  home_goals: number;
  away_goals: number;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
};

type Probabilities = { homeWin: number; draw: number; awayWin: number };
type DecimalProbabilities = [number, number, number];
type Outcome = 0 | 1 | 2;

type TeamState = {
  appearances: number;
  recentPoints: number[];
  recentGoalDiff: number[];
  homePoints: number[];
  awayPoints: number[];
};

type LeagueState = {
  ratings: Map<string, number>;
  teams: Map<string, TeamState>;
  resultCounts: [number, number, number];
  matches: number;
};

function emptyLeagueState(): LeagueState {
  return { ratings: new Map(), teams: new Map(), resultCounts: [0, 0, 0], matches: 0 };
}

function teamState(state: LeagueState, key: string) {
  let team = state.teams.get(key);
  if (!team) {
    team = { appearances: 0, recentPoints: [], recentGoalDiff: [], homePoints: [], awayPoints: [] };
    state.teams.set(key, team);
  }
  return team;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalize(values: DecimalProbabilities): DecimalProbabilities {
  const safe = values.map((value) => Math.max(0.001, value)) as DecimalProbabilities;
  const total = safe[0] + safe[1] + safe[2];
  return [safe[0] / total, safe[1] / total, safe[2] / total];
}

function average(values: number[], fallback: number) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function eloProbabilities(homeRating: number, awayRating: number): DecimalProbabilities {
  const adjustedDifference = homeRating + 62 - awayRating;
  const homeShare = 1 / (1 + 10 ** (-adjustedDifference / 400));
  const draw = clamp(0.29 - Math.abs(adjustedDifference) / 1900, 0.18, 0.29);
  return normalize([homeShare * (1 - draw), draw, (1 - homeShare) * (1 - draw)]);
}

export function normalizeMarketOdds(odds?: { home: number | null; draw: number | null; away: number | null }): DecimalProbabilities | null {
  if (!odds?.home || !odds.draw || !odds.away) return null;
  if (odds.home <= 1 || odds.draw <= 1 || odds.away <= 1) return null;
  return normalize([1 / odds.home, 1 / odds.draw, 1 / odds.away]);
}

function priorProbabilities(state: LeagueState): DecimalProbabilities {
  const total = state.resultCounts[0] + state.resultCounts[1] + state.resultCounts[2];
  if (!total) return [0.44, 0.27, 0.29];
  return normalize([
    (state.resultCounts[0] + 4.4) / (total + 10),
    (state.resultCounts[1] + 2.7) / (total + 10),
    (state.resultCounts[2] + 2.9) / (total + 10),
  ]);
}

function formProbabilities(state: LeagueState, homeKey: string, awayKey: string): DecimalProbabilities {
  const home = teamState(state, homeKey);
  const away = teamState(state, awayKey);
  const homePoints = average(home.recentPoints, 1.35) / 3;
  const awayPoints = average(away.recentPoints, 1.35) / 3;
  const homeVenue = average(home.homePoints, 1.42) / 3;
  const awayVenue = average(away.awayPoints, 1.18) / 3;
  const homeGoals = average(home.recentGoalDiff, 0);
  const awayGoals = average(away.recentGoalDiff, 0);
  const signal = clamp(
    (homePoints - awayPoints) * 0.24 +
      (homeVenue - awayVenue) * 0.23 +
      (homeGoals - awayGoals) * 0.055 +
      0.035,
    -0.23,
    0.23,
  );
  const draw = clamp(0.285 - Math.abs(signal) * 0.25, 0.20, 0.285);
  const remaining = 1 - draw;
  return normalize([remaining / 2 + signal, draw, remaining / 2 - signal]);
}

function blendedProbabilities(
  state: LeagueState,
  homeKey: string,
  awayKey: string,
  market: DecimalProbabilities | null,
): DecimalProbabilities {
  const elo = eloProbabilities(state.ratings.get(homeKey) ?? 1500, state.ratings.get(awayKey) ?? 1500);
  const form = formProbabilities(state, homeKey, awayKey);
  const prior = priorProbabilities(state);
  const weights = market ? [0.31, 0.18, 0.08, 0.43] : [0.57, 0.28, 0.15, 0];
  return normalize([0, 1, 2].map((index) =>
    elo[index] * weights[0] + form[index] * weights[1] + prior[index] * weights[2] + (market?.[index] || 0) * weights[3],
  ) as DecimalProbabilities);
}

function pushRolling(values: number[], value: number, maximum: number) {
  values.push(value);
  if (values.length > maximum) values.shift();
}

function resultIndex(result: MatchRow["result"]): Outcome {
  return result === "H" ? 0 : result === "D" ? 1 : 2;
}

function updateState(state: LeagueState, match: MatchRow) {
  const homeRating = state.ratings.get(match.home_key) ?? 1500;
  const awayRating = state.ratings.get(match.away_key) ?? 1500;
  const expectation = 1 / (1 + 10 ** ((awayRating - (homeRating + 62)) / 400));
  const actual = match.result === "H" ? 1 : match.result === "D" ? 0.5 : 0;
  const multiplier = 1 + Math.min(Math.abs(match.home_goals - match.away_goals), 3) * 0.12;
  const change = 22 * multiplier * (actual - expectation);
  state.ratings.set(match.home_key, homeRating + change);
  state.ratings.set(match.away_key, awayRating - change);

  const home = teamState(state, match.home_key);
  const away = teamState(state, match.away_key);
  const homePoints = match.result === "H" ? 3 : match.result === "D" ? 1 : 0;
  const awayPoints = match.result === "A" ? 3 : match.result === "D" ? 1 : 0;
  home.appearances += 1;
  away.appearances += 1;
  pushRolling(home.recentPoints, homePoints, 8);
  pushRolling(away.recentPoints, awayPoints, 8);
  pushRolling(home.homePoints, homePoints, 5);
  pushRolling(away.awayPoints, awayPoints, 5);
  pushRolling(home.recentGoalDiff, match.home_goals - match.away_goals, 8);
  pushRolling(away.recentGoalDiff, match.away_goals - match.home_goals, 8);
  state.resultCounts[resultIndex(match.result)] += 1;
  state.matches += 1;
}

function scoreMetrics(samples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome }>) {
  if (!samples.length) return null;
  let correct = 0;
  let brier = 0;
  let logLoss = 0;
  for (const sample of samples) {
    const prediction = sample.probabilities.indexOf(Math.max(...sample.probabilities));
    if (prediction === sample.outcome) correct += 1;
    brier += sample.probabilities.reduce(
      (sum, probability, index) => sum + (probability - (index === sample.outcome ? 1 : 0)) ** 2,
      0,
    );
    logLoss += -Math.log(Math.max(0.000001, sample.probabilities[sample.outcome]));
  }
  return { samples: samples.length, accuracy: correct / samples.length, brier: brier / samples.length, logLoss: logLoss / samples.length };
}

function calibrationError(samples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome }>) {
  if (!samples.length) return 0;
  const buckets = Array.from({ length: 10 }, () => ({ count: 0, predicted: 0, actual: 0 }));
  for (const sample of samples) {
    sample.probabilities.forEach((probability, outcome) => {
      const bucket = buckets[Math.min(9, Math.floor(probability * 10))];
      bucket.count += 1;
      bucket.predicted += probability;
      bucket.actual += sample.outcome === outcome ? 1 : 0;
    });
  }
  return buckets.reduce((error, bucket) => bucket.count
    ? error + (bucket.count / (samples.length * 3)) * Math.abs(bucket.predicted / bucket.count - bucket.actual / bucket.count)
    : error, 0);
}

function selectiveMetrics(samples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome }>) {
  return [0.5, 0.55, 0.6, 0.65].map((threshold) => {
    const selected = samples.filter((sample) => Math.max(...sample.probabilities) >= threshold);
    const correct = selected.filter((sample) => sample.probabilities.indexOf(Math.max(...sample.probabilities)) === sample.outcome).length;
    return { threshold, samples: selected.length, coverage: samples.length ? selected.length / samples.length : 0, accuracy: selected.length ? correct / selected.length : null };
  });
}
function bettingMetrics(samples: Array<{
  probabilities: DecimalProbabilities;
  outcome: Outcome;
  odds: [number, number, number] | null;
}>) {
  let bets = 0;
  let profit = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const sample of samples) {
    if (!sample.odds) continue;
    const ranked = sample.probabilities.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
    const selection = ranked[0];
    const edge = selection.value * sample.odds[selection.index] - 1;
    if (selection.value < 0.43 || selection.value - ranked[1].value < 0.055 || edge < 0.045) continue;
    bets += 1;
    profit += selection.index === sample.outcome ? sample.odds[selection.index] - 1 : -1;
    peak = Math.max(peak, profit);
    maxDrawdown = Math.max(maxDrawdown, peak - profit);
  }
  return { bets, profit, roi: bets ? profit / bets : 0, maxDrawdown };
}

function toPercentages(probabilities: DecimalProbabilities): Probabilities {
  const values = probabilities.map((value) => Math.round(value * 100));
  values[0] += 100 - values.reduce((sum, value) => sum + value, 0);
  return { homeWin: values[0], draw: values[1], awayWin: values[2] };
}

function decisionFor(probabilities: DecimalProbabilities, homeTeam: string, awayTeam: string) {
  const [home, draw, away] = probabilities;
  const homeNonLoss = home + draw;
  const awayNonLoss = away + draw;
  if (home >= 0.52 && home - Math.max(draw, away) >= 0.10) return { recommendation: `主胜方向（${homeTeam}）`, outcome: "H" as const };
  if (away >= 0.49 && away - Math.max(home, draw) >= 0.09) return { recommendation: `客胜方向（${awayTeam}）`, outcome: "A" as const };
  if (awayNonLoss >= 0.67 && away >= home + 0.045) return { recommendation: `客队（${awayTeam}）不败`, outcome: "DA" as const };
  if (homeNonLoss >= 0.69 && home >= away + 0.05) return { recommendation: `主队（${homeTeam}）不败`, outcome: "HD" as const };
  if (draw >= 0.32 && Math.abs(home - away) <= 0.055) return { recommendation: "平局倾向", outcome: "D" as const };
  return { recommendation: "观望", outcome: null };
}

export function runWalkForwardBacktest(matches: MatchRow[]) {
  const ordered = [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date));
  if (ordered.length < 60) {
    return { status: "insufficient" as const, reason: "至少需要60场已完赛记录才能生成初步回测。", totalMatches: ordered.length };
  }

  const leagueStates = new Map<string, LeagueState>();
  const modelSamples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome }> = [];
  const priorSamples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome }> = [];
  const marketSamples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome }> = [];
  const betSamples: Array<{ probabilities: DecimalProbabilities; outcome: Outcome; odds: [number, number, number] | null }> = [];
  const leagueSamples = new Map<string, Array<{ probabilities: DecimalProbabilities; outcome: Outcome }>>();

  for (const match of ordered) {
    const state = leagueStates.get(match.competition) || emptyLeagueState();
    leagueStates.set(match.competition, state);
    const home = teamState(state, match.home_key);
    const away = teamState(state, match.away_key);
    const odds = match.odds_home && match.odds_draw && match.odds_away
      ? [match.odds_home, match.odds_draw, match.odds_away] as [number, number, number]
      : null;
    const market = odds ? normalizeMarketOdds({ home: odds[0], draw: odds[1], away: odds[2] }) : null;
    if (state.matches >= 60 && home.appearances >= 6 && away.appearances >= 6) {
      const probabilities = blendedProbabilities(state, match.home_key, match.away_key, market);
      const outcome = resultIndex(match.result);
      const prior = priorProbabilities(state);
      modelSamples.push({ probabilities, outcome });
      priorSamples.push({ probabilities: prior, outcome });
      betSamples.push({ probabilities, outcome, odds });
      if (market) marketSamples.push({ probabilities: market, outcome });
      const rows = leagueSamples.get(match.competition) || [];
      rows.push({ probabilities, outcome });
      leagueSamples.set(match.competition, rows);
    }
    updateState(state, match);
  }

  const model = scoreMetrics(modelSamples);
  const baseline = scoreMetrics(priorSamples);
  const market = scoreMetrics(marketSamples);
  if (!model || !baseline) {
    return { status: "insufficient" as const, reason: "各联赛独立热身后，可测试样本仍不足。", totalMatches: ordered.length };
  }
  const enough = model.samples >= 200;
  const beatsPrior = model.brier < baseline.brier;
  const betting = bettingMetrics(betSamples);
  const perCompetition = [...leagueSamples.entries()].map(([competition, samples]) => ({
    competition,
    ...scoreMetrics(samples)!,
  })).sort((a, b) => b.samples - a.samples);

  return {
    status: enough ? (beatsPrior ? "baseline_ready" as const : "underperforming" as const) : "preliminary" as const,
    reason: enough
      ? beatsPrior
        ? "严格按时间逐场预测，且各联赛独立训练；模型已优于固定联赛先验。"
        : "严格时间回测已完成，但模型尚未优于固定联赛先验，实战方向保持关闭。"
      : "已按联赛独立、按时间逐场回测；当前可测试样本仍不足200场。",
    modelVersion: HISTORY_MODEL_VERSION,
    totalMatches: ordered.length,
    trainingMatches: ordered.length - model.samples,
    testingMatches: model.samples,
    dateFrom: ordered[0]?.match_date,
    dateTo: ordered.at(-1)?.match_date,
    model,
    baseline,
    market,
    betting,
    calibrationError: calibrationError(modelSamples),
    selective: selectiveMetrics(modelSamples),
    perCompetition,
  };
}

export function estimateMatchFromHistory(input: {
  matches: MatchRow[];
  competition: string;
  homeKey: string;
  awayKey: string;
  homeTeam: string;
  awayTeam: string;
  odds?: { home: number | null; draw: number | null; away: number | null };
  cutoff?: string;
}) {
  const state = emptyLeagueState();
  for (const match of input.matches) updateState(state, match);
  const homeMatches = teamState(state, input.homeKey).appearances;
  const awayMatches = teamState(state, input.awayKey).appearances;
  if (state.matches < 120) {
    return { status: "blocked" as const, reason: `${input.competition}仅有${state.matches}场已完赛样本，低于120场联赛门槛。`, homeMatches, awayMatches };
  }
  if (homeMatches < 8 || awayMatches < 8) {
    return { status: "blocked" as const, reason: `球队身份已匹配，但样本不足：主队${homeMatches}场、客队${awayMatches}场，至少各需8场。`, homeMatches, awayMatches };
  }
  const market = normalizeMarketOdds(input.odds);
  const decimalProbabilities = blendedProbabilities(state, input.homeKey, input.awayKey, market);
  const decision = decisionFor(decimalProbabilities, input.homeTeam, input.awayTeam);
  const goalModel = estimateGoals({ matches: input.matches, homeKey: input.homeKey, awayKey: input.awayKey });
  const matchContext = estimateMatchContext({
    matches: input.matches,
    homeKey: input.homeKey,
    awayKey: input.awayKey,
    cutoff: input.cutoff,
  });
  return {
    status: "ready" as const,
    reason: `仅使用${input.competition}${state.matches}场赛前可得记录；主队${homeMatches}场、客队${awayMatches}场。`,
    probabilities: toPercentages(decimalProbabilities),
    decimalProbabilities,
    recommendation: decision.recommendation,
    predictedOutcome: decision.outcome,
    modelVersion: HISTORY_MODEL_VERSION,
    homeMatches,
    awayMatches,
    goalModel,
    matchContext,
  };
}

export type HistoricalMatchRow = MatchRow;
