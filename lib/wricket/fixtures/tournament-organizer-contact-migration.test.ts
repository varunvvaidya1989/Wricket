import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260805082836_tournament_organizer_contact.sql'), 'utf8');

describe('tournament organizer contact migration', () => {
  it('exposes only organizer name and tournament phone to signed-in users', () => {
    expect(migration).toContain('returns table(display_name text, phone text)');
    expect(migration).toContain('profile.display_name, tournament.organizer_phone');
    expect(migration).toContain('(select auth.uid()) is not null');
    expect(migration).toContain('revoke all on function public.get_tournament_organizer_contact(uuid) from public, anon');
  });
});
