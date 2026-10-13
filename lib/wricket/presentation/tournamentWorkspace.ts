import type { FixtureMatch } from '@/lib/wricket/fixtures';

export type WorkspaceAction = 'teams' | 'fixtures' | 'bracket' | 'scorers' | 'details' | 'sponsors' | 'registrations' | 'view';

export function tournamentWorkspace(teamCount: number, plannedTeams: number, matches: readonly FixtureMatch[], groupStageIds: readonly string[], hasBracket: boolean) {
  const groupMatches = matches.filter(match => groupStageIds.includes(match.stageId));
  const unfinished = groupMatches.filter(match => !['COMPLETED', 'WALKOVER'].includes(match.status)).length;
  const next: { action: WorkspaceAction; title: string; detail: string } = teamCount < 2
    ? { action: 'teams', title: 'Bring your teams together.', detail: 'Add at least two teams before building fixtures.' }
    : !matches.length
      ? { action: 'fixtures', title: 'Build the fixture plan.', detail: 'Choose automatic pairings or create the schedule manually.' }
      : unfinished > 0
        ? { action: 'view', title: 'Keep the group stage moving.', detail: `${unfinished} group match${unfinished === 1 ? '' : 'es'} still need a result.` }
        : groupMatches.length > 0 && !hasBracket
          ? { action: 'bracket', title: 'Review the qualifiers.', detail: 'Check standings and competition rules before creating the winning bracket.' }
          : { action: 'fixtures', title: 'Review the schedule.', detail: 'Check fixtures, venues and the next match.' };
  return { next, teamDetail: `${teamCount} of ${plannedTeams} planned teams added`,
    fixtureDetail: matches.length ? `${matches.length} fixtures · ${matches.filter(match => match.status === 'LIVE').length} live` : 'Automatic or manual scheduling',
    bracketDetail: hasBracket ? 'Review the existing bracket and progression' : unfinished > 0 ? 'Complete group results before qualification' : 'Review qualification and supported formats' };
}
