import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { deleteMyAccount } from './accountDeletion';
import { authErrorMessage } from './authErrors';

function fixture(manifests: unknown[], failure?: Error) {
  const calls: string[] = [];
  const remove = vi.fn(async (paths: string[]) => {
    calls.push(`remove:${paths.length}`);
    return { error: failure ?? null };
  });
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: { message: string } | null }> => {
    calls.push(name);
    return { data: name === 'list_my_account_deletion_media' ? manifests.shift() : null, error: null };
  });
  const from = vi.fn(() => ({ remove }));
  const client = { rpc, storage: { from } } as unknown as SupabaseClient;
  return { client, rpc, remove, from, calls };
}

describe('account deletion orchestration', () => {
  it('requires typed confirmation before requesting any files or deletion', async () => {
    const f = fixture([[]]);
    await expect(deleteMyAccount(f.client, 'delete')).rejects.toThrow('CONFIRMATION');
    expect(f.calls).toEqual([]);
  });
  it('removes files in bounded bucket batches and verifies the next manifest before deletion', async () => {
    const files = Array.from({ length: 101 }, (_, i) => ({ bucket_id: 'profile-media', storage_path: `account/${i}.jpg` }));
    const f = fixture([[...files, { bucket_id: 'match-moments', storage_path: 'moment.jpg' }], []]);
    await deleteMyAccount(f.client, 'DELETE');
    expect(f.calls).toEqual(['list_my_account_deletion_media', 'remove:100', 'remove:1', 'remove:1', 'list_my_account_deletion_media', 'delete_my_sportstage_account']);
    expect(new Set(f.from.mock.calls.flat())).toEqual(new Set(['profile-media', 'match-moments']));
  });
  it('leaves the identity available when Storage fails', async () => {
    const f = fixture([[{ bucket_id: 'profile-media', storage_path: 'account/a.jpg' }]], new Error('network failure'));
    await expect(deleteMyAccount(f.client, 'DELETE')).rejects.toThrow('MEDIA_REMAINS');
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['list_my_account_deletion_media']);
  });
  it('stops a removal denied silently by RLS instead of looping or deleting the account', async () => {
    const files = [{ bucket_id: 'profile-media', storage_path: 'account/a.jpg' }];
    const f = fixture([files, files]);
    await expect(deleteMyAccount(f.client, 'DELETE')).rejects.toThrow('MEDIA_REMAINS');
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.calls).not.toContain('delete_my_sportstage_account');
  });
  it('rejects malformed manifests before Storage access', async () => {
    const f = fixture([[{ bucket_id: 'profile-media', storage_path: null }]]);
    await expect(deleteMyAccount(f.client, 'DELETE')).rejects.toThrow('MEDIA_REMAINS');
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('preserves a preflight denial and performs no destructive work', async () => {
    const f = fixture([]);
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: 'ACCOUNT_DELETION_SHARED_RECORDS' } });
    await expect(deleteMyAccount(f.client, 'DELETE')).rejects.toMatchObject({ message: 'ACCOUNT_DELETION_SHARED_RECORDS' });
    expect(f.remove).not.toHaveBeenCalled();
    expect(authErrorMessage({ message: 'ACCOUNT_DELETION_SHARED_RECORDS' })).toContain('preserve match history');
  });
});
