import { describe, expect, it } from 'vitest';

import type { PerformanceFormEntry } from '@/lib/supabase/personalStatsApi';
import { formBarPercent, formTrend, formatRate, isPeakForm } from './performance';

const form = (values: number[]): PerformanceFormEntry[] => values.map((value, index) => ({
  matchId: `match-${index}`,
  value,
  date: `2026-08-${String(10 - index).padStart(2, '0')}`,
  label: `M${index + 1}`,
}));

describe('performance formatting', () => {
  it('uses one undefined marker whenever a rate denominator is zero', () => {
    expect(formatRate(0, 0)).toBe('—');
    expect(formatRate(42, 0)).toBe('—');
    expect(formatRate(42, 21)).toBe('2.00');
    expect(formatRate(42, 21, 100)).toBe('200.00');
  });

  it('clamps low form bars and marks values at least 80 percent of the peak', () => {
    const entries = form([50, 40, 2]);
    expect(formBarPercent(2, entries)).toBe(15);
    expect(isPeakForm(40, entries)).toBe(true);
    expect(isPeakForm(2, entries)).toBe(false);
  });

  it('compares the recent window with the prior window', () => {
    expect(formTrend(form([50, 45, 20, 15, 10]))).toBe('up');
    expect(formTrend(form([10, 15, 40, 45, 50]))).toBe('down');
    expect(formTrend(form([20, 21, 20, 19]))).toBe('flat');
  });
});
