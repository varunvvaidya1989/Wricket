import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scoringMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824072400_restore_sport_scoring_match_policy_execution.sql',
), 'utf8');
const lineupMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824072615_restore_sport_team_tie_lineup_policy_execution.sql',
), 'utf8');
const eventMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824085634_restore_sport_scoring_event_execution.sql',
), 'utf8');

describe('sport scoring read policy repair migration', () => {
  it('allows the authenticated RLS policy to execute its private read helper', () => {
    expect(scoringMigration).toContain(
      'grant execute on function app_private.can_read_sport_scoring_match(uuid) to authenticated',
    );
    expect(scoringMigration).toContain("has_function_privilege(");
    expect(scoringMigration).toContain("'app_private.can_read_sport_scoring_match(uuid)'");
  });

  it('allows lineup RLS policies to execute their private read helper', () => {
    expect(lineupMigration).toContain(
      'grant execute on function app_private.can_read_sport_team_tie_lineup(uuid) to authenticated',
    );
    expect(lineupMigration).toContain("has_function_privilege(");
    expect(lineupMigration).toContain("'app_private.can_read_sport_team_tie_lineup(uuid)'");
  });

  it('allows the public scoring RPC to invoke its private event command', () => {
    expect(eventMigration).toContain(
      'grant execute on function app_private.append_sport_scoring_event(',
    );
    expect(eventMigration).toContain(
      "'app_private.append_sport_scoring_event(uuid,uuid,integer,uuid,text,jsonb,uuid)'",
    );
    expect(eventMigration).toContain('has_function_privilege(');
  });
});
