import { describe, expect, it } from 'vitest';
import { effectiveScoringEvents } from './scoringHydrationEvents';

describe('restoring corrected scoring history', () => {
  it('removes only the corrected delivery and preserves client IDs for subsequent Undo', () => {
    const first = { client_event_id: 'ball-1', kind: 'BALL_RECORDED', payload: { runs_bat: 4 } };
    const second = { client_event_id: 'ball-2', kind: 'BALL_RECORDED', payload: { runs_bat: 4 } };
    const extra = { client_event_id: 'bonus', kind: 'SCORE_ADJUSTED', payload: { runs: 5 } };
    const correction = { client_event_id: 'undo-1', kind: 'BALL_CORRECTED', payload: { target_client_event_id: 'ball-1' } };
    expect(effectiveScoringEvents([first, second, extra, correction])).toEqual([second, extra]);
  });

  it('keeps valid deliveries when a correction has no matching client identity', () => {
    const ball = { client_event_id: 'ball', kind: 'BALL_RECORDED', payload: null };
    expect(effectiveScoringEvents([ball, { client_event_id: 'undo', kind: 'BALL_CORRECTED', payload: {} }])).toEqual([ball]);
  });
});
