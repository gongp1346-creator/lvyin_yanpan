type MarketOption = { label: string; value: string; odds: string };
type MarketSnapshotInput = {
  id: string;
  matchNumber: string;
  competitionCode: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  odds: { home: string; draw: string; away: string } | null;
  markets?: { handicap?: { line?: string; options?: MarketOption[] } };
};

const MARKET_SCHEMA = `CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_key TEXT NOT NULL UNIQUE,
  match_id TEXT NOT NULL,
  match_number TEXT,
  competition TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  odds_home REAL,
  odds_draw REAL,
  odds_away REAL,
  handicap_line REAL,
  handicap_home REAL,
  handicap_draw REAL,
  handicap_away REAL,
  source TEXT NOT NULL
)`;

async function database() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("市场快照数据库尚未绑定。");
  return env.DB;
}

async function ensureSchema() {
  const db = await database();
  await db.batch([
    db.prepare(MARKET_SCHEMA),
    db.prepare("CREATE INDEX IF NOT EXISTS market_snapshots_match_time_idx ON market_snapshots (match_id, captured_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS market_snapshots_teams_time_idx ON market_snapshots (competition, home_team, away_team, kickoff, captured_at)"),
  ]);
  return db;
}

function numberOf(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionOdds(options: MarketOption[] | undefined, value: string) {
  return numberOf(options?.find((option) => option.value === value)?.odds);
}

function halfHourBucket(date: Date) {
  const copy = new Date(date);
  copy.setUTCMinutes(copy.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
  return copy.toISOString();
}

export async function saveMarketSnapshots(matches: MarketSnapshotInput[], source: string) {
  if (!matches.length) return;
  const db = await ensureSchema();
  const now = new Date();
  const capturedAt = now.toISOString();
  const bucket = halfHourBucket(now);
  for (let offset = 0; offset < matches.length; offset += 20) {
    const chunk = matches.slice(offset, offset + 20);
    await db.batch(chunk.map((match) => {
      const handicap = match.markets?.handicap;
      return db.prepare(`INSERT OR IGNORE INTO market_snapshots (
        id, snapshot_key, match_id, match_number, competition, home_team, away_team,
        kickoff, captured_at, odds_home, odds_draw, odds_away, handicap_line,
        handicap_home, handicap_draw, handicap_away, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), `${match.id}|${bucket}`, match.id, match.matchNumber,
        match.competitionCode, match.homeTeam, match.awayTeam, match.kickoff, capturedAt,
        numberOf(match.odds?.home), numberOf(match.odds?.draw), numberOf(match.odds?.away),
        numberOf(handicap?.line), optionOdds(handicap?.options, "3"),
        optionOdds(handicap?.options, "1"), optionOdds(handicap?.options, "0"), source,
      );
    }));
  }
}

type SnapshotRow = {
  captured_at: string;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  handicap_line: number | null;
  handicap_home: number | null;
  handicap_draw: number | null;
  handicap_away: number | null;
  source: string;
};

function movement(first: number | null, latest: number | null) {
  if (first === null || latest === null) return null;
  return Number((latest - first).toFixed(3));
}

export async function getMarketMovement(input: { competition: string; homeTeam: string; awayTeam: string; kickoff: string }) {
  const db = await ensureSchema();
  const rows = await db.prepare(`SELECT captured_at, odds_home, odds_draw, odds_away,
    handicap_line, handicap_home, handicap_draw, handicap_away, source
    FROM market_snapshots WHERE competition = ? AND home_team = ? AND away_team = ?
    AND kickoff = ? ORDER BY captured_at ASC LIMIT 48`).bind(
      input.competition, input.homeTeam, input.awayTeam, input.kickoff,
    ).all<SnapshotRow>();
  if (!rows.results.length) return { status: "missing" as const, snapshots: 0, summary: "尚未采集到本场盘口快照。" };
  const first = rows.results[0];
  const latest = rows.results[rows.results.length - 1];
  if (rows.results.length < 2) {
    return { status: "single" as const, snapshots: 1, firstAt: first.captured_at, latestAt: latest.captured_at, summary: "目前只有一个可核验时间点，只能描述当前定价，不能判断变盘或诱盘。" };
  }
  return {
    status: "ready" as const,
    snapshots: rows.results.length,
    firstAt: first.captured_at,
    latestAt: latest.captured_at,
    source: latest.source,
    opening: first,
    latest,
    changes: {
      home: movement(first.odds_home, latest.odds_home), draw: movement(first.odds_draw, latest.odds_draw), away: movement(first.odds_away, latest.odds_away),
      handicapLine: movement(first.handicap_line, latest.handicap_line), handicapHome: movement(first.handicap_home, latest.handicap_home),
      handicapDraw: movement(first.handicap_draw, latest.handicap_draw), handicapAway: movement(first.handicap_away, latest.handicap_away),
    },
    summary: `已采集${rows.results.length}个时间点。胜平负SP：主胜${first.odds_home ?? "--"}→${latest.odds_home ?? "--"}，平${first.odds_draw ?? "--"}→${latest.odds_draw ?? "--"}，客胜${first.odds_away ?? "--"}→${latest.odds_away ?? "--"}；让球${first.handicap_line ?? "--"}→${latest.handicap_line ?? "--"}，让球胜平负SP ${first.handicap_home ?? "--"}/${first.handicap_draw ?? "--"}/${first.handicap_away ?? "--"}→${latest.handicap_home ?? "--"}/${latest.handicap_draw ?? "--"}/${latest.handicap_away ?? "--"}。`,
  };
}