import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SponsorInput, TournamentSponsor } from '@/lib/sponsors/types';

const mocks = vi.hoisted(() => ({ from: vi.fn(), storage: vi.fn(), signed: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock('./client', () => ({ getSupabaseClient: () => ({ from: mocks.from, storage: { from: mocks.storage } }) }));
import { tournamentSponsorsApi } from './tournamentSponsorsApi';

const parent = { kind: 'sport' as const, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const input: SponsorInput = { name: ' Apex ', label: 'Official sponsor', description: '', websiteUrl: 'apex.example', displayOrder: 10, isVisible: true, placements: ['match'] };
const existing: TournamentSponsor = { ...input, id: 'sponsor-id', version: 3, logoPath: 'old-logo.png' };
function query(result: { data: unknown; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), maybeSingle: vi.fn(), then: vi.fn() };
  for (const key of ['select', 'eq', 'order', 'insert', 'update', 'delete'] as const) chain[key].mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  chain.then.mockImplementation((resolve: (value: unknown) => void) => resolve(result));
  mocks.from.mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.storage.mockReturnValue({ createSignedUrls: mocks.signed, upload: mocks.upload, remove: mocks.remove });
});

describe('sponsor persistence', () => {
  it('saves normalized details and scopes writes by parent and expected version', async () => {
    const chain = query({ data: { id: existing.id }, error: null });
    await tournamentSponsorsApi.save(parent, input, existing, existing.logoPath);
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Apex', website_url: 'https://apex.example/', logo_path: 'old-logo.png' }));
    expect(chain.eq.mock.calls).toEqual([['id', existing.id], ['sport_competition_id', parent.id], ['version', 3]]);
  });
  it('inserts sponsors into the correct cricket tournament', async () => {
    const chain = query({ data: { id: 'new' }, error: null });
    await tournamentSponsorsApi.save({ ...parent, kind: 'cricket' }, input);
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ cricket_tournament_id: parent.id, logo_path: null }));
  });
  it('reports stale edits and deletes instead of pretending success', async () => {
    query({ data: null, error: null });
    await expect(tournamentSponsorsApi.save(parent, input, existing)).rejects.toThrow(/changed/);
    await expect(tournamentSponsorsApi.remove(parent, existing)).rejects.toThrow(/changed/);
  });
  it('preserves database permission errors', async () => {
    query({ data: null, error: new Error('Permission denied') });
    await expect(tournamentSponsorsApi.save(parent, input)).rejects.toThrow('Permission denied');
  });
  it('retains sponsor details when logo signing is unavailable', async () => {
    query({ data: [{ id: 's', name: 'Apex', label: 'Gold', description: '', website_url: null, logo_path: 'logo.png', display_order: 0, is_visible: true, placements: ['match'], version: 1 }], error: null });
    mocks.signed.mockResolvedValue({ data: null, error: new Error('Missing image') });
    const sponsors = await tournamentSponsorsApi.list(parent);
    expect(sponsors[0]).toMatchObject({ name: 'Apex', logoUrl: undefined, websiteUrl: '' });
    expect(mocks.signed).toHaveBeenCalledWith(['logo.png'], 300);
  });
  it('rejects oversized files before uploading', async () => {
    await expect(tournamentSponsorsApi.uploadLogo(parent, { uri: 'file://logo', width: 10, height: 10, fileSize: 6 * 1024 * 1024 })).rejects.toThrow(/5 MB/);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects forged image extensions based on file contents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new TextEncoder().encode('<svg onload="evil()"/>').buffer }));
    await expect(tournamentSponsorsApi.uploadLogo(parent, { uri: 'file://fake.png', width: 10, height: 10, mimeType: 'image/png' })).rejects.toThrow(/PNG, JPEG or WebP/);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('uploads accepted image bytes with a parent-scoped, unique path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]).buffer }));
    mocks.upload.mockResolvedValue({ error: null });
    const path = await tournamentSponsorsApi.uploadLogo(parent, { uri: 'file://logo.png', width: 10, height: 10 });
    expect(path).toMatch(/^sport\/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\/[\da-f-]+\.png$/);
    expect(mocks.upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), { contentType: 'image/png', upsert: false });
  });
});
