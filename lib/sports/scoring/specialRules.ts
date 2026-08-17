import type {
  MatchOptions,
  ScoringEffect,
  Side,
  SpecialRule,
  UnitTransition,
} from './types';

export interface SuddenDeathRuleOptions {
  readonly id: string;
  readonly unitLevel: string;
  readonly tiedAt: number;
  readonly enabledBy?: string;
}

/** Creates the shared rule shape used by tennis no-ad and padel golden point. */
export function suddenDeathAfterTieRule(ruleOptions: SuddenDeathRuleOptions): SpecialRule {
  const rule: SpecialRule = {
    id: ruleOptions.id,
    resolve: ({ unit, score, options }) => {
      if (unit.level !== ruleOptions.unitLevel || !isEnabled(options, ruleOptions.enabledBy)) {
        return undefined;
      }
      const leadingSide: Side | undefined = score[0] === score[1]
        ? undefined
        : score[0] > score[1] ? 0 : 1;
      if (leadingSide === undefined) return undefined;
      const trailingSide = leadingSide === 0 ? 1 : 0;
      return score[trailingSide] >= ruleOptions.tiedAt
        && score[leadingSide] === score[trailingSide] + 1
        ? leadingSide
        : undefined;
    },
  };
  return Object.freeze(rule);
}

export interface DecidingUnitThresholdRuleOptions {
  readonly id: string;
  readonly unitLevel: string;
  readonly decidingAncestorLevel: string;
  readonly threshold: number;
  readonly effectType: string;
  readonly enabledBy?: string;
}

/**
 * Emits a display/UI effect when a threshold is crossed in the deciding child
 * unit. It deliberately does not change the score or the hierarchy.
 */
export function decidingUnitThresholdEffectRule(
  ruleOptions: DecidingUnitThresholdRuleOptions,
): SpecialRule {
  const rule: SpecialRule = {
    id: ruleOptions.id,
    effects: ({ event, options, transitions }) => {
      if (!isEnabled(options, ruleOptions.enabledBy)) return [];
      const transition = transitions.find(
        (candidate) => candidate.unit.level === ruleOptions.unitLevel
          && crossedThreshold(candidate, ruleOptions.threshold),
      );
      if (!transition) return [];

      const decidingAncestor = transition.ancestors.find(
        ({ unit }) => unit.level === ruleOptions.decidingAncestorLevel,
      );
      if (!decidingAncestor) return [];
      const decidingScore = decidingAncestor.unit.target - 1;
      if (
        decidingAncestor.score[0] !== decidingScore
        || decidingAncestor.score[1] !== decidingScore
      ) {
        return [];
      }

      const side: Side = transition.score[0] >= ruleOptions.threshold ? 0 : 1;
      const effect: ScoringEffect = Object.freeze({
        type: ruleOptions.effectType,
        ruleId: ruleOptions.id,
        sequence: event.sequence,
        unit: transition.unit.level,
        side,
      });
      return Object.freeze([effect]);
    },
  };
  return Object.freeze(rule);
}

function crossedThreshold(transition: UnitTransition, threshold: number): boolean {
  return (
    transition.previousScore[0] < threshold && transition.score[0] >= threshold
  ) || (
    transition.previousScore[1] < threshold && transition.score[1] >= threshold
  );
}

function isEnabled(options: MatchOptions, option: string | undefined): boolean {
  return option === undefined || options[option] === true;
}
