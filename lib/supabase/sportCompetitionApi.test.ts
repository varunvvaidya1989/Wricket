import { describe, expect, it } from 'vitest';

import { normalizeCompetitionRpcMessage } from './competitionRpcMessages';

describe('competition RPC error messaging', () => {
  it('explains team registration authorization failures clearly', () => {
    expect(normalizeCompetitionRpcMessage(
      new Error('Only the team owner, manager, or captain can submit this squad'),
    )).toBe('Only the team owner, manager, or captain can register this squad. Pick a team you manage or captain.');
  });

  it('keeps unrelated errors readable', () => {
    expect(normalizeCompetitionRpcMessage(new Error('Registration is not open')))
      .toBe('Registration is not open for this competition yet.');
  });
});
