import {
  activePointEvents,
  describePointDetail,
  formatLiveHeadline,
  pointDetailLabel,
  replay,
  type ReplaySettings,
  type Side,
  type SportConfig,
  type UnitState,
} from '@/lib/sports/scoring';
import type { SportCloudScoringEvent } from '@/lib/supabase/sportScoringApi';

export interface SportTimelineItem {
  event: SportCloudScoringEvent;
  marker: string;
  title: string;
  description: string;
  score: string;
  elapsedMs?: number;
}

export function buildSportMatchTimeline(
  config: SportConfig,
  events: readonly SportCloudScoringEvent[],
  sideNames: readonly [string, string],
  settings: ReplaySettings,
): SportTimelineItem[] {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  return ordered.map((event, index) => {
    const eventTime = Date.parse(event.createdAt);
    const previousTime = index > 0 ? Date.parse(ordered[index - 1].createdAt) : Number.NaN;
    const elapsedMs = Number.isFinite(eventTime) && Number.isFinite(previousTime)
      ? Math.max(0, eventTime - previousTime)
      : undefined;
    const previousPoints = activePointEvents(ordered.slice(0, index));
    const previousState = replay(config, previousPoints, settings);
    const visibleEvents = ordered.slice(0, index + 1);
    const points = activePointEvents(visibleEvents);
    const state = replay(config, points, settings);
    const score = formatLiveHeadline(config, state);
    if (event.kind === 'POINT') {
      const winner = event.payload.winner === 1 ? 1 : 0;
      const winnerName = sideNames[winner];
      const loserName = sideNames[winner === 0 ? 1 : 0];
      const detail = event.payload.point_type ?? 'RALLY_WINNER';
      const matchWon = !previousState.isComplete && state.isComplete;
      const setWon = completedUnits(state.root, 'set') > completedUnits(previousState.root, 'set');
      const gameWon = completedUnits(state.root, 'game') > completedUnits(previousState.root, 'game');
      const scoreChanged = scoringTotal(state.root) > scoringTotal(previousState.root);
      const sideOut = config.id === 'pickleball' && !scoreChanged;
      const serviceBreak = gameWon
        && (config.id === 'tennis' || config.id === 'padel')
        && previousState.serve.servingSide !== winner;
      const milestone = matchWon
        ? { title: 'Match won', description: `${winnerName} won the match · Final score ${score}` }
        : setWon
          ? { title: 'Set won', description: `${winnerName} won the set · Score ${score}` }
          : serviceBreak
            ? { title: 'Service break', description: `${winnerName} broke ${loserName}'s serve · Score ${score}` }
            : gameWon
              ? { title: 'Game won', description: `${winnerName} won the game · Score ${score}` }
              : sideOut
                ? { title: 'Side out', description: `${winnerName} won the rally and gained serve · Score unchanged at ${score}` }
                : undefined;
      return {
        event,
        marker: String(points.length),
        title: milestone?.title ?? pointDetailLabel(detail),
        description: milestone?.description
          ?? `Point awarded to ${winnerName} · ${describePointDetail(detail, winner as Side, sideNames)} · Score ${score}`,
        score,
        elapsedMs,
      };
    }
    if (event.kind === 'UNDO') return {
      event,
      marker: '↶',
      title: 'Point corrected',
      description: `Previous point removed · Score ${score}`,
      score,
      elapsedMs,
    };
    if (event.kind === 'COMPLETED') {
      const winner = event.payload.winner_side;
      const winnerName = winner === 0 || winner === 1 ? sideNames[winner] : undefined;
      return {
        event,
        marker: '✓',
        title: 'Match completed',
        description: `${winnerName ? `${winnerName} won` : 'Final result confirmed'} · Final score ${score}`,
        score,
        elapsedMs,
      };
    }
    return {
      event,
      marker: '•',
      title: friendlyKind(event.kind),
      description: `Match updated · Score ${score}`,
      score,
      elapsedMs,
    };
  }).reverse();
}

function completedUnits(root: UnitState, level: string): number {
  return (root.level === level && root.isComplete ? 1 : 0)
    + root.children.reduce((total, child) => total + completedUnits(child, level), 0);
}

function scoringTotal(root: UnitState): number {
  return root.score[0] + root.score[1]
    + root.children.reduce((total, child) => total + scoringTotal(child), 0);
}

export function splitLiveHeadline(headline: string): { match: string; current: string } {
  const [match, current] = headline.split('·').map((part) => part.trim());
  return { match: match || '0-0', current: current || match || '0-0' };
}

function friendlyKind(kind: string): string {
  return ({
    SERVICE_CHANGED: 'Service changed',
    END_CHANGED: 'Players changed ends',
    OPTION_SET: 'Match setting updated',
    RETIREMENT: 'Player retired',
    WALKOVER: 'Walkover recorded',
    ABANDONED: 'Match abandoned',
    CORRECTION: 'Score corrected',
  } as Record<string, string>)[kind] ?? 'Match updated';
}
