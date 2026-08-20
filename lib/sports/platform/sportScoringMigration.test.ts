import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260820150350_add_sport_scoring_events.sql',
), 'utf8').toLowerCase();

describe('sport scoring migration', () => {
  it('stores immutable, ordered, idempotent non-cricket scoring events', () => {
    expect(migration).toContain('create table public.sport_scoring_events');
    expect(migration).toContain('unique (scoring_match_id, sequence)');
    expect(migration).toContain('unique (scoring_match_id, client_event_id)');
    expect(migration).toContain('score changed; reconcile before submitting more events');
  });

  it('requires explicit doubles order and authorized lease ownership', () => {
    expect(migration).toContain('side_a_players');
    expect(migration).toContain('side_b_players');
    expect(migration).toContain('sport_scoring_leases');
    expect(migration).toContain('another scoring device currently holds this match');
    expect(migration).toContain('can_score_sport_scoring_match');
  });

  it('supports lifecycle, correction, undo, and exactly-once result propagation', () => {
    expect(migration).toContain("'retirement', 'walkover', 'abandoned', 'correction', 'undo', 'completed'");
    expect(migration).toContain('correction references an unknown scoring event');
    expect(migration).toContain('this rubber result was already propagated');
    expect(migration).toContain('record_sport_team_tie_rubber_result');
  });

  it('uses RLS and read-only direct access for spectators', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on public.sport_scoring_matches');
    expect(migration).toContain('grant select on public.sport_scoring_matches');
  });
});
