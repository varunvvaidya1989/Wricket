import { describe, expect, it } from 'vitest';

import { formatCount } from './count';

describe('formatCount', () => {
  it('uses the singular label only for one', () => {
    expect(formatCount(1, 'local match')).toBe('1 local match');
  });

  it('uses the plural label for zero and values above one', () => {
    expect(formatCount(0, 'match')).toBe('0 matches');
    expect(formatCount(2, 'match')).toBe('2 matches');
  });

  it('supports irregular plurals', () => {
    expect(formatCount(2, 'competition', 'competitions')).toBe('2 competitions');
  });
});
