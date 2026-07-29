import { roundsFor } from './recommender';
import { pairingStrategies, PairingStrategyRegistry } from './pairing';
import type { CustomFormat, CustomStageDef } from './types';

export interface CustomFormatValidation {
  valid: boolean;
  errors: string[];
}

export class CustomFormatBuilder {
  constructor(private pairingRegistry: PairingStrategyRegistry = pairingStrategies) {}

  validate(format: CustomFormat, teamCount: number): CustomFormatValidation {
    const errors: string[] = [];
    const orders = format.stages.map(stage => stage.order);
    if (new Set(orders).size !== orders.length || [...orders].sort((a, b) => a - b).some((value, index) => value !== index + 1)) {
      errors.push('Stage ordering must be unique and contiguous from 1.');
    }
    for (const stage of format.stages) {
      if (stage.dependsOnStageOrder != null && stage.dependsOnStageOrder >= stage.order) {
        errors.push(`Stage ${stage.order} dependency must reference an earlier stage.`);
      }
      if (stage.type === 'GROUP') this.validateGroup(stage, teamCount, errors);
      else this.validateKnockout(stage, format.stages, errors);
    }
    return { valid: errors.length === 0, errors };
  }

  assertValid(format: CustomFormat, teamCount: number): CustomFormat {
    const result = this.validate(format, teamCount);
    if (!result.valid) throw new Error(result.errors.join(' '));
    return format;
  }

  private validateGroup(stage: CustomStageDef, teamCount: number, errors: string[]) {
    if (!stage.groupSizes || stage.groupSizes.reduce((sum, value) => sum + value, 0) !== teamCount) {
      errors.push(`Stage ${stage.order} group sizes must sum to ${teamCount}.`);
    }
    if (!stage.pairingAlgorithm || !this.pairingRegistry.has(stage.pairingAlgorithm)) {
      errors.push(`Stage ${stage.order} references an unknown pairing strategy.`);
    }
  }

  private validateKnockout(stage: CustomStageDef, stages: CustomStageDef[], errors: string[]) {
    if (!stage.seeding) errors.push(`Stage ${stage.order} requires a seeding strategy.`);
    const source = stages.find(item => item.order === stage.dependsOnStageOrder);
    const qualifiers = source?.type === 'GROUP'
      ? (source.groupCount ?? source.groupSizes?.length ?? 0) * (source.advancePerGroup ?? 0)
      : 0;
    if (qualifiers > 0) {
      const required = roundsFor(2 ** Math.ceil(Math.log2(qualifiers)));
      if (!stage.knockoutRounds || stage.knockoutRounds.length !== required.length) {
        errors.push(`Stage ${stage.order} has ${qualifiers} qualifiers but requires ${required.length} knockout rounds.`);
      }
    }
  }
}

