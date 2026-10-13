import { describe, expect, it } from 'vitest';
import { flipCoin } from '@/lib/sports/toss';
import { initialToss, tossReducer } from './tossState';

const result = flipCoin({ participants: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], callerId: 'a', calledSide: 'HEADS' }, () => 0.1);
const teams = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as const;
describe('match setup toss ownership', () => {
  it('restores a locked result from an account-scoped setup draft', () => {
    const landed = flipCoin({ participants: teams, callerId: 'a', calledSide: 'HEADS' }, () => 0.1);
    const restored = tossReducer(initialToss, { type: 'restore', state: { mode: 'VIRTUAL', winnerId: 'a', choice: 'BAT', landed } });
    expect(restored).toMatchObject({ mode: 'VIRTUAL', winnerId: 'a', choice: 'BAT', landed });
    expect(tossReducer(restored, { type: 'land', result: landed })).toBe(restored);
  });
  it('binds a virtual result and refuses a reroll or switch to manual', () => {
    const landed = tossReducer(tossReducer(initialToss, { type: 'mode', mode: 'VIRTUAL' }), { type: 'land', result });
    expect(tossReducer(landed, { type: 'land', result: { ...result, winnerId: 'b' } })).toBe(landed);
    expect(tossReducer(landed, { type: 'mode', mode: 'MANUAL' })).toBe(landed);
    expect(tossReducer(landed, { type: 'manual', winnerId: 'b' })).toBe(landed);
    expect(tossReducer(landed, { type: 'choice', choice: 'BAT' })).toMatchObject({ winnerId: 'a', choice: 'BAT', landed: result });
  });
  it('requires a winner before the batting decision and clears an old decision when manual winner changes', () => {
    expect(tossReducer(initialToss, { type: 'choice', choice: 'BAT' })).toBe(initialToss);
    const chosen = tossReducer(tossReducer(initialToss, { type: 'manual', winnerId: 'a' }), { type: 'choice', choice: 'BOWL' });
    expect(tossReducer(chosen, { type: 'manual', winnerId: 'b' })).toMatchObject({ winnerId: 'b', choice: null });
  });
  it('invalidates the toss only when its participants change', () => {
    const landed = tossReducer({ ...initialToss, mode: 'VIRTUAL' }, { type: 'land', result });
    expect(tossReducer(landed, { type: 'participantsChanged' })).toEqual(initialToss);
  });
});
