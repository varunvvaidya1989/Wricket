import type { PerformanceFormEntry } from '@/lib/supabase/personalStatsApi';

export type FormTrend = 'up' | 'down' | 'flat';

export function formatRate(numerator: number, denominator: number, multiplier = 1): string {
  return denominator > 0 ? ((numerator / denominator) * multiplier).toFixed(2) : '—';
}

export function formBarPercent(value: number, entries: readonly PerformanceFormEntry[]): number {
  const max = Math.max(0, ...entries.map(item => item.value));
  return max > 0 ? Math.max(15, Math.min(100, value / max * 100)) : 15;
}

export function isPeakForm(value: number, entries: readonly PerformanceFormEntry[]): boolean {
  const max = Math.max(0, ...entries.map(item => item.value));
  return max > 0 && value >= max * 0.8;
}

export function formTrend(entries: readonly PerformanceFormEntry[]): FormTrend {
  if (entries.length < 3) return 'flat';
  const recentCount = Math.min(2, Math.ceil(entries.length / 2));
  const recent = entries.slice(0, recentCount);
  const prior = entries.slice(recentCount);
  const recentAverage = average(recent.map(item => item.value));
  const priorAverage = average(prior.map(item => item.value));
  const tolerance = Math.max(0.5, priorAverage * 0.1);
  if (recentAverage > priorAverage + tolerance) return 'up';
  if (recentAverage < priorAverage - tolerance) return 'down';
  return 'flat';
}

export function formTag(entries: readonly PerformanceFormEntry[]): string {
  if (!entries.length) return 'NEW';
  const trend = formTrend(entries);
  if (trend === 'up') return 'IN FORM';
  if (trend === 'down') return 'BUILDING';
  return 'STEADY';
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
