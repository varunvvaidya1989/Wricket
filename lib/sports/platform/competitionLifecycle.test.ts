import { describe, expect, it } from 'vitest';

import {
  getNextCompetitionLifecycleActions,
  type SportCompetitionLifecycle,
} from './competitionLifecycle';

describe('cloud competition lifecycle actions', () => {
  it.each<[SportCompetitionLifecycle, readonly SportCompetitionLifecycle[]]>([
    ['DRAFT', ['REGISTRATION_OPEN', 'PUBLISHED', 'CANCELLED']],
    ['REGISTRATION_OPEN', ['REGISTRATION_LOCKED', 'CANCELLED']],
    ['REGISTRATION_LOCKED', ['REGISTRATION_OPEN', 'PUBLISHED', 'CANCELLED']],
    ['PUBLISHED', ['LIVE', 'CANCELLED']],
    ['LIVE', ['COMPLETED', 'CANCELLED']],
    ['COMPLETED', ['ARCHIVED']],
    ['CANCELLED', ['ARCHIVED']],
    ['ARCHIVED', []],
  ])('offers only valid actions from %s', (current, expected) => {
    expect(getNextCompetitionLifecycleActions(current)).toEqual(expected);
  });
});
