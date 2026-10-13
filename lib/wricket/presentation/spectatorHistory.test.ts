import { describe, expect, it } from 'vitest';
import { spectatorHistory } from './spectatorHistory';
import type { CloudMatchEvent } from '@/lib/supabase/liveMatchApi';
const ball = (id: string, sequence: number): CloudMatchEvent => ({ id: `server-${id}`, clientEventId: id, sequence, kind: 'BALL_RECORDED', payload: { runs_bat: 4 }, createdAt: '' });
describe('spectator history reconciliation', () => {
  it('removes a reversed ball without dropping an identical valid delivery or its correction notice', () => {
    const first = ball('one', 1), second = ball('two', 2);
    const undo: CloudMatchEvent = { ...ball('undo', 3), kind: 'BALL_CORRECTED', payload: { target_client_event_id: 'one' } };
    expect(spectatorHistory([first, undo, second])).toEqual([undo, second]);
  });
  it('preserves non-ball events and orders all innings without mutating the input', () => {
    const first = ball('one', 1);
    const adjustment = { ...ball('bonus', 4), kind: 'SCORE_ADJUSTED' };
    const source = [first, adjustment];
    expect(spectatorHistory(source)).toEqual([adjustment, first]);
    expect(source).toEqual([first, adjustment]);
  });
});
