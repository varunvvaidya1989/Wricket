import { describe, expect, it } from 'vitest';

import { newId, newUuid } from './ids';

describe('database IDs', () => {
  it('creates UUID-shaped IDs accepted by cloud lifecycle commands', () => {
    expect(newUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not reuse IDs', () => {
    expect(new Set(Array.from({ length: 100 }, newId))).toHaveLength(100);
    expect(new Set(Array.from({ length: 100 }, newUuid))).toHaveLength(100);
  });
});
