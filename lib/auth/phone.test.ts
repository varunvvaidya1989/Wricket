import { describe, expect, it } from 'vitest';

import { normalizeE164Phone, normalizePhoneParts } from './phone';

describe('phone normalization', () => {
  it('normalizes country and local phone parts to E.164', () => {
    expect(normalizePhoneParts('+91', '098765 43210')).toBe('+919876543210');
  });

  it('normalizes formatted E.164 input', () => {
    expect(normalizeE164Phone('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it('rejects missing country prefixes and invalid lengths', () => {
    expect(normalizeE164Phone('9876543210')).toBeNull();
    expect(normalizeE164Phone('+123')).toBeNull();
    expect(normalizePhoneParts('', '9876543210')).toBeNull();
  });
});
