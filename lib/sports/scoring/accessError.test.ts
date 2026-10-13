import { describe, expect, it } from 'vitest';
import { isScoringAccessError } from './accessError';

describe('scoring access loss', () => {
  it.each([
    { code: '42501', message: 'Permission denied' },
    { message: 'Only an assigned official, competition manager, or standalone match creator can score this match' },
    { message: 'Scoring lease expired or belongs to another device' },
    new Error('Another scoring device holds this match'),
  ])('disables further mutations until access is checked: %j', cause => {
    expect(isScoringAccessError(cause)).toBe(true);
  });
  it.each([undefined, new TypeError('Failed to fetch'), { message: 'Score changed; reconcile before submitting more events' }, { code: 'P0001', message: 'Unsupported scoring event' }])('keeps transport and conflict recovery distinct: %j', cause => {
    expect(isScoringAccessError(cause)).toBe(false);
  });
});
