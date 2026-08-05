import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260804133856_sportstage_account_onboarding.sql'),
  'utf8',
);

describe('SportStage account onboarding migration', () => {
  it('stores sport access separately from contextual tournament roles', () => {
    expect(migration).toContain('create table public.sports');
    expect(migration).toContain('create table public.account_sports');
    expect(migration).toContain('complete_sportstage_onboarding');
    expect(migration).not.toContain('club_owner');
    expect(migration).not.toContain('organiser');
    expect(migration).not.toContain('scorer');
    expect(migration).not.toContain('captain');
  });

  it('protects account sport assignments with row level security', () => {
    expect(migration).toContain('alter table public.account_sports enable row level security');
    expect(migration).toContain('account_id = (select auth.uid())');
    expect(migration).toContain('revoke all on public.sports, public.account_sports from anon');
  });
});
