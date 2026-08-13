import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260813160000_add_profile_avatar_storage.sql'),
  'utf8',
);

describe('profile avatar storage migration', () => {
  it('limits avatar writes and deletes to the authenticated account folder', () => {
    expect(migration).toContain("'profile-media'");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
    expect(migration).toContain('profile_media_delete_own');
  });

  it('cleans avatar media when the account profile is deleted', () => {
    expect(migration).toContain('delete_profile_avatar_media_before_profile');
    expect(migration).toContain("(storage.foldername(name))[1] = old.id::text");
  });
});
