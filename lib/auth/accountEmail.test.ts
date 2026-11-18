import { describe, expect, it } from 'vitest';
import { accountEmailUpdate } from './accountEmail';
describe('phone and email account profile saves', () => {
  it('allows a phone-only parent to save a player profile without inventing an email', () => {
    expect(accountEmailUpdate(undefined, '')).toBeUndefined();
    expect(accountEmailUpdate('', '  ')).toBeUndefined();
  });
  it('keeps existing email sign-ins intact and rejects deleting their email', () => {
    expect(accountEmailUpdate('parent@example.com', ' PARENT@example.com ')).toBeUndefined();
    expect(() => accountEmailUpdate('parent@example.com', '')).toThrow('account email');
  });
  it('allows adding a real email through the existing confirmation flow', () => {
    expect(accountEmailUpdate(undefined, ' parent@example.com ')).toBe('parent@example.com');
    expect(() => accountEmailUpdate(undefined, 'invalid')).toThrow('valid email');
  });
});
