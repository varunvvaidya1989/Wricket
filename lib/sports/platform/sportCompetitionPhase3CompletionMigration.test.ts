import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818130000_complete_phase3_management.sql',
), 'utf8').toLowerCase();

describe('remaining Phase 3 management migration', () => {
  it('enforces division capacity at the table boundary', () => {
    expect(migration).toContain('sport_competition_entries_enforce_capacity');
    expect(migration).toContain('division registration capacity has been reached');
    expect(migration).toContain('for update');
  });

  it('provides complete-set atomic manual fixture ordering', () => {
    expect(migration).toContain('function app_private.reorder_sport_fixtures');
    expect(migration).toContain('fixture order must contain every competition fixture exactly once');
    expect(migration).toContain('fixtures_reordered');
  });

  it('bounds entrant check-in while preserving organizer overrides', () => {
    expect(migration).toContain("interval '60 minutes'");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain('fixture check-in is not open');
  });

  it('adds versioned points and account-backed fixture officials', () => {
    expect(migration).toContain('create table public.sport_competition_points_rules');
    expect(migration).toContain('points rules changed; reload before saving');
    expect(migration).toContain('create table public.sport_fixture_officials');
    expect(migration).toContain("role in ('scorekeeper', 'referee')");
  });

  it('adds audited update and delete commands for owner-defined resources', () => {
    expect(migration).toContain('function app_private.update_sport_competition_resource');
    expect(migration).toContain('function app_private.delete_sport_competition_resource');
    expect(migration).toContain("clean_type || '_updated'");
    expect(migration).toContain("clean_type || '_deleted'");
  });
});
