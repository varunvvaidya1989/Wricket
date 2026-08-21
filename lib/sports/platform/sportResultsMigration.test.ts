import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260821060858_add_sport_results_and_statistics.sql'), 'utf8').toLowerCase();
const releaseValidation = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260821062745_validate_sport_platform_release.sql'), 'utf8').toLowerCase();

describe('sport results and statistics migration', () => {
  it('versions points rules without rewriting history', () => {
    expect(source).toContain('create table public.sport_points_rule_history');
    expect(source).toContain('sport_points_rule_snapshot');
    expect(source).toContain('points_rule_version');
  });
  it('rebuilds standings deterministically with stable tie breakers', () => {
    expect(source).toContain('rebuild_sport_competition_projections');
    expect(source).toContain('delete from public.sport_competition_standings');
    expect(source).toContain('row_number() over (order by points desc, won desc');
  });
  it('records corrections immutably before rebuilding projections', () => {
    expect(source).toContain('create table public.sport_result_revisions');
    expect(source).toContain('correct_sport_scoring_result');
    expect(source).toContain('perform app_private.rebuild_sport_competition_projections');
  });
  it('rebuilds every result projection after a rubber correction', () => {
    expect(releaseValidation).toContain('recalculate_sport_team_tie_state');
    expect(releaseValidation).toContain('winner_entry_id = winner');
    expect(releaseValidation).toContain('perform app_private.rebuild_sport_competition_projections');
    expect(releaseValidation).toContain('perform app_private.rebuild_sport_player_statistics');
  });
  it('projects opponent and doubles partnership statistics', () => {
    expect(source).toContain('create table public.sport_player_statistics');
    expect(source).toContain('opponent_profile_id');
    expect(source).toContain('create table public.sport_partnership_statistics');
    expect(source).toContain('rebuild_sport_player_statistics');
  });
  it('keeps stage progression manual and audited', () => {
    expect(source).toContain('create table public.sport_manual_progressions');
    expect(source).toContain('record_sport_manual_progression');
    expect(source).not.toContain('generate_draw');
  });
});
