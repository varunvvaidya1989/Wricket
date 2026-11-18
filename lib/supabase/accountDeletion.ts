import type { SupabaseClient } from '@supabase/supabase-js';

type DeletionMedia = { bucket_id: string; storage_path: string };

/** Remove caller-scoped files through Storage before the transactional delete. */
export async function deleteMyAccount(client: SupabaseClient, confirmation: string): Promise<void> {
  if (confirmation !== 'DELETE') throw new Error('ACCOUNT_DELETION_CONFIRMATION');
  let previousManifest: string | undefined;
  for (let round = 0; round <= 20; round++) {
    const { data, error } = await client.rpc('list_my_account_deletion_media', { p_confirmation: confirmation });
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(isDeletionMedia)) throw new Error('ACCOUNT_DELETION_MEDIA_REMAINS');
    if (!data.length) {
      const { error: deleteError } = await client.rpc('delete_my_sportstage_account', { p_confirmation: confirmation });
      if (deleteError) throw deleteError;
      return;
    }
    const manifest = JSON.stringify(data);
    if (round === 20 || manifest === previousManifest) throw new Error('ACCOUNT_DELETION_MEDIA_REMAINS');
    previousManifest = manifest;
    const buckets = new Map<string, string[]>();
    for (const file of data) buckets.set(file.bucket_id, [...(buckets.get(file.bucket_id) ?? []), file.storage_path]);
    for (const [bucket, paths] of buckets) {
      for (let start = 0; start < paths.length; start += 100) {
        const { error: storageError } = await client.storage.from(bucket).remove(paths.slice(start, start + 100));
        if (storageError) throw new Error('ACCOUNT_DELETION_MEDIA_REMAINS');
      }
    }
  }
}

function isDeletionMedia(value: unknown): value is DeletionMedia {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as Partial<DeletionMedia>;
  return typeof file.bucket_id === 'string' && Boolean(file.bucket_id)
    && typeof file.storage_path === 'string' && Boolean(file.storage_path);
}
