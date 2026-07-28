type ContextMatch = {
  match_date: string;
  home_key: string;
  away_key: string;
  home_goals: number;
  away_goals: number;
};

type TeamTable = { played: number; points: number; goalsFor: number; goalsAgainst: number };

const daysBetween = (later: string, earlier: string) =>
  Math.round((new Date(`${later}T12:00:00Z`).getTime() - new Date(`${earlier}T12:00:00Z`).getTime()) / 86_400_000);

function currentSeason(matches: ContextMatch[]) {
  const ordered = [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date));
  if (!ordered.length) return [];
  let start = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (daysBetween(ordered[index].match_date, ordered[index - 1].match_date) >= 40) start = index;
  }
  const segment = ordered.slice(start);
  return segment.length >= 20 ? segment : ordered.filter((match) => daysBetween(ordered[ordered.length - 1].match_date, match.match_date) <= 240);
}

function buildTable(matches: ContextMatch[]) {
  const table = new Map<string, TeamTable>();
  const row = (key: string) => {
    const existing = table.get(key) || { played: 0, points: 0, goalsFor: 0, goalsAgainst: 0 };
    table.set(key, existing);
    return existing;
  };
  for (const match of matches) {
    const home = row(match.home_key);
    const away = row(match.away_key);
    home.played += 1;
    away.played += 1;
    home.goalsFor += match.home_goals;
    home.goalsAgainst += match.away_goals;
    away.goalsFor += match.away_goals;
    away.goalsAgainst += match.home_goals;
    if (match.home_goals > match.away_goals) home.points += 3;
    else if (match.home_goals < match.away_goals) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }
  return [...table.entries()].sort((a, b) =>
    b[1].points - a[1].points
    || (b[1].goalsFor - b[1].goalsAgainst) - (a[1].goalsFor - a[1].goalsAgainst)
    || b[1].goalsFor - a[1].goalsFor,
  );
}

function scheduleFor(matches: ContextMatch[], teamKey: string, cutoff: string) {
  const appearances = matches.filter((match) => match.home_key === teamKey || match.away_key === teamKey);
  const latest = appearances[appearances.length - 1];
  return {
    restDays: latest ? daysBetween(cutoff, latest.match_date) : null,
    matchesLast14: appearances.filter((match) => daysBetween(cutoff, match.match_date) >= 0 && daysBetween(cutoff, match.match_date) <= 14).length,
    lastMatchDate: latest?.match_date || null,
  };
}

export function estimateMatchContext(input: { matches: ContextMatch[]; homeKey: string; awayKey: string; cutoff?: string }) {
  const valid = input.matches.filter((match) => Number.isFinite(match.home_goals) && Number.isFinite(match.away_goals));
  const season = currentSeason(valid);
  const table = buildTable(season);
  const homeIndex = table.findIndex(([key]) => key === input.homeKey);
  const awayIndex = table.findIndex(([key]) => key === input.awayKey);
  if (season.length < 20 || homeIndex < 0 || awayIndex < 0) {
    return { status: "blocked" as const, reason: "当前赛季积分样本或球队匹配不足，战意不作推断。" };
  }
  const teams = table.length;
  const expectedMatches = Math.max(0, (teams - 1) * 2);
  const leaderPoints = table[0][1].points;
  const relegationStart = Math.max(0, teams - Math.min(3, Math.max(1, Math.floor(teams * 0.15))));
  const cutoff = input.cutoff || season[season.length - 1].match_date;
  const describe = (index: number, key: string) => {
    const stats = table[index][1];
    const remaining = Math.max(0, expectedMatches - stats.played);
    const pointsToLeader = Math.max(0, leaderPoints - stats.points);
    const relegationLinePoints = table[relegationStart]?.[1].points ?? 0;
    const pointsAboveRelegation = stats.points - relegationLinePoints;
    const schedule = scheduleFor(valid, key, cutoff);
    const pressures: string[] = [];
    if (remaining <= 10 && pointsToLeader <= remaining * 3) pressures.push(`仍在理论争冠范围，落后榜首${pointsToLeader}分`);
    if (index >= relegationStart) pressures.push("当前位于估算降级区");
    else if (remaining <= 10 && pointsAboveRelegation <= 6) pressures.push(`距离估算降级线仅${pointsAboveRelegation}分`);
    if (!pressures.length) pressures.push("未识别到可量化的争冠或保级紧迫信号");
    const risks: string[] = [];
    if (schedule.restDays !== null && schedule.restDays <= 3) risks.push(`仅休息${schedule.restDays}天`);
    if (schedule.matchesLast14 >= 4) risks.push(`近14天已赛${schedule.matchesLast14}场`);
    return {
      rank: index + 1,
      teams,
      played: stats.played,
      points: stats.points,
      goalDifference: stats.goalsFor - stats.goalsAgainst,
      estimatedRemaining: remaining,
      pointsToLeader,
      pointsAboveRelegation,
      pressure: pressures,
      schedule,
      risks,
    };
  };
  return {
    status: "ready" as const,
    version: "table-context-v1",
    seasonMatches: season.length,
    home: describe(homeIndex, input.homeKey),
    away: describe(awayIndex, input.awayKey),
    caveat: "积分榜由本地完赛记录重建；杯赛晋级条件、官方扣分和跨阶段赛制仍需官方赛制数据确认。",
  };
}
