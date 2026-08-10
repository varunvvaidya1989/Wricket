import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const multiSportMigration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260810131430_allow_multiple_sport_selection.sql'), 'utf8').toLowerCase();
const profilesMigration = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260810132421_add_sport_profiles.sql'), 'utf8').toLowerCase();

describe('multi-sport account migration', () => {
  it('requires a selected primary sport and saves the set atomically', () => {
    expect(multiSportMigration).toContain("if requested_count = 0 then raise exception 'select at least one sport'");
    expect(multiSportMigration).toContain("primary sport must be one of the selected sports");
    expect(multiSportMigration).toContain('insert into public.account_sports');
    expect(multiSportMigration).toContain('delete from public.account_sports');
  });

  it('exposes only the authenticated save command', () => {
    expect(multiSportMigration).toContain('security definer set search_path = public');
    expect(multiSportMigration).toContain('revoke all on function public.save_my_sports(text, text[], text) from public, anon');
    expect(multiSportMigration).toContain('grant execute on function public.save_my_sports(text, text[], text) to authenticated');
  });
});

describe('generic sport profiles migration', () => {
  it('has ownership RLS for every write path', () => {
    expect(profilesMigration).toContain('alter table public.sport_profiles enable row level security');
    expect(profilesMigration).toContain('sport_profiles_select_own');
    expect(profilesMigration).toContain('sport_profiles_insert_own');
    expect(profilesMigration).toContain('sport_profiles_update_own');
    expect(profilesMigration).toContain('sport_profiles_delete_own');
  });

  it('keeps profile shells synchronized with connected sports', () => {
    expect(profilesMigration).toContain('sync_account_sport_profile_after_write');
    expect(profilesMigration).toContain('archive_account_sport_profile_after_delete');
    expect(profilesMigration).toContain('unique (account_id, sport_id)');
  });
});
