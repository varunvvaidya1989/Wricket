import { describe, expect, it } from 'vitest';

import { supportEmailUrl, supportTopic } from './contact';

describe('public support requests', () => {
  it('uses a fixed support destination and safely encoded draft fields', () => {
    const url = new URL(supportEmailUrl('account-deletion'));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('admin@sportstageapp.com');
    expect(url.searchParams.get('subject')).toBe('SportStage account deletion request');
    expect(url.searchParams.get('body')).toContain('Account sign-in email:');
    expect(url.searchParams.get('body')).toContain('data retained and why');
  });

  it('does not turn unexpected route input into an email recipient or header', () => {
    for (const value of [undefined, ['account-deletion'], 'account-deletion\r\nbcc=outsider@example.test', 'mailto:outsider@example.test']) {
      expect(supportTopic(value)).toBe('general');
    }
    expect(supportTopic('account-deletion')).toBe('account-deletion');
  });
});
