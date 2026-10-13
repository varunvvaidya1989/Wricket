import { describe, expect, it } from 'vitest';
import { verifyTarget } from './wricket-hosted-preflight.mjs';

describe('Wricket hosted rollout target', () => {
  it('rejects the unrelated accessible project', () => {
    expect(() => verifyTarget('lzgnuqwvsioinwwrsdvn', [{ id: 'hmqldsjqrcomqxknxrws' }])).toThrow('cannot see Wricket');
  });
  it('rejects a changed project link even with a matching account', () => {
    expect(() => verifyTarget('hmqldsjqrcomqxknxrws', [{ id: 'lzgnuqwvsioinwwrsdvn' }])).toThrow('does not match Wricket');
  });
  it('accepts authorised visibility for exactly the Wricket project', () => {
    expect(() => verifyTarget('lzgnuqwvsioinwwrsdvn', [{ ref: 'lzgnuqwvsioinwwrsdvn' }])).not.toThrow();
  });
});
