import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818100000_add_cloud_competition_commands.sql',
), 'utf8').toLowerCase();

const mutations = [
  'create_sport_competition',
  'update_sport_competition',
  'transition_sport_competition',
  'transfer_sport_competition_ownership',
  'invite_sport_competition_organizer',
  'respond_sport_competition_organizer',
  'revoke_sport_competition_organizer',
  'add_sport_competition_stage',
  'add_sport_competition_division',
  'add_sport_competition_venue',
  'register_sport_league_player',
  'register_sport_tournament_squad',
  'set_sport_entry_status',
  'withdraw_sport_entry',
  'schedule_sport_fixture',
  'reschedule_sport_fixture',
  'cancel_sport_fixture',
  'check_in_sport_fixture_entry',
];

describe('cloud sport competition migration', () => {
  it('exposes audited trusted commands without direct table writes', () => {
    for (const mutation of mutations) {
      expect(migration).toContain(`function app_private.${mutation}`);
      expect(migration).toContain(`function public.${mutation}`);
      expect(migration).toMatch(new RegExp(`grant execute on function public\.${mutation}`));
      expect(migration).toMatch(new RegExp(`revoke all on function app_private\.${mutation}`));
    }
    expect(migration).toContain('write_sport_audit');
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.sport_/);
  });

  it('stores manual fixtures with optimistic concurrency and idempotency', () => {
    expect(migration).toContain('create table public.sport_fixtures');
    expect(migration).toContain('unique (competition_id, idempotency_key)');
    expect(migration).toContain('p_expected_schedule_version');
    expect(migration).toContain('p_expected_row_version');
    expect(migration).toContain('schedule changed; reload before saving');
    expect(migration).toContain('create table public.sport_fixture_check_ins');
  });

  it('does not expose automatic draw or pairing generation', () => {
    expect(migration).not.toMatch(/function\s+(public|app_private)\.(generate|create)_(draw|pairings)/);
    expect(migration).not.toContain('automatic_draw');
  });

  it('separates tournament squads and individual league players', () => {
    expect(migration).toContain("selected.kind <> 'league'");
    expect(migration).toContain("selected.kind <> 'tournament'");
    expect(migration).toContain('register_sport_league_player');
    expect(migration).toContain('register_sport_tournament_squad');
  });
});
