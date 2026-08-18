import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260818132000_add_resource_ordering.sql',
), 'utf8').toLowerCase();

describe('competition resource ordering migration', () => {
  it('gives venues explicit competition-scoped order', () => {
    expect(migration).toContain('add column display_order integer');
    expect(migration).toContain('unique (competition_id, display_order)');
  });

  it('atomically reorders stages, divisions, and venues as complete sets', () => {
    expect(migration).toContain('function app_private.reorder_sport_competition_resources');
    for (const type of ['stage', 'division', 'venue']) expect(migration).toContain(`'${type}'`);
    expect(migration).toContain('resource order must contain every resource exactly once');
  });
});
