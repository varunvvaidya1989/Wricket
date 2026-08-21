import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260821075902_add_cricket_live_snapshots.sql'),
  'utf8',
).toLowerCase();

describe('cricket live discovery migration', () => {
  it('maintains a narrow cricket snapshot for the landing feed', () => {
    expect(source).toContain('create table public.cricket_live_snapshots');
    expect(source).toContain("match.visibility <> 'public'");
    expect(source).toContain("match.status not in ('in_progress', 'innings_break', 'follow_on_decision')");
    expect(source).toContain("tournament_visibility <> 'public'");
    expect(source).not.toContain('grant select on public.matches');
    expect(source).not.toContain('grant select on public.match_events');
  });

  it('keeps privileged refresh logic outside the exposed schema', () => {
    expect(source).toContain('function app_private.refresh_cricket_live_snapshot');
    expect(source).toContain("security definer\nset search_path = ''");
    expect(source).toContain('from public, anon, authenticated');
  });

  it('exposes a read-only, caller-permission discovery function', () => {
    expect(source).toContain('function public.discover_cricket_live');
    expect(source).toContain('security invoker');
    expect(source).toContain('grant execute on function public.discover_cricket_live');
    expect(source).toContain('to anon, authenticated');
  });
});
