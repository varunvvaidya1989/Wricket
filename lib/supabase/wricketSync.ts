import { getSupabaseClient } from './client';
import type { Team, Tournament, User } from '@/lib/wricket/domain/types';

export interface CloudTournamentCreateInput {
  name: string;
  format: Tournament['format'];
  startDate: number;
  endDate?: number;
  organizerPhone?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  plannedTeamCount: number;
  playersPerTeam: number;
  description?: string;
  socialMediaUrl?: string;
  bannerLocalUri?: string;
  logoLocalUri?: string;
}

export async function createCloudTournament(
  input: CloudTournamentCreateInput,
  userId: string,
): Promise<{ cloudId: string; bannerUrl?: string; logoUrl?: string; createdAt: number }> {
  const mediaKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const bannerUrl = input.bannerLocalUri
    ? await uploadTournamentMedia(input.bannerLocalUri, userId, mediaKey, 'banner')
    : undefined;
  const logoUrl = input.logoLocalUri
    ? await uploadTournamentMedia(input.logoLocalUri, userId, mediaKey, 'logo')
    : undefined;
  const { data, error } = await getSupabaseClient()
    .from('tournaments')
    .insert({
      created_by: userId,
      name: input.name,
      format: input.format,
      visibility: 'PRIVATE',
      start_date: dateOnly(input.startDate),
      start_at: new Date(input.startDate).toISOString(),
      end_date: input.endDate ? dateOnly(input.endDate) : null,
      planned_team_count: input.plannedTeamCount,
      players_per_team: input.playersPerTeam,
      description: input.description ?? null,
      social_media_url: input.socialMediaUrl ?? null,
      organizer_phone: input.organizerPhone ?? null,
      location: input.location ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      google_place_id: input.googlePlaceId ?? null,
      google_maps_url: input.googleMapsUrl ?? null,
      banner_url: bannerUrl ?? null,
      logo_url: logoUrl ?? null,
      points_win: 2,
      points_tie: 1,
      points_loss: 0,
      points_no_result: 1,
      settings: { status: 'ACTIVE' },
    })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return { cloudId: data.id, bannerUrl, logoUrl, createdAt: Date.parse(data.created_at) };
}

export async function createCloudTeam(input: {
  tournamentId: string;
  name: string;
  shortName: string;
  colorHex: string;
}): Promise<{ cloudId: string; createdAt: number }> {
  const { data, error } = await getSupabaseClient()
    .from('teams')
    .insert({
      tournament_id: input.tournamentId,
      name: input.name,
      short_name: input.shortName,
      color_hex: input.colorHex,
    })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return { cloudId: data.id, createdAt: Date.parse(data.created_at) };
}

export async function deleteCloudTeam(teamId: string): Promise<void> {
  const { error } = await getSupabaseClient().from('teams').delete().eq('id', teamId);
  if (error) throw error;
}

export async function createCloudPlayer(input: {
  name: string;
  role: User['role'];
  battingHand?: User['battingHand'];
  bowlingStyle?: string;
}, userId: string): Promise<{ cloudId: string; createdAt: number }> {
  const { data, error } = await getSupabaseClient()
    .from('players')
    .insert({
      created_by: userId,
      display_name: input.name,
      role: input.role,
      batting_hand: input.battingHand ?? null,
      bowling_style: input.bowlingStyle ?? null,
    })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return { cloudId: data.id, createdAt: Date.parse(data.created_at) };
}

