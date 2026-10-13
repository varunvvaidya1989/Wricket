import type { SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { activePointEvents } from '../scoring/cloudEvents';
import { SPORT_CONFIGS } from '../scoring/configs';
import { evaluateUnit, replay } from '../scoring/engine';
import { pointDetailOptions } from '../scoring/pointDetails';
import type { ScoringSportId } from '../scoring/presentation';
import type { AncestorSnapshot, MatchOptions, MatchState, Side, SportConfig } from '../scoring/types';
import { ANALYTICS_MODULES, ERROR_OUTCOMES, readObservation, WINNER_OUTCOMES } from './modules';
import type { PlayerAnalytics, Rate } from './types';

export function rateLabel(rate: Rate): string {
  return rate.total ? `${Math.round(rate.won / rate.total * 100)}%` : '—';
}

/** Game-winning opportunities calculated with the actual match rules (including caps/no-ad). */
function gamePoints(config: SportConfig, state: MatchState): { sides: Side[]; tieBreak: boolean } {
  let unit = state.root;
  let rule = config.root;
  const ancestors: AncestorSnapshot[] = [];
  while (unit.level !== 'game' && unit.children.length) {
    const next = rule.selectChild?.({ parent: unit, options: state.options }) ?? rule.child;
    if (!next) break;
    ancestors.push({ unit: rule, score: unit.score });
    rule = next;
    unit = unit.children[unit.children.length - 1];
  }
  if (unit.level !== 'game' || unit.isComplete || rule.key !== unit.configKey) return { sides: [], tieBreak: false };
  const sides = ([0, 1] as const).filter(side => {
    const event = { type: 'POINT' as const, sequence: state.eventCount + 1, winner: side };
    const awarded = config.serveModel.awardPoint ? config.serveModel.awardPoint({ event, state, options: state.options }) : side;
    if (awarded === undefined) return false;
    const score: [number, number] = [...unit.score];
    score[awarded]++;
    return evaluateUnit(rule, score, { options: state.options, specialRules: config.specialRules, ancestors }).isComplete;
  });
  return { sides, tieBreak: unit.variant === 'tie_break' };
}

export function analyzePlayer(sportId: ScoringSportId, matches: readonly SportCloudMatchFeed[], profileId: string): PlayerAnalytics {
  const module = ANALYTICS_MODULES[sportId];
  const config = SPORT_CONFIGS[sportId];
  const emptyRate = (): Rate => ({ won: 0, total: 0 });
  const result: PlayerAnalytics = {
    matches: 0, completed: 0, wins: 0, doubles: 0, rallies: emptyRate(), serve: emptyRate(), returns: emptyRate(),
    pressure: emptyRate(), breakPoints: emptyRate(), shortRallies: emptyRate(), longRallies: emptyRate(),
    firstServe: emptyRate(), secondServe: emptyRate(), rallyLengthTotal: 0, rallyLengthSamples: 0,
    detailSamples: 0, individualSamples: 0, winners: 0, errors: 0, bestRun: 0,
    signature: module.signature.map(item => ({ label: item.label, count: 0 })),
    strokes: module.strokes.map(label => ({ label, count: 0 })), zones: module.zones.map(label => ({ label, count: 0 })),
    opponents: [], partners: [], trend: [], excluded: 0,
  };
  const opponents = new Map<string, { name: string; record: Rate }>();
  const partners = new Map<string, { name: string; record: Rate }>();
  const add = (rate: Rate, won: boolean) => { rate.total++; if (won) rate.won++; };
  const allowedDetails = new Set<string>(pointDetailOptions(sportId).map(item => item.value));

  for (const match of [...matches].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const side: Side | undefined = match.sideAProfileIds.includes(profileId) ? 0 : match.sideBProfileIds.includes(profileId) ? 1 : undefined;
    if (side === undefined) continue;
    const ownIds = side === 0 ? match.sideAProfileIds : match.sideBProfileIds;
    const ownNames = side === 0 ? match.sideAPlayers : match.sideBPlayers;
    const opponentIds = side === 0 ? match.sideBProfileIds : match.sideAProfileIds;
    const opponentNames = side === 0 ? match.sideBPlayers : match.sideAPlayers;
    const opponentName = opponentNames.join(' / ');
    const options = match.rulesSnapshot.options && typeof match.rulesSnapshot.options === 'object' && !Array.isArray(match.rulesSnapshot.options)
      ? match.rulesSnapshot.options as MatchOptions : {};
    const events = activePointEvents(match.events);
    // Validate before accumulating, so a broken log cannot partially inflate metrics.
    const settings = { initialServer: match.rulesSnapshot.initial_server === 1 ? 1 as const : 0 as const, options };
    let finalState: MatchState;
    try { finalState = replay(config, events, settings); }
    catch { result.excluded++; continue; }
    result.matches++;
    const doubles = match.matchFormat !== 'SINGLES';
    if (doubles) result.doubles++;
    const wonMatch = finalState.winner === side;
    const completed = match.status === 'COMPLETED' && finalState.isComplete;
    if (completed) {
      result.completed++; if (wonMatch) result.wins++;
      const opponentKey = [...opponentIds].sort().join('|');
      if (opponentKey) {
        const row = opponents.get(opponentKey) ?? { name: opponentName, record: emptyRate() };
        add(row.record, wonMatch); opponents.set(opponentKey, row);
      }
      ownIds.forEach((id, index) => {
        if (id === profileId) return;
        const row = partners.get(id) ?? { name: ownNames[index] ?? 'Partner', record: emptyRate() };
        add(row.record, wonMatch); partners.set(id, row);
      });
    }
    const payloads = new Map(match.events.filter(event => event.kind === 'POINT').map(event => [event.sequence, event.payload]));
    const points = emptyRate();
    const timeline: PlayerAnalytics['trend'][number]['timeline'] = [];
    let run = 0;
    replay(config, events, settings, (event, before) => {
      const won = event.winner === side;
      add(result.rallies, won); add(points, won);
      const serving = before.serve.servingSide === side;
      timeline.push({ sequence: event.sequence, won, wonSoFar: points.won, serving });
      add(serving ? result.serve : result.returns, won);
      const pressure = gamePoints(config, before);
      if (pressure.sides.length) add(result.pressure, won);
      if ((sportId === 'tennis' || sportId === 'padel') && !serving && !pressure.tieBreak && pressure.sides.includes(side)) add(result.breakPoints, won);
      run = won ? run + 1 : 0;
      result.bestRun = Math.max(result.bestRun, run);
      const payload = payloads.get(event.sequence) ?? {};
      const observation = readObservation(payload.analytics, sportId);
      if (observation.rallyLength !== undefined) {
        result.rallyLengthSamples++; result.rallyLengthTotal += observation.rallyLength;
        if (observation.rallyLength <= module.shortRally) add(result.shortRallies, won);
        if (observation.rallyLength >= module.longRally) add(result.longRallies, won);
      }
      if (serving && observation.serveAttempt === 1) add(result.firstServe, won);
      if (serving && observation.serveAttempt === 2) add(result.secondServe, won);
      const detail = typeof payload.point_type === 'string' && allowedDetails.has(payload.point_type) ? payload.point_type : undefined;
      if (detail && detail !== 'RALLY_WINNER') result.detailSamples++;
      const actorSide = detail && ERROR_OUTCOMES.has(detail) ? (event.winner === 0 ? 1 : 0) : event.winner;
      const actorIds = actorSide === 0 ? match.sideAProfileIds : match.sideBProfileIds;
      const actor = observation.actorProfileId && actorIds.includes(observation.actorProfileId) ? observation.actorProfileId : !doubles && actorIds.length === 1 ? actorIds[0] : undefined;
      if (actor !== profileId) return;
      if (detail && detail !== 'RALLY_WINNER') result.individualSamples++;
      if (detail && WINNER_OUTCOMES.has(detail)) result.winners++;
      if (detail && ERROR_OUTCOMES.has(detail)) result.errors++;
      // Stroke/zone figures are explicitly counts of winning finishes, not all shot attempts.
      if (detail && WINNER_OUTCOMES.has(detail)) {
        const stroke = result.strokes.find(item => item.label === observation.stroke);
        const zone = result.zones.find(item => item.label === observation.zone);
        if (stroke) stroke.count++;
        if (zone) zone.count++;
      }
      module.signature.forEach((metric, index) => {
        if ((metric.outcome && metric.outcome === detail) || (metric.stroke && metric.stroke === observation.stroke && detail && WINNER_OUTCOMES.has(detail))) result.signature[index].count++;
      });
    });
    result.trend.push({ id: match.id, date: match.updatedAt, opponent: opponentName, result: completed ? wonMatch ? 'W' : 'L' : match.status === 'COMPLETED' ? 'Unverified' : match.status, points, timeline });
  }
  result.opponents = [...opponents.values()].sort((a, b) => b.record.total - a.record.total);
  result.partners = [...partners.values()].sort((a, b) => b.record.total - a.record.total);
  result.trend.reverse();
  return result;
}
