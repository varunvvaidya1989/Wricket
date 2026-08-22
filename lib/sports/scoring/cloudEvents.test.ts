import { describe, expect, it } from 'vitest';

import { activePointEvents, lastActivePointEvent } from './cloudEvents';

describe('cloud scoring event replay', () => {
  it('replays active points by sequence and retains gaps created by an undo event', () => {
    const events = [
      { sequence: 3, clientEventId: 'point-b', kind: 'POINT', payload: { winner: 1 }, createdAt: '2026-08-21T12:00:03.000Z' },
      { sequence: 2, clientEventId: 'point-a', kind: 'POINT', payload: { winner: 0 }, createdAt: '2026-08-21T12:00:02.000Z' },
      { sequence: 4, clientEventId: 'undo-a', kind: 'UNDO', payload: {}, reversesClientEventId: 'point-a', createdAt: '2026-08-21T12:00:04.000Z' },
    ];

    expect(activePointEvents(events)).toEqual([
      { type: 'POINT', sequence: 3, winner: 1, occurredAt: Date.parse('2026-08-21T12:00:03.000Z') },
    ]);
    expect(lastActivePointEvent(events)?.clientEventId).toBe('point-b');
  });

  it('excludes malformed point payloads from the sport rules engine', () => {
    expect(activePointEvents([
      { sequence: 1, clientEventId: 'invalid', kind: 'POINT', payload: { winner: 'A' }, createdAt: '2026-08-21T12:00:01.000Z' },
    ])).toEqual([]);
  });
});
