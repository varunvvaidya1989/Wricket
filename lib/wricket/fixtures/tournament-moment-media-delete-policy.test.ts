import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260822122922_fix_tournament_owner_moment_media_delete_policy.sql'),
  'utf8',
);

describe('tournament moment-media deletion policy', () => {
  it('allows a tournament owner to match the storage object being deleted', () => {
    expect(migration).toContain('drop policy if exists "moment_objects_delete_tournament_owner" on storage.objects');
    expect(migration).toContain('media.storage_path = objects.name');
  });

  it('keeps the owner and match-moment relationship checks in place', () => {
    expect(migration).toContain('join public.match_moments moment on moment.id = media.moment_id');
    expect(migration).toContain('tournament.created_by = (select auth.uid())');
  });
});
