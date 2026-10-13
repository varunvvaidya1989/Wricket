import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824090217_publish_standalone_sport_live_matches.sql',
), 'utf8').toLowerCase();
const liveScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/platform/SportStageLiveScreen.tsx',
), 'utf8');
const scoreScreen = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCloudLiveScoreScreen.tsx',
), 'utf8');
const sportHome = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportShell.tsx',
), 'utf8');
const liveBadge = readFileSync(resolve(
  __dirname,
  '../../../components/sports/platform/SportLiveActivityBadge.tsx',
), 'utf8');

describe('standalone matches in public live discovery', () => {
  it('publishes standalone matches with account-backed player names', () => {
    expect(migration).toContain('alter column competition_id drop not null');
    expect(migration).toContain('alter column fixture_id drop not null');
    expect(migration).toContain('from public.sport_scoring_match_players player');
    expect(migration).toContain("'friendly match'");
    expect(migration).not.toContain('if not found or match.competition_id is null then return');
  });

  it('refreshes snapshots when a match enters or leaves live status', () => {
    expect(migration).toContain('after update of status on public.sport_scoring_matches');
    expect(migration).toContain('when (old.status is distinct from new.status)');
    expect(migration).toContain("where match.status = 'live'");
  });

  it('does not show a tournament action for standalone match cards', () => {
    expect(liveScreen).toContain('snapshot.competitionId ? () => onOpenCompetition(snapshot) : undefined');
    expect(liveScreen).toContain('onOpenCompetition?: () => void');
  });

  it('publishes the computed score headline with points, undo, and completion', () => {
    expect(scoreScreen.match(/headline_score: formatLiveHeadline/g)).toHaveLength(3);
  });

  it('refreshes sport homes and offers resume only for a real live match', () => {
    const matchHook = readFileSync(resolve(__dirname, '../../../hooks/useSportMatches.ts'), 'utf8');
    expect(matchHook).toContain('sportScoringApi.subscribeSportLive');
    expect(sportHome).toContain("match.status === 'LIVE' && match.createdBy === auth.session?.user.id");
    expect(liveBadge).toContain('Animated.loop');
    expect(liveBadge).toContain('useNativeDriver: true');
  });
});
