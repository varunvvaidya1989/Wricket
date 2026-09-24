import type { ImagePickerAsset } from 'expo-image-picker';

import { normalizeSponsor, type SponsorInput, type SponsorParent, type TournamentSponsor } from '@/lib/sponsors/types';
import { getSupabaseClient } from './client';
import { newUuid } from '@/lib/wricket/db/ids';

const bucket = 'sponsor-logos';
const fields = 'id,name,label,description,website_url,logo_path,display_order,is_visible,placements,version';
const parentColumn = (parent: SponsorParent) => parent.kind === 'cricket' ? 'cricket_tournament_id' : 'sport_competition_id';

function payload(input: SponsorInput, logoPath?: string) {
  const value = normalizeSponsor(input);
  return { name: value.name, label: value.label, description: value.description,
    website_url: value.websiteUrl || null, logo_path: logoPath ?? null,
    display_order: value.displayOrder, is_visible: value.isVisible, placements: value.placements };
}

export const tournamentSponsorsApi = {
  async list(parent: SponsorParent): Promise<TournamentSponsor[]> {
    const client = getSupabaseClient();
    const { data, error } = await client.from('tournament_sponsors').select(fields)
      .eq(parentColumn(parent), parent.id).order('display_order').order('created_at').order('id');
    if (error) throw error;
    const paths = [...new Set((data ?? []).flatMap(row => row.logo_path ? [String(row.logo_path)] : []))];
    // A missing logo should never hide a sponsor's name or block a match feed.
    const signed = paths.length ? await client.storage.from(bucket).createSignedUrls(paths, 300) : undefined;
    const urls = new Map((signed?.data ?? []).map(item => [item.path, item.signedUrl]));
    return (data ?? []).map(row => ({ id: String(row.id), name: String(row.name), label: String(row.label),
      description: String(row.description), websiteUrl: String(row.website_url ?? ''),
      logoPath: row.logo_path || undefined, logoUrl: urls.get(row.logo_path) ?? undefined,
      displayOrder: Number(row.display_order), isVisible: Boolean(row.is_visible),
      placements: row.placements, version: Number(row.version) }));
  },

  async save(parent: SponsorParent, input: SponsorInput, existing?: TournamentSponsor, logoPath?: string): Promise<void> {
    const table = getSupabaseClient().from('tournament_sponsors');
    const values = payload(input, logoPath);
    const query = existing
      ? table.update(values).eq('id', existing.id).eq(parentColumn(parent), parent.id).eq('version', existing.version)
      : table.insert({ ...values, [parentColumn(parent)]: parent.id });
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This sponsor changed or your access ended. Refresh sponsors before trying again.');
  },

  async remove(parent: SponsorParent, sponsor: TournamentSponsor): Promise<void> {
    const { data, error } = await getSupabaseClient().from('tournament_sponsors').delete()
      .eq('id', sponsor.id).eq(parentColumn(parent), parent.id).eq('version', sponsor.version).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This sponsor changed or your access ended. Refresh sponsors before trying again.');
  },

  async uploadLogo(parent: SponsorParent, asset: ImagePickerAsset): Promise<string> {
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('Choose a logo smaller than 5 MB.');
    const bytes = await (await fetch(asset.uri)).arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error('Choose a logo smaller than 5 MB.');
    // Inspect the actual bytes; file extensions and picker MIME types are untrusted.
    const b = new Uint8Array(bytes);
    const type = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'jpg'
      : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'png'
      : String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' ? 'webp' : undefined;
    if (!type) throw new Error('Choose a PNG, JPEG or WebP logo.');
    const path = `${parent.kind}/${parent.id}/${newUuid()}.${type}`;
    const { error } = await getSupabaseClient().storage.from(bucket).upload(path, bytes, {
      contentType: type === 'jpg' ? 'image/jpeg' : `image/${type}`, upsert: false,
    });
    if (error) throw error;
    return path;
  },

  async removeLogo(path: string): Promise<void> {
    const { error } = await getSupabaseClient().storage.from(bucket).remove([path]);
    if (error) throw error;
  },
};
