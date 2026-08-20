import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260820143930_complete_team_tie_operations.sql',
), 'utf8').toLowerCase();

describe('team-tie operations migration', () => {
  it('models ordered reusable templates and per-rubber eligibility', () => {
    expect(migration).toContain('create table public.sport_team_tie_templates');
    expect(migration).toContain('create table public.sport_fixture_match_rules');
    expect(migration).toContain("'mixed_doubles'");
    expect(migration).toContain('required_eligibility');
    expect(migration).toContain('apply_sport_team_tie_template');
  });

  it('enforces deadline, locked-roster eligibility, limits, and schedule conflicts', () => {
    expect(migration).toContain('lineup_submission_deadline');
    expect(migration).toContain('member.eligibility @>');
    expect(migration).toContain('max_rubbers_per_player');
    expect(migration).toContain('a lineup player has a schedule conflict');
    expect(migration).toContain('lineup is locked or version is out of date');
  });

  it('hides unrevealed opponent lineups and retains immutable locked snapshots', () => {
    expect(migration).toContain('after_both_submitted');
    expect(migration).toContain('can_read_sport_team_tie_lineup');
    expect(migration).toContain('locked_snapshot');
    expect(migration).toContain('both approved squad lineups are required for every rubber before play begins');
  });

  it('requires audited manager or official control for reviews, overrides, and outcomes', () => {
    expect(migration).toContain('can_control_sport_team_tie');
    expect(migration).toContain('an owner or official override requires an audit reason');
    expect(migration).toContain('review_sport_team_tie_lineup');
    expect(migration).toContain('record_sport_team_tie_rubber_result');
  });

  it('derives majority thresholds and retains every scheduled rubber after a clinch', () => {
    expect(migration).toContain('majority_threshold');
    expect(migration).toContain("'clinched'");
    expect(migration).toContain('sport_fixture_match_results');
    expect(migration).toContain("status in ('in_progress', 'clinched')");
  });
});
