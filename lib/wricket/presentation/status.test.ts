import { describe, expect, it } from 'vitest';
import { connectionLabel, matchStatus, tournamentStatus } from './status';

describe('cricket presentation status', () => {
  it.each(['COMPLETED', 'ABANDONED', 'NO_RESULT', 'CANCELLED', 'WALKOVER'])('%s is terminal without a live indicator', status => {
    expect(matchStatus(status)).toMatchObject({ terminal: true, live: false });
  });
  it('keeps breaks, tournament progress and sync separate from live play', () => {
    expect(matchStatus('INNINGS_BREAK')).toEqual({ label: 'Innings break', live: false, terminal: false });
    expect(matchStatus('IN_PROGRESS').live).toBe(true);
    expect(tournamentStatus('ACTIVE')).toEqual({ label: 'In progress', live: false, terminal: false });
    expect(connectionLabel('LIVE')).toBe('Synced');
    expect(connectionLabel('PENDING')).toBe('Saved on this device');
  });
  it('does not invent an upcoming or live state for unknown data', () => {
    expect(matchStatus('unexpected')).toEqual({ label: 'Status unavailable', live: false, terminal: false });
    expect(tournamentStatus('unexpected').label).toBe('Status unavailable');
  });
});
