import { describe, expect, it } from 'vitest';
import type { FixtureMatch } from '@/lib/wricket/fixtures';
import { tournamentWorkspace } from './tournamentWorkspace';
const fixture = (status: FixtureMatch['status']): FixtureMatch => ({ id: 'f1', stageId: 'groups', teamA: 'a', teamB: 'b', round: 1, leg: 1, status });
describe('organiser workspace guidance', () => {
  it('requires teams before suggesting fixture creation', () => {
    expect(tournamentWorkspace(1, 8, [], [], false).next.action).toBe('teams');
    expect(tournamentWorkspace(2, 8, [], [], false).next.action).toBe('fixtures');
  });
  it('never treats live matches as completed group results', () => {
    const model = tournamentWorkspace(8, 8, [fixture('LIVE')], ['groups'], false);
    expect(model.next.action).toBe('view');
    expect(model.bracketDetail).toContain('Complete group results');
  });
  it('offers qualification review after results without claiming qualifiers are eligible', () => {
    const model = tournamentWorkspace(8, 8, [fixture('COMPLETED'), { ...fixture('WALKOVER'), id: 'f2' }], ['groups'], false);
    expect(model.next.action).toBe('bracket');
    expect(model.next.detail).toContain('competition rules');
    expect(tournamentWorkspace(8, 8, [fixture('COMPLETED')], ['groups'], true).next.action).toBe('fixtures');
  });
});
