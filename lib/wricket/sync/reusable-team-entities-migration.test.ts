import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260813090000_add_reusable_team_entities.sql'),
  'utf8',
).toLowerCase();

describe('reusable team entities migration', () => {
  it('separates reusable sources from tournament participation teams', () => {
    expect(migration).toContain('entity_owner_id uuid');
    expect(migration).toContain('source_team_id uuid references public.teams');
    expect(migration).toContain('teams_one_source_per_tournament_idx');
    expect(migration).toContain('tournament_id is null');
    expect(migration).toContain('set entity_owner_id = tournament.created_by');
  });

  it('copies both cricket roster and account membership when entering a tournament', () => {
    expect(migration).toContain('function public.enter_team_in_tournament');
    expect(migration).toContain('insert into public.team_players');
    expect(migration).toContain('insert into public.team_account_members');
    expect(migration).toContain('only the tournament owner can add participating teams');
    expect(migration).toContain('you can only enter a team you own or belong to');
  });

  it('keeps entity management owner or captain scoped', () => {
    expect(migration).toContain('team.entity_owner_id = (select auth.uid())');
    expect(migration).toContain("member.role = 'captain'");
    expect(migration).not.toContain('to anon;\ngrant execute on function public.enter_team_in_tournament');
  });
});
