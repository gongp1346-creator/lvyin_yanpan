CREATE TABLE IF NOT EXISTS market_snapshots (
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
);

CREATE INDEX IF NOT EXISTS market_snapshots_match_time_idx
  ON market_snapshots (match_id, captured_at);

CREATE INDEX IF NOT EXISTS market_snapshots_teams_time_idx
  ON market_snapshots (competition, home_team, away_team, kickoff, captured_at);
