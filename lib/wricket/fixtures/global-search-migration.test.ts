import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260810111828_add_global_search.sql'),
  'utf8',
);

describe('global search migration', () => {
  it('searches every supported entity through one bounded function', () => {
    expect(migration).toContain("('ALL', 'TOURNAMENT', 'MATCH', 'USER', 'SCORER')");
    expect(migration).toContain("least(greatest(p_limit, 1), 50)");
    expect(migration).toContain("'TOURNAMENT'::text as result_type");
    expect(migration).toContain("'MATCH', match.id");
    expect(migration).toContain("'USER', profile.id");
    expect(migration).toContain("'SCORER', profile.id");
  });

  it('keeps profile access behind authenticated RPCs', () => {
    expect(migration).toContain("if (select auth.uid()) is null then raise exception 'Authentication is required'");
    expect(migration).toContain('security definer set search_path = public');
    expect(migration).toContain('revoke all on function public.global_search(text, text, integer) from public, anon');
    expect(migration).toContain('grant execute on function public.global_search(text, text, integer) to authenticated');
  });
});
