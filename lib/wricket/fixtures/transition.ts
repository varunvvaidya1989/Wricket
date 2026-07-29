import { KnockoutBracketBuilder, QualifiedTeam } from './bracket';
import { StandingsCalculator } from './standings';
import type {
  FixtureGroup,
  FixtureMatch,
  KnockoutBracket,
  KnockoutConfig,
  PointsRule,
  StageStatus,
  StageType,
  Tiebreaker,
} from './types';

export interface FixtureStage {
  id: string;
  tournamentId: string;
  order: number;
  type: StageType;
  status: StageStatus;
  dependsOnStageId?: string;
  config: {
    advancePerGroup?: number;
    pointsRule?: PointsRule;
    tiebreakers?: Tiebreaker[];
    knockout?: KnockoutConfig;
  };
}

export interface MatchCompletedEvent {
  type: 'MATCH_COMPLETED' | 'MATCH_WALKOVER';
  matchId: string;
  stageId: string;
}

export type TransitionEvent =
  | MatchCompletedEvent
  | { type: 'KNOCKOUT_GENERATED'; stageId: string; bracketId: string }
  | { type: 'ROUND_GENERATED'; stageId: string; roundId: string }
  | { type: 'TIE_REQUIRES_RESOLUTION'; stageId: string; groupId: string; teamIds: string[] }
  | { type: 'TOURNAMENT_COMPLETED'; tournamentId: string };

export interface FixtureStore {
  getStage(id: string): Promise<FixtureStage>;
  getNextStage(stage: FixtureStage): Promise<FixtureStage | undefined>;
  listGroups(stageId: string): Promise<FixtureGroup[]>;
  listStageMatches(stageId: string): Promise<FixtureMatch[]>;
  saveMatches(matches: FixtureMatch[]): Promise<void>;
  setStageStatus(stageId: string, status: StageStatus): Promise<void>;
  saveBracket(bracket: KnockoutBracket): Promise<void>;
  getBracket(stageId: string): Promise<KnockoutBracket | undefined>;
  saveUnresolvedTie(stageId: string, groupId: string, teamIds: string[]): Promise<void>;
  listManualTieResolutions(stageId: string): Promise<Record<string, string[]>>;
  completeTournament(tournamentId: string): Promise<void>;
}

export class FixtureEventBus {
  private listeners = new Set<(event: TransitionEvent) => void | Promise<void>>();
  subscribe(listener: (event: TransitionEvent) => void | Promise<void>) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async emit(event: TransitionEvent) {
    await Promise.all([...this.listeners].map(listener => listener(event)));
  }
}

export class StageTransitionEngine {
  constructor(
    private store: FixtureStore,
    private events = new FixtureEventBus(),
    private standings = new StandingsCalculator(),
    private brackets = new KnockoutBracketBuilder(),
  ) {}

  subscribe() {
    return this.events.subscribe(event => {
      if (event.type === 'MATCH_COMPLETED' || event.type === 'MATCH_WALKOVER') return this.onMatchFinished(event);
    });
  }

  async onMatchFinished(event: MatchCompletedEvent): Promise<void> {
    const stage = await this.store.getStage(event.stageId);
    const matches = await this.store.listStageMatches(stage.id);
    if (!matches.every(match => match.status === 'COMPLETED' || match.status === 'WALKOVER')) return;
    if (stage.type === 'GROUP') await this.completeGroupStage(stage, matches);
    else await this.advanceKnockout(stage);
  }

  async forceGenerate(stageId: string): Promise<void> {
    const stage = await this.store.getStage(stageId);
    const matches = await this.store.listStageMatches(stage.id);
    if (stage.type === 'GROUP') await this.completeGroupStage(stage, matches, true);
    else await this.advanceKnockout(stage, true);
  }

  async resolveTie(stageId: string, groupId: string, orderedTeamIds: string[]): Promise<void> {
    await this.store.saveUnresolvedTie(stageId, groupId, orderedTeamIds);
    const stage = await this.store.getStage(stageId);
    await this.completeGroupStage(stage, await this.store.listStageMatches(stageId));
  }

  private async completeGroupStage(stage: FixtureStage, matches: FixtureMatch[], force = false) {
    if (!force && !matches.every(match => match.status === 'COMPLETED' || match.status === 'WALKOVER')) return;
    const groups = await this.store.listGroups(stage.id);
    const manual = await this.store.listManualTieResolutions(stage.id);
    const qualifiers: QualifiedTeam[] = [];
    let blocked = false;
    for (const group of groups) {
      let standings = this.standings.calculate(
        group,
        matches,
        stage.config.pointsRule,
        stage.config.tiebreakers,
      );
      if (manual[group.id]) {
        const order = new Map(manual[group.id].map((id, index) => [id, index]));
        standings = [...standings].sort((a, b) => (order.get(a.teamId) ?? 999) - (order.get(b.teamId) ?? 999));
        standings.forEach(row => { row.unresolved = false; });
      }
      const count = stage.config.advancePerGroup ?? 1;
      const cutoff = standings.slice(0, count);
      const unresolved = cutoff.filter(row => row.unresolved);
      if (unresolved.length) {
        blocked = true;
        await this.store.saveUnresolvedTie(stage.id, group.id, unresolved.map(row => row.teamId));
        await this.events.emit({ type: 'TIE_REQUIRES_RESOLUTION', stageId: stage.id, groupId: group.id, teamIds: unresolved.map(row => row.teamId) });
      } else {
        qualifiers.push(...cutoff.map(row => ({ teamId: row.teamId, groupId: group.id, sourceRef: `${group.name} #${row.rank}` })));
      }
    }
    if (blocked) return;
    await this.store.setStageStatus(stage.id, 'COMPLETED');
    const next = await this.store.getNextStage(stage);
    if (!next) {
      await this.store.completeTournament(stage.tournamentId);
      await this.events.emit({ type: 'TOURNAMENT_COMPLETED', tournamentId: stage.tournamentId });
      return;
    }
    if (!next.config.knockout) throw new Error('Knockout stage config is missing');
    const bracket = this.brackets.build(next.id, qualifiers, next.config.knockout);
    await this.store.saveBracket(bracket);
    await this.store.saveMatches(bracket.rounds[0].matches);
    await this.store.setStageStatus(next.id, 'IN_PROGRESS');
    await this.events.emit({ type: 'KNOCKOUT_GENERATED', stageId: next.id, bracketId: bracket.id });
  }

  private async advanceKnockout(stage: FixtureStage, force = false) {
    const bracket = await this.store.getBracket(stage.id);
    if (!bracket) throw new Error('Knockout bracket is missing');
    const currentIndex = bracket.rounds.findIndex(round =>
      round.matches.length > 0 && round.matches.some(match => match.status !== 'COMPLETED' && match.status !== 'WALKOVER'),
    );
    if (currentIndex >= 0 && !force) return;
    const lastPopulated = bracket.rounds.map(round => round.matches.length > 0).lastIndexOf(true);
    const nextMatches = this.brackets.resolveNextRound(bracket, lastPopulated);
    if (nextMatches.length) {
      await this.store.saveMatches(nextMatches);
      await this.store.saveBracket(bracket);
      await this.events.emit({ type: 'ROUND_GENERATED', stageId: stage.id, roundId: bracket.rounds[lastPopulated + 1].id });
      return;
    }
    await this.store.setStageStatus(stage.id, 'COMPLETED');
    await this.store.completeTournament(stage.tournamentId);
    await this.events.emit({ type: 'TOURNAMENT_COMPLETED', tournamentId: stage.tournamentId });
  }
}

