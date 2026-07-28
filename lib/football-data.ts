import { COMPETITION_CATALOG } from "./competition-catalog";
import { canonicalTeamName } from "./team-identity";

type MatchInput = {
  homeTeam: string;
  awayTeam: string;
  competition: string;
  kickoff: string;
};

type Source = { title: string; url?: string; asOf?: string };

export type FootballEvidence = {
  status: "verified" | "partial" | "unavailable";
  provider: "API-Football";
  checkedAt: string;
  seasons: string[];
  facts: string[];
  missing: string[];
  sources: Source[];
  requestCount: number;
  plan?: string;
};

type LeaguePreset = {
  id: number;
  name: string;
  country?: string;
};

const LEAGUE_PRESETS: Array<LeaguePreset & { aliases: string[] }> = COMPETITION_CATALOG
  .filter((competition) => competition.apiFootballId)
  .map((competition) => ({
    id: competition.apiFootballId as number,
    name: competition.nameEn,
    aliases: [competition.code, competition.nameZh, competition.nameEn, ...competition.aliases],
  }));

const CACHE_TTL_MS = 15 * 60 * 1000;
const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

const asRecord = (value: unknown): Record<string, any> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, any>)
    : {};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s._-]+/g, "");
}

function presetForCompetition(value: string) {
  const target = normalize(value);
  return LEAGUE_PRESETS.find((preset) =>
    preset.aliases.some((alias) => normalize(alias) === target),
  );
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export async function collectFootballEvidence(
  input: MatchInput,
): Promise<FootballEvidence> {
  const { env } = await import("cloudflare:workers");
  const workerEnv = env as unknown as Record<string, string | undefined>;
  const apiKeys = [
    workerEnv.API_FOOTBALL_KEY_PRIMARY,
    workerEnv.API_FOOTBALL_KEY_SECONDARY,
    workerEnv.API_FOOTBALL_KEY,
    process.env.API_FOOTBALL_KEY_PRIMARY,
    process.env.API_FOOTBALL_KEY_SECONDARY,
    process.env.API_FOOTBALL_KEY,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const checkedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  if (!apiKeys.length) {
    return {
      status: "unavailable",
      provider: "API-Football",
      checkedAt,
      seasons: [],
      facts: [],
      missing: ["API-Football 数据源尚未配置"],
      sources: [],
      requestCount: 0,
      plan: "未配置",
    };
  }
  let requestCount = 0;
  const failures: string[] = [];

  async function apiGet(path: string, params: Record<string, string | number>) {
    const url = new URL(`https://v3.football.api-sports.io/${path}`);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, String(value)),
    );
    const cacheKey = url.toString();
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let lastError = "API-Football request failed";
    for (const apiKey of apiKeys) {
      requestCount += 1;
      const response = await fetch(url, {
        headers: { "x-apisports-key": apiKey },
        cf: { cacheTtl: CACHE_TTL_MS / 1000, cacheEverything: true },
      } as RequestInit);
      if (!response.ok) {
        lastError = `API-Football ${response.status}`;
        if (![401, 403, 429].includes(response.status)) throw new Error(lastError);
        continue;
      }
      const payload = asRecord(await response.json());
      const errors = asRecord(payload.errors);
      if (Object.keys(errors).length) {
        lastError = Object.values(errors).map(String).join("; ").slice(0, 160) || "API-Football upstream account error";
        continue;
      }
      memoryCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: payload,
      });
      return payload;
    }
    throw new Error(lastError);
  }

  try {
    const statusPayload = await apiGet("status", {});
    const statusResponse = asRecord(asRecord(statusPayload).response);
    const subscription = asRecord(statusResponse.subscription);
    const plan = String(subscription.plan || "未知套餐");
    const isFreePlan = plan.toLocaleLowerCase().includes("free");

    const preset = presetForCompetition(input.competition);
    const leaguePayload = await apiGet(
      "leagues",
      preset ? { id: preset.id } : { search: input.competition },
    );
    const leagueRows = asArray(asRecord(leaguePayload).response);
    const preferredLeague = leagueRows.find((row) => {
      const league = asRecord(asRecord(row).league);
      const country = asRecord(asRecord(row).country);
      return (
        (!preset || Number(league.id) === preset.id) &&
        (!preset?.country || country.name === preset.country)
      );
    }) || leagueRows[0];

    if (!preferredLeague) {
      return {
        status: "unavailable",
        provider: "API-Football",
        checkedAt,
        seasons: [],
        facts: [],
        missing: [`未在数据源中识别赛事：${input.competition}`],
        sources: [],
        requestCount,
        plan,
      };
    }

    const league = asRecord(asRecord(preferredLeague).league);
    const country = asRecord(asRecord(preferredLeague).country);
    const leagueId = Number(league.id);
    const seasonRows = asArray(asRecord(preferredLeague).seasons);
    const now = Date.now();
    const completedSeasons = seasonRows
      .filter((season) => {
        const end = new Date(String(asRecord(season).end || ""));
        return Number.isFinite(end.getTime()) && end.getTime() < now;
      })
      .sort((a, b) => Number(asRecord(b).year) - Number(asRecord(a).year))
      .slice(0, 3)
      .map((season) => Number(asRecord(season).year))
      .filter(Number.isFinite);

    const currentSeason = seasonRows.find(
      (season) => asRecord(season).current === true,
    );
    const fallbackYear = Number(asRecord(currentSeason).year) || new Date().getUTCFullYear();
    const seasons = isFreePlan
      ? [2024, 2023, 2022]
      : completedSeasons.length
        ? completedSeasons
        : [fallbackYear - 1, fallbackYear - 2, fallbackYear - 3];

    async function findTeam(displayName: string) {
      const searchName = canonicalTeamName(displayName);
      const payload = await apiGet("teams", { search: searchName });
      const rows = asArray(asRecord(payload).response);
      const exact = rows.find((row) => {
        const team = asRecord(asRecord(row).team);
        return normalize(String(team.name || "")) === normalize(searchName);
      });
      const sameCountry = rows.find((row) => {
        const team = asRecord(asRecord(row).team);
        return !country.name || team.country === country.name;
      });
      return asRecord(asRecord(exact || sameCountry || rows[0]).team);
    }

    const [home, away] = await Promise.all([
      findTeam(input.homeTeam),
      findTeam(input.awayTeam),
    ]);

    if (!home.id || !away.id) {
      return {
        status: "partial",
        provider: "API-Football",
        checkedAt,
        seasons: seasons.map(String),
        facts: [`已识别赛事：${league.name || input.competition}${country.name ? `（${country.name}）` : ""}`],
        missing: [
          !home.id ? `未识别主队：${input.homeTeam}` : "",
          !away.id ? `未识别客队：${input.awayTeam}` : "",
        ].filter(Boolean),
        sources: [{ title: "API-Football 赛事目录", url: "https://www.api-football.com/", asOf: checkedAt }],
        requestCount,
        plan,
      };
    }

    const facts: string[] = [
      `API-Football 已匹配：${home.name} vs ${away.name}，赛事 ${league.name || input.competition}${country.name ? `（${country.name}）` : ""}`,
    ];
    const missing: string[] = [];

    const historical = await Promise.all(
      seasons.flatMap((season) =>
        [home, away].map(async (team) => {
          try {
            const payload = await apiGet("teams/statistics", {
              league: leagueId,
              season,
              team: Number(team.id),
            });
            return { season, team, stats: asRecord(asRecord(payload).response) };
          } catch {
            failures.push(`${season}-${team.name}`);
            return { season, team, stats: {} };
          }
        }),
      ),
    );

    for (const row of historical) {
      const fixtures = asRecord(row.stats.fixtures);
      const goals = asRecord(row.stats.goals);
      const played = Number(asRecord(fixtures.played).total || 0);
      if (!played) continue;
      const wins = Number(asRecord(fixtures.wins).total || 0);
      const draws = Number(asRecord(fixtures.draws).total || 0);
      const losses = Number(asRecord(fixtures.loses).total || 0);
      const scored = Number(asRecord(asRecord(goals.for).total).total || 0);
      const conceded = Number(asRecord(asRecord(goals.against).total).total || 0);
      facts.push(
        `${row.season} 赛季 ${row.team.name}：${played} 场，${wins}胜${draws}平${losses}负，进${scored}球失${conceded}球。`,
      );
    }

    if (!facts.some((fact) => fact.includes("赛季"))) {
      missing.push("目标赛事近三个完整赛季的球队汇总统计暂不可用");
    }

    let fixtureId: number | undefined;
    if (isFreePlan) {
      missing.push(
        "当前免费套餐仅开放 2022–2024 历史数据，不含当前赛季实时伤停、首发与裁判",
      );
    } else try {
      const fixturePayload = await apiGet("fixtures/headtohead", {
        h2h: `${home.id}-${away.id}`,
        next: 1,
      });
      const match = asRecord(asArray(asRecord(fixturePayload).response)[0]);
      const fixture = asRecord(match.fixture);
      const fixtureLeague = asRecord(match.league);
      fixtureId = Number(fixture.id) || undefined;
      if (fixtureId) {
        facts.push(
          `下一次交锋：${formatDate(fixture.date)}，${fixtureLeague.name || input.competition}，场地 ${asRecord(fixture.venue).name || "待确认"}，主裁判 ${fixture.referee || "待指派"}。`,
        );
      } else {
        missing.push("尚未查询到双方下一场正式赛程");
      }
    } catch {
      missing.push("下一场赛程与裁判信息暂不可用");
    }

    if (fixtureId) {
      try {
        const injuryPayload = await apiGet("injuries", { fixture: fixtureId });
        const injuries = asArray(asRecord(injuryPayload).response).slice(0, 12);
        if (injuries.length) {
          for (const item of injuries) {
            const player = asRecord(asRecord(item).player);
            const team = asRecord(asRecord(item).team);
            facts.push(
              `伤停信息：${team.name || "球队待确认"} - ${player.name || "球员待确认"}（${player.reason || player.type || "原因待确认"}）。`,
            );
          }
        } else {
          missing.push("数据源暂未发布该场伤停名单");
        }
      } catch {
        missing.push("实时伤停信息暂不可用");
      }

      try {
        const lineupPayload = await apiGet("fixtures/lineups", { fixture: fixtureId });
        const lineups = asArray(asRecord(lineupPayload).response);
        if (lineups.length) {
          for (const item of lineups) {
            const team = asRecord(asRecord(item).team);
            const coach = asRecord(asRecord(item).coach);
            const starters = asArray(asRecord(item).startXI)
              .map((entry) => asRecord(asRecord(entry).player).name)
              .filter(Boolean)
              .slice(0, 11)
              .join("、");
            facts.push(
              `已发布阵容：${team.name || "球队待确认"}，阵型 ${asRecord(item).formation || "待确认"}，主教练 ${coach.name || "待确认"}${starters ? `，首发 ${starters}` : ""}。`,
            );
          }
        } else {
          missing.push("正式首发尚未发布；通常临近开球才可用");
        }
      } catch {
        missing.push("正式首发信息暂不可用");
      }
    }

    if (failures.length) {
      missing.push("部分赛季统计因赛事覆盖或接口限制未返回");
    }

    return {
      status: missing.length ? "partial" : "verified",
      provider: "API-Football",
      checkedAt,
      seasons: seasons.map(String),
      facts: facts.slice(0, 24),
      missing: [...new Set(missing)].slice(0, 10),
      sources: [
        {
          title: `API-Football · ${league.name || input.competition}`,
          url: "https://www.api-football.com/",
          asOf: checkedAt,
        },
      ],
      requestCount,
      plan,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 160) : "未知运行时错误";
    return {
      status: "unavailable",
      provider: "API-Football",
      checkedAt,
      seasons: [],
      facts: [],
      missing: [`足球数据服务暂时不可用：${reason}`],
      sources: [],
      requestCount,
      plan: `运行时错误：${reason}`,
    };
  }
}
