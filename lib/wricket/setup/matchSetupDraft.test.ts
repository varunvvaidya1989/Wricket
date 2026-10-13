import { describe, expect, it } from 'vitest';
import { matchSetupDraftKey } from './matchSetupDraft';

describe('match setup draft identity', () => {
  it('separates accounts and fixture contexts', () => {
    expect(matchSetupDraftKey('account-a', 'friendly')).not.toBe(matchSetupDraftKey('account-b', 'friendly'));
    expect(matchSetupDraftKey('account-a', 'friendly')).not.toBe(matchSetupDraftKey('account-a', 'fixture:1'));
  });
});