export async function upsertCloudTournament(
  tournament: Tournament,
  userId: string,
): Promise<{ cloudId: string; bannerUrl?: string; logoUrl?: string }> {
  const bannerUrl = tournament.bannerLocalUri
    ? await uploadTournamentMedia(tournament.bannerLocalUri, userId, tournament.id, 'banner')
    : tournament.bannerUrl;
  const logoUrl = tournament.logoLocalUri
    ? await uploadTournamentMedia(tournament.logoLocalUri, userId, tournament.id, 'logo')
    : tournament.logoUrl;
  const { data, error } = await getSupabaseClient()
    .from('tournaments')
    .upsert({
      created_by: userId,
      source_local_id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      visibility: 'PRIVATE',
      start_date: dateOnly(tournament.startDate),
      start_at: new Date(tournament.startDate).toISOString(),
      end_date: tournament.endDate ? dateOnly(tournament.endDate) : null,
      planned_team_count: tournament.plannedTeamCount,
      players_per_team: tournament.playersPerTeam,
      description: tournament.description ?? null,
      social_media_url: tournament.socialMediaUrl ?? null,
      organizer_phone: tournament.organizerPhone ?? null,
      location: tournament.location ?? null,
      latitude: tournament.latitude ?? null,
      longitude: tournament.longitude ?? null,
      google_place_id: tournament.googlePlaceId ?? null,
      google_maps_url: tournament.googleMapsUrl ?? null,
      banner_url: bannerUrl ?? null,
      logo_url: logoUrl ?? null,
      points_win: tournament.pointsWin,
      points_tie: tournament.pointsTie,
      points_loss: tournament.pointsLoss,
      points_no_result: tournament.pointsNoResult,
      settings: { status: tournament.status },
      created_at: new Date(tournament.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'created_by,source_local_id' })
    .select('id')
    .single();
  if (error) throw error;
  return { cloudId: data.id, bannerUrl, logoUrl };
}

export async function upsertCloudTeam(team: Team, tournamentCloudId: string): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from('teams')
    .upsert({
      tournament_id: tournamentCloudId,
      source_local_id: team.id,
      name: team.name,
      short_name: team.shortName,
      color_hex: team.colorHex,
      created_at: new Date(team.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tournament_id,source_local_id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function upsertCloudPlayer(player: User, userId: string): Promise<string> {
  const { data, error } = await getSupabaseClient()
    .from('players')
    .upsert({
      created_by: userId,
      source_local_id: player.id,
      display_name: player.name,
      role: player.role,
      batting_hand: player.battingHand ?? null,
      bowling_style: player.bowlingStyle ?? null,
      created_at: new Date(player.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'created_by,source_local_id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function upsertCloudTeamPlayer(input: {
  teamCloudId: string;
  playerCloudId: string;
  jerseyNo: number | null;
  isCaptain: boolean;
  isKeeper: boolean;
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('team_players')
    .upsert({
      team_id: input.teamCloudId,
      player_id: input.playerCloudId,
      jersey_no: input.jerseyNo,
      is_captain: input.isCaptain,
      is_keeper: input.isKeeper,
    }, { onConflict: 'team_id,player_id' });
  if (error) throw error;
}

export async function listCloudTournaments() {
  const { data, error } = await getSupabaseClient()
    .from('tournaments')
    .select('id, created_by, source_local_id, name, format, start_date, start_at, end_date, planned_team_count, players_per_team, description, social_media_url, organizer_phone, location, latitude, longitude, google_place_id, google_maps_url, banner_url, logo_url, points_win, points_tie, points_loss, points_no_result, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listCloudTeams() {
  const { data, error } = await getSupabaseClient()
    .from('teams')
    .select('id, source_local_id, tournament_id, name, short_name, color_hex, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listCloudTeamPlayers() {
  const { data, error } = await getSupabaseClient()
    .from('team_players')
    .select('team_id, player_id, jersey_no, is_captain, is_keeper, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listCloudPlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from('players')
    .select('id, created_by, source_local_id, display_name, role, batting_hand, bowling_style, created_at')
    .in('id', playerIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

function dateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function uploadTournamentMedia(
  uri: string,
  userId: string,
  tournamentId: string,
  kind: 'banner' | 'logo',
): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not read tournament ${kind}`);
  const body = await response.arrayBuffer();
  const extension = fileExtension(uri);
  const path = `${userId}/${tournamentId}/${kind}.${extension}`;
  const { error } = await getSupabaseClient().storage
    .from('tournament-media')
    .upload(path, body, {
      contentType: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });
  if (error) throw error;
  return getSupabaseClient().storage.from('tournament-media').getPublicUrl(path).data.publicUrl;
}

function fileExtension(uri: string): 'jpg' | 'png' | 'webp' {
  const value = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (value === 'png' || value === 'webp') return value;
  return 'jpg';
}
