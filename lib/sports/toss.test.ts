import { describe, expect, it } from 'vitest';

import { flipCoin } from './toss';

const participants = [
  { id: 'home', name: 'Home' },
  { id: 'away', name: 'Away' },
] as const;

describe('generic virtual coin toss', () => {
  it('awards the toss to the caller when the call matches', () => {
    const result = flipCoin(
      { participants, callerId: 'home', calledSide: 'HEADS' },
      () => 0.2,
      () => new Date('2026-08-01T10:00:00.000Z'),
    );
    expect(result).toMatchObject({
      landedSide: 'HEADS',
      winnerId: 'home',
      loserId: 'away',
      flippedAt: '2026-08-01T10:00:00.000Z',
    });
  });

  it('awards the toss to the opponent when the call misses', () => {
    expect(flipCoin(
      { participants, callerId: 'home', calledSide: 'HEADS' },
      () => 0.8,
    ).winnerId).toBe('away');
  });

  it('rejects invalid participants, callers, and random samples', () => {
    expect(() => flipCoin({
      participants: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }],
      callerId: 'same',
      calledSide: 'HEADS',
    })).toThrow();
    expect(() => flipCoin({ participants, callerId: 'other', calledSide: 'TAILS' })).toThrow();
    expect(() => flipCoin({ participants, callerId: 'home', calledSide: 'TAILS' }, () => 1)).toThrow();
  });
});
