import { describe, expect, it } from 'vitest';

import { pointDetailChoiceLabel, pointDetailOptions } from './pointDetails';

const values = (sport: Parameters<typeof pointDetailOptions>[0]) => (
  pointDetailOptions(sport).map((option) => option.value)
);

describe('sport-specific point details', () => {
  it('uses tennis and padel service terminology only for those sports', () => {
    for (const sport of ['tennis', 'padel'] as const) {
      expect(values(sport)).toEqual(expect.arrayContaining(['ACE', 'SERVICE_WINNER', 'DOUBLE_FAULT']));
    }
    expect(values('badminton')).not.toContain('DOUBLE_FAULT');
  });

  it('uses each sport’s own rally outcomes', () => {
    expect(values('badminton')).toEqual(expect.arrayContaining(['SMASH_WINNER', 'SERVICE_FAULT']));
    expect(values('table_tennis')).toContain('SERVICE_WINNER');
    expect(values('pickleball')).toContain('FAULT');
  });

  it('describes point causes from the selected winner perspective', () => {
    const players = ['Player A', 'Player B'] as const;
    expect(pointDetailChoiceLabel('ACE', 0, players)).toBe('Ace by Player A');
    expect(pointDetailChoiceLabel('DOUBLE_FAULT', 0, players)).toBe('Double fault by Player B');
    expect(pointDetailChoiceLabel('UNFORCED_ERROR', 1, players)).toBe('Unforced error by Player A');
  });
});
