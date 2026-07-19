export interface SqlMigration {
  version: number;
  name: string;
  sql: string;
}

const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  batting_hand TEXT,
  bowling_style TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  start_date INTEGER NOT NULL,
  end_date INTEGER,
  points_win INTEGER NOT NULL DEFAULT 2,
  points_tie INTEGER NOT NULL DEFAULT 1,
  points_loss INTEGER NOT NULL DEFAULT 0,
  points_no_result INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS team_players (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  jersey_no INTEGER,
  is_captain INTEGER NOT NULL DEFAULT 0,
  is_keeper INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  format TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  team_a_id TEXT NOT NULL,
  team_b_id TEXT NOT NULL,
  venue TEXT,
  scheduled_at INTEGER,
  toss_winner_team_id TEXT,
  toss_choice TEXT,
  status TEXT NOT NULL DEFAULT 'SETUP',
  result_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL,
  FOREIGN KEY (team_a_id) REFERENCES teams(id) ON DELETE RESTRICT,
  FOREIGN KEY (team_b_id) REFERENCES teams(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS match_xis (
  match_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  batting_order INTEGER NOT NULL,
  is_captain INTEGER NOT NULL DEFAULT 0,
  is_keeper INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, team_id, user_id),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS innings (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  batting_team_id TEXT NOT NULL,
  bowling_team_id TEXT NOT NULL,
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_wickets INTEGER NOT NULL DEFAULT 0,
  total_balls INTEGER NOT NULL DEFAULT 0,
  is_closed INTEGER NOT NULL DEFAULT 0,
  is_follow_on INTEGER NOT NULL DEFAULT 0,
  target INTEGER,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS balls (
  id TEXT PRIMARY KEY,
  innings_id TEXT NOT NULL,
  over_no INTEGER NOT NULL,
  ball_in_over INTEGER NOT NULL,
  legal_ball_in_over INTEGER NOT NULL,
  striker_id TEXT NOT NULL,
  non_striker_id TEXT NOT NULL,
  bowler_id TEXT NOT NULL,
  runs_bat INTEGER NOT NULL DEFAULT 0,
  runs_extra INTEGER NOT NULL DEFAULT 0,
  extra_kind TEXT,
  is_legal INTEGER NOT NULL DEFAULT 1,
  is_wicket INTEGER NOT NULL DEFAULT 0,
  dismissal_kind TEXT,
  out_player_id TEXT,
  fielder_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (innings_id) REFERENCES innings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS score_adjustments (
  id TEXT PRIMARY KEY,
  innings_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  runs INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (innings_id) REFERENCES innings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS batter_retirements (
  id TEXT PRIMARY KEY,
  innings_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (innings_id) REFERENCES innings(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_balls_innings ON balls(innings_id);
CREATE INDEX IF NOT EXISTS idx_score_adjustments_innings ON score_adjustments(innings_id);
CREATE INDEX IF NOT EXISTS idx_batter_retirements_innings ON batter_retirements(innings_id);
CREATE INDEX IF NOT EXISTS idx_innings_match ON innings(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
`;

const SCORING_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS scoring_sessions (
  match_id TEXT PRIMARY KEY,
  innings_id TEXT NOT NULL,
  striker_id TEXT,
  non_striker_id TEXT,
  bowler_id TEXT,
  pending_prompt TEXT,
  pending_player_id TEXT,
  completed_over INTEGER,
  last_committed_event_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (innings_id) REFERENCES innings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scoring_sessions_innings ON scoring_sessions(innings_id);
`;

export const MIGRATIONS: SqlMigration[] = [
  {
    version: 1,
    name: 'initial_local_schema',
    sql: INITIAL_SCHEMA_SQL,
  },
  {
    version: 2,
    name: 'scoring_sessions',
    sql: SCORING_SESSIONS_SQL,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
export const SCHEMA_SQL = MIGRATIONS.map((migration) => migration.sql).join('\n');

export function getPendingMigrations(appliedVersion: number): SqlMigration[] {
  return MIGRATIONS.filter((migration) => migration.version > appliedVersion);
}

export interface MigrationDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
}

export async function runMigrations(db: MigrationDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  const appliedVersion = row?.version ?? 0;

  for (const migration of getPendingMigrations(appliedVersion)) {
    await db.execAsync(migration.sql);
    await db.runAsync(
      'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      migration.version,
      migration.name,
      Date.now(),
    );
  }

  await db.runAsync(
    'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
    'schema_version',
    String(SCHEMA_VERSION),
  );
}
