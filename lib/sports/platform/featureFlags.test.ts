import { describe, expect, it } from 'vitest';

import { evaluateSportFeatureFlag, SportFeatureFlag } from './featureFlagEvaluation';

const flags: SportFeatureFlag[] = [
  {
    config: {},
    enabled: true,
    featureKey: 'public_live',
    rolloutPercentage: 100,
    sportId: null,
  },
  {
    config: {},
    enabled: true,
    featureKey: 'cloud_competitions',
    rolloutPercentage: 100,
    sportId: 'tennis-id',
  },
  {
    config: {},
    enabled: false,
    featureKey: 'cloud_competitions',
    rolloutPercentage: 100,
    sportId: 'padel-id',
  },
];

describe('sport platform feature flags', () => {
  it('uses a sport override before a global flag', () => {
    expect(evaluateSportFeatureFlag(flags, 'cloud_competitions', { sportId: 'tennis-id' })).toBe(true);
    expect(evaluateSportFeatureFlag(flags, 'cloud_competitions', { sportId: 'padel-id' })).toBe(false);
  });

  it('uses global flags when no sport override exists', () => {
    expect(evaluateSportFeatureFlag(flags, 'public_live', { sportId: 'tennis-id' })).toBe(true);
  });

  it('keeps partial rollouts disabled without a stable subject', () => {
    const partial: SportFeatureFlag[] = [{
      config: {},
      enabled: true,
      featureKey: 'offline_scoring',
      rolloutPercentage: 50,
      sportId: null,
    }];
    expect(evaluateSportFeatureFlag(partial, 'offline_scoring')).toBe(false);
    const firstEvaluation = evaluateSportFeatureFlag(partial, 'offline_scoring', {
      subjectId: 'account-1',
    });
    expect(typeof firstEvaluation).toBe('boolean');
    expect(evaluateSportFeatureFlag(partial, 'offline_scoring', { subjectId: 'account-1' }))
      .toBe(firstEvaluation);
  });

  it('never enables a disabled flag regardless of rollout percentage', () => {
    expect(evaluateSportFeatureFlag(flags, 'cloud_competitions', {
      sportId: 'padel-id',
      subjectId: 'account-1',
    })).toBe(false);
  });
});
