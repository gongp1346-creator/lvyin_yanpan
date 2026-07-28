type GoalMatch = {
  match_date: string;
  home_key: string;
  away_key: string;
  home_goals: number;
  away_goals: number;
};

type WeightedTotals = { weight: number; scored: number; conceded: number; matches: number };

const emptyTotals = (): WeightedTotals => ({ weight: 0, scored: 0, conceded: 0, matches: 0 });
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function poisson(lambda: number, goals: number) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}

function shrink(rate: number, sampleWeight: number, prior = 1, priorWeight = 8) {
  return (rate * sampleWeight + prior * priorWeight) / (sampleWeight + priorWeight);
}

function dixonColesTau(homeGoals: number, awayGoals: number, homeLambda: number, awayLambda: number, rho: number) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - homeLambda * awayLambda * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + homeLambda * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + awayLambda * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function estimateGoals(input: { matches: GoalMatch[]; homeKey: string; awayKey: string }) {
  const valid = input.matches.filter((match) => Number.isFinite(match.home_goals) && Number.isFinite(match.away_goals));
  if (valid.length < 120) return { status: "blocked" as const, reason: `有效比分样本${valid.length}场，低于120场门槛。` };

  const referenceDate = valid.reduce((latest, match) => match.match_date > latest ? match.match_date : latest, valid[0].match_date);
  const referenceTime = new Date(`${referenceDate}T12:00:00Z`).getTime();
  let leagueWeight = 0;
  let leagueHomeGoals = 0;
  let leagueAwayGoals = 0;
  const homeHome = emptyTotals();
  const awayAway = emptyTotals();

  for (const match of valid) {
    const matchTime = new Date(`${match.match_date}T12:00:00Z`).getTime();
    const ageDays = Math.max(0, (referenceTime - matchTime) / 86_400_000);
    const weight = Math.exp(-ageDays / 540);
    leagueWeight += weight;
    leagueHomeGoals += match.home_goals * weight;
    leagueAwayGoals += match.away_goals * weight;
    if (match.home_key === input.homeKey) {
      homeHome.weight += weight;
      homeHome.scored += match.home_goals * weight;
      homeHome.conceded += match.away_goals * weight;
      homeHome.matches += 1;
    }
    if (match.away_key === input.awayKey) {
      awayAway.weight += weight;
      awayAway.scored += match.away_goals * weight;
      awayAway.conceded += match.home_goals * weight;
      awayAway.matches += 1;
    }
  }

  if (homeHome.matches < 5 || awayAway.matches < 5 || !leagueWeight) {
    return { status: "blocked" as const, reason: `主队主场${homeHome.matches}场、客队客场${awayAway.matches}场，至少各需5场。` };
  }

  const leagueHomeAverage = leagueHomeGoals / leagueWeight;
  const leagueAwayAverage = leagueAwayGoals / leagueWeight;
  const homeAttack = shrink((homeHome.scored / homeHome.weight) / leagueHomeAverage, homeHome.weight);
  const homeDefence = shrink((homeHome.conceded / homeHome.weight) / leagueAwayAverage, homeHome.weight);
  const awayAttack = shrink((awayAway.scored / awayAway.weight) / leagueAwayAverage, awayAway.weight);
  const awayDefence = shrink((awayAway.conceded / awayAway.weight) / leagueHomeAverage, awayAway.weight);
  const homeExpected = clamp(leagueHomeAverage * homeAttack * awayDefence, 0.2, 3.8);
  const awayExpected = clamp(leagueAwayAverage * awayAttack * homeDefence, 0.2, 3.8);
  const rho = -0.08;
  const cells: Array<{ home: number; away: number; probability: number }> = [];
  let total = 0;
  for (let home = 0; home <= 8; home += 1) {
    for (let away = 0; away <= 8; away += 1) {
      const probability = poisson(homeExpected, home) * poisson(awayExpected, away)
        * dixonColesTau(home, away, homeExpected, awayExpected, rho);
      cells.push({ home, away, probability });
      total += probability;
    }
  }
  for (const cell of cells) cell.probability /= total;
  const probabilityOf = (predicate: (cell: typeof cells[number]) => boolean) =>
    cells.filter(predicate).reduce((sum, cell) => sum + cell.probability, 0);
  const percent = (value: number) => Number((value * 100).toFixed(1));
  const likelyScores = [...cells].sort((a, b) => b.probability - a.probability).slice(0, 5).map((cell) => ({
    score: `${cell.home}-${cell.away}`,
    probability: percent(cell.probability),
  }));

  return {
    status: "ready" as const,
    version: "dixon-coles-v1",
    expectedGoals: { home: Number(homeExpected.toFixed(2)), away: Number(awayExpected.toFixed(2)) },
    probabilities: {
      homeWin: percent(probabilityOf((cell) => cell.home > cell.away)),
      draw: percent(probabilityOf((cell) => cell.home === cell.away)),
      awayWin: percent(probabilityOf((cell) => cell.home < cell.away)),
      over25: percent(probabilityOf((cell) => cell.home + cell.away >= 3)),
      bothTeamsScore: percent(probabilityOf((cell) => cell.home > 0 && cell.away > 0)),
      homeWinBy2Plus: percent(probabilityOf((cell) => cell.home - cell.away >= 2)),
      awayWinBy2Plus: percent(probabilityOf((cell) => cell.away - cell.home >= 2)),
    },
    likelyScores,
    samples: { league: valid.length, homeAtHome: homeHome.matches, awayAtAway: awayAway.matches },
    reason: `使用${valid.length}场联赛比分，主队主场${homeHome.matches}场、客队客场${awayAway.matches}场；采用540天时间衰减、8场先验收缩和Dixon-Coles低比分修正。`,
  };
}
