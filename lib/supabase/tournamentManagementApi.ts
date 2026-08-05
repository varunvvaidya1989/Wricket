import { deleteTournamentLocally, updateTournamentDetailsLocally, updateTournamentMediaLocally } from '@/lib/wricket/db/repo';
import { getSupabaseClient } from './client';

const REMOVE_BATCH_SIZE = 100;

export const tournamentManagementApi = {
  async getOrganizerContact(tournamentId: string): Promise<{ name: string; phone?: string }> {
    const { data, error } = await getSupabaseClient().rpc('get_tournament_organizer_contact', {
      p_tournament_id: tournamentId,
    });
    if (error) throw error;
    const row = data?.[0];
    return { name: row?.display_name ?? 'Tournament organiser', phone: row?.phone ?? undefined };
  },

  async updateDetails(input: {
    cloudTournamentId: string; localTournamentId: string; name: string; startDate: number;
    location?: string; plannedTeamCount: number; playersPerTeam: number; organizerPhone?: string;
    description?: string; socialMediaUrl?: string; rewards?: string;
  }): Promise<void> {
    const client = getSupabaseClient();
    const { data: current, error: readError } = await client.from('tournaments').select('settings').eq('id', input.cloudTournamentId).single();
    if (readError) throw readError;
    const { error } = await client.from('tournaments').update({
      name: input.name.trim(), start_date: new Date(input.startDate).toISOString().slice(0, 10),
      start_at: new Date(input.startDate).toISOString(), location: input.location?.trim() || null,
      planned_team_count: input.plannedTeamCount, players_per_team: input.playersPerTeam,
      organizer_phone: input.organizerPhone?.trim() || null, description: input.description?.trim() || null,
      social_media_url: input.socialMediaUrl?.trim() || null,
      settings: { ...(current.settings ?? {}), rewards: input.rewards?.trim() || null },
    }).eq('id', input.cloudTournamentId);
    if (error) throw error;
    await updateTournamentDetailsLocally(input.localTournamentId, input);
  },

  async updateMedia(input: {
    cloudTournamentId: string;
    localTournamentId: string;
    ownerId: string;
    localUri: string;
    kind: 'logo' | 'banner';
  }): Promise<string> {
    const client = getSupabaseClient();
    const response = await fetch(input.localUri);
    if (!response.ok) throw new Error(`Could not read the selected tournament ${input.kind}`);
    const extension = imageExtension(input.localUri);
    const storagePath = `${input.ownerId}/${input.localTournamentId}/${input.kind}-${Date.now()}.${extension}`;
    const { error: uploadError } = await client.storage.from('tournament-media').upload(
      storagePath,
      await response.arrayBuffer(),
      { contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`, cacheControl: '3600' },
    );
    if (uploadError) throw uploadError;
    const url = client.storage.from('tournament-media').getPublicUrl(storagePath).data.publicUrl;
    const { error: updateError } = await client.from('tournaments')
      .update({ [input.kind === 'logo' ? 'logo_url' : 'banner_url']: url })
      .eq('id', input.cloudTournamentId);
    if (updateError) {
      await client.storage.from('tournament-media').remove([storagePath]);
      throw updateError;
    }
    await updateTournamentMediaLocally(input.localTournamentId, input.kind, url);
    return url;
  },

  async deleteOwnedTournament(input: {
    localTournamentId: string;
    cloudTournamentId?: string;
    ownerId: string;
  }): Promise<void> {
    if (input.cloudTournamentId) {
      const client = getSupabaseClient();
      const { data: momentMedia, error: mediaQueryError } = await client.rpc('list_owned_tournament_media_paths', {
        p_tournament_id: input.cloudTournamentId,
      });
      if (mediaQueryError) throw mediaQueryError;

      const momentPaths = (momentMedia ?? []).map((row: { storage_path: string }) => row.storage_path);
      await removePaths('match-moments', momentPaths);

      const tournamentFolder = `${input.ownerId}/${input.localTournamentId}`;
      const { data: tournamentMedia, error: listError } = await client.storage.from('tournament-media').list(tournamentFolder, { limit: 100 });
      if (listError) throw listError;
      await removePaths('tournament-media', (tournamentMedia ?? []).map(item => `${tournamentFolder}/${item.name}`));

      const { error: deleteError } = await client.rpc('delete_owned_tournament', {
        p_tournament_id: input.cloudTournamentId,
      });
      if (deleteError) throw deleteError;
    }
    await deleteTournamentLocally(input.localTournamentId);
  },
};

async function removePaths(bucket: string, paths: string[]): Promise<void> {
  const client = getSupabaseClient();
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + REMOVE_BATCH_SIZE));
    if (error) throw error;
  }
}

function imageExtension(uri: string): 'jpg' | 'png' | 'webp' {
  const value = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (value === 'png' || value === 'webp') return value;
  return 'jpg';
}
