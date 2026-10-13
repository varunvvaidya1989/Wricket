import { describe, expect, it } from 'vitest';
import { cloudMvpInput, type CloudMvpSnapshot } from './cloud-input';

const snapshot = (rules: CloudMvpSnapshot['match']['rules']): CloudMvpSnapshot => ({
  match: { id: 'match', tournament_id: null, format: 'T10', status: 'COMPLETED', result: null, rules },
  xis: [], innings: [], events: [],
});
describe('hosted MVP legacy innings limits', () => {
  it('uses an explicitly stored legacy limit', () => {
    expect(cloudMvpInput(snapshot({ overs: 10 })).scheduledOvers).toBe(10);
  });
  it('prefers the current per-innings limit over legacy data', () => {
    expect(cloudMvpInput(snapshot({ oversPerInnings: 5, overs: 10 })).scheduledOvers).toBe(5);
  });
  it('does not fabricate a limit for historical matches without valid rules', () => {
    expect(() => cloudMvpInput(snapshot({}))).toThrow('no valid innings limit');
    expect(() => cloudMvpInput(snapshot({ overs: 0 }))).toThrow('no valid innings limit');
    expect(() => cloudMvpInput(snapshot({ oversPerInnings: 0, overs: 10 }))).toThrow('no valid innings limit');
  });
});
