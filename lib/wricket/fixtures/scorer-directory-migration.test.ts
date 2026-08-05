import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260804091557_scorer_directory_and_assignments.sql'),
  'utf8',
);

describe('scorer directory migration', () => {
  it('creates separate scorer profiles and tournament assignments', () => {
    expect(migration).toContain('create table public.scorers');
    expect(migration).toContain('create table public.tournament_scorers');
    expect(migration).toContain('alter table public.scorers enable row level security');
    expect(migration).toContain('alter table public.tournament_scorers enable row level security');
  });

  it('restricts scorer management to the tournament owner', () => {
    expect(migration).toContain('app_private.is_tournament_owner(p_tournament_id)');
    expect(migration).toContain('Only the tournament owner can search scorers');
    expect(migration).toContain('Only the tournament owner can assign scorers');
    expect(migration).toContain('Only the tournament owner can remove scorers');
  });

  it('keeps existing scoring authorization in sync', () => {
    expect(migration).toContain("values (p_tournament_id, p_account_id, 'SCORER', 'ACTIVE')");
    expect(migration).toContain("account_id = selected_account_id and role = 'SCORER'");
  });
});
