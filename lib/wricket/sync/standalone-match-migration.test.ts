import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260813113000_add_standalone_matches.sql'),
  'utf8',
).toLowerCase();

describe('standalone match migration', () => {
  it('offers teams the user belongs to and opponents from played matches', () => {
    expect(migration).toContain('function app_private.list_standalone_match_teams');
    expect(migration).toContain('function public.list_standalone_match_teams');
    expect(migration).toContain("then 'my_team'");
    expect(migration).toContain("else 'played_against'");
    expect(migration).toContain("match.status in ('in_progress', 'innings_break', 'follow_on_decision', 'completed')");
  });

  it('allows only the creator to manage a standalone match', () => {
    expect(migration).toContain('match.tournament_id is null and match.created_by = (select auth.uid())');
    expect(migration).toContain('function app_private.can_manage_match');
    expect(migration).toContain('function app_private.start_match_setup');
    expect(migration).toContain('function app_private.acquire_scoring_lease');
  });

  it('includes standalone matches in the eligible live feed', () => {
    expect(migration).toContain('function app_private.list_eligible_live_matches');
    expect(migration).toContain('(match.tournament_id is null and (');
    expect(migration).toContain('member.team_id in (match.team_a_id, match.team_b_id)');
  });

  it('keeps standalone match creation scoped to eligible teams', () => {
    expect(migration).toContain('policy "matches_write_standalone_creator"');
    expect(migration).toContain('app_private.is_standalone_team_eligible(team_a_id');
    expect(migration).toContain('app_private.is_standalone_team_eligible(team_b_id');
  });
});
