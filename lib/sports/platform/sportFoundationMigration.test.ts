import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260817120000_add_sport_competition_foundation.sql',
), 'utf8').toLowerCase();
const hardeningMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260817124500_harden_sport_foundation_identity.sql',
), 'utf8').toLowerCase();

const foundationTables = [
  'sport_feature_flags',
  'sport_clubs',
  'sport_club_access',
  'sport_club_memberships',
  'sport_teams',
  'sport_team_access',
  'sport_team_memberships',
  'sport_competitions',
  'sport_competition_access',
  'sport_competition_stages',
  'sport_competition_entries',
  'sport_tournament_squads',
  'sport_squad_members',
  'sport_league_players',
  'sport_audit_events',
];

describe('non-cricket sport competition foundation migration', () => {
  it('creates the approved foundation tables without changing cricket tables', () => {
    for (const table of foundationTables) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration).not.toMatch(/alter table public\.(tournaments|teams|players|matches)\b/);
    expect(migration).not.toMatch(/create table public\.(tournaments|teams|players|matches)\b/);
    expect(migration).not.toContain('create table public.sport_players');
  });

  it('enables RLS on every foundation table and grants clients read-only access', () => {
    for (const table of foundationTables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain('grant select on public.sport_feature_flags to anon, authenticated');
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all).*to authenticated/);
  });

  it('enforces account-backed identities and separate entry kinds', () => {
    expect(migration).toContain('account_has_active_sport_profile');
    expect(migration).toContain('player cannot represent multiple squads in one competition division');
    expect(migration).toContain('tournament entries must contain exactly one squad');
    expect(migration).toContain('league entries must contain exactly one player');
    expect(migration).toContain('deferrable initially deferred');
    expect(hardeningMigration).toContain('every sport participant must have a sportstage account');
    expect(hardeningMigration).toContain('team membership requires accepted membership in the same club');
    expect(hardeningMigration).toContain('squad registration requires active reusable-team membership');
    expect(hardeningMigration).toContain('pg_advisory_xact_lock');
  });

  it('ships all platform capabilities disabled', () => {
    expect(migration).toContain("select 'cloud_competitions', sport.id, false, 0");
    expect(migration).toContain("('public_live', false, 0)");
    expect(migration).toContain("('offline_scoring', false, 0)");
    expect(migration).toContain("('follows_and_insights', false, 0)");
  });

  it('keeps ownership contextual and audit history append-only for clients', () => {
    expect(migration).toContain('owner_account_id uuid not null');
    expect(migration).toContain("role text not null check (role = 'organizer')");
    expect(migration).toContain("role text not null check (role in ('manager', 'captain'))");
    expect(migration).toContain("comment on table public.sport_audit_events is 'append-only audit history");
  });
});
