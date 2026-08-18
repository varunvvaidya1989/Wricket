import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818134000_add_team_tie_match_drafts.sql',
), 'utf8').toLowerCase();
const guardMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818135000_require_team_tie_drafts.sql',
), 'utf8').toLowerCase();
const hardenedGuardMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818136000_harden_team_tie_schedule_guard.sql',
), 'utf8').toLowerCase();

describe('team-tie match draft migration', () => {
  it('models ordered match formats below a tournament team tie', () => {
    expect(migration).toContain('create table public.sport_fixture_matches');
    expect(migration).toContain("match_format in ('singles', 'doubles')");
    expect(migration).toContain('unique (fixture_id, display_order)');
  });

  it('provides atomic create and optimistic draft-update commands', () => {
    expect(migration).toContain('function app_private.schedule_sport_team_tie');
    expect(migration).toContain('function app_private.update_sport_team_tie_matches');
    expect(migration).toContain('schedule changed; reload before saving');
    expect(migration).toContain('team_tie_draft_updated');
  });

  it('backfills existing tournament fixtures without changing their schedule', () => {
    expect(migration).toContain("where competition.kind = 'tournament'");
    expect(migration).toContain("'match 1'");
    expect(migration).toContain('deprecated compatibility field');
  });

  it('registers squads independently of the deprecated competition format', () => {
    const registration = migration.slice(migration.indexOf(
      'function app_private.register_sport_tournament_squad',
    ));
    expect(registration).toContain("if roster_count < 1 then raise exception 'team needs at least one active player'");
    expect(registration).not.toContain('eligibility ? selected.match_format');
  });

  it('prevents older clients from creating tournament fixtures without a draft', () => {
    expect(guardMigration).toContain("if competition_kind = 'tournament'");
    expect(guardMigration).toContain('tournament fixtures require an ordered team-tie match draft');
    expect(guardMigration).toContain('app_private.schedule_sport_fixture');
    expect(hardenedGuardMigration).toContain('app_private.require_managed_competition');
  });
});
