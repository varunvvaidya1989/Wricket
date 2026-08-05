import * as Linking from 'expo-linking';

import { updateTeamLogoByCloudId } from '@/lib/wricket/db/repo';
import { getSupabaseClient } from './client';

export type TeamRole = 'CAPTAIN' | 'PLAYER';

export interface TeamInvitationPreview {
  teamId: string;
  teamName: string;
  teamShortName: string;
  role: TeamRole;
  expiresAt: string;
}

export interface TeamRosterMember {
  accountId?: string;
  playerId: string;
  name: string;
  role: TeamRole;
  status: 'ACTIVE' | 'REMOVED';
  joinedAt: string;
  jerseyNo?: number;
  playerRole?: 'BAT' | 'BOWL' | 'AR' | 'WK';
  isKeeper?: boolean;
}

export interface TeamInvitation {
  id: string;
  role: TeamRole;
  invitedEmail?: string;
  useCount: number;
  maxUses: number;
  expiresAt: string;
  revokedAt?: string;
}

export interface RegisteredPlayerSearchResult {
  playerId: string;
  accountId?: string;
  name: string;
  avatarUrl?: string;
  currentRole?: TeamRole;
}

export const teamManagementApi = {
  async updateLogo(teamId: string, localUri: string, userId: string): Promise<string> {
    const client = getSupabaseClient();
    const response = await fetch(localUri);
    if (!response.ok) throw new Error('Could not read the selected team logo');
    const extension = imageExtension(localUri);
    const storagePath = `${userId}/teams/${teamId}/logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await client.storage.from('tournament-media').upload(
      storagePath,
      await response.arrayBuffer(),
      { contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`, cacheControl: '3600' },
    );
    if (uploadError) throw uploadError;
    const logoUrl = client.storage.from('tournament-media').getPublicUrl(storagePath).data.publicUrl;
    const { error: updateError } = await client.rpc('update_team_logo', {
      p_team_id: teamId,
      p_logo_url: logoUrl,
    });
    if (updateError) {
      await client.storage.from('tournament-media').remove([storagePath]);
      throw updateError;
    }
    await updateTeamLogoByCloudId(teamId, logoUrl);
    return logoUrl;
  },

  async listTeamLogos(teamIds: string[]): Promise<Map<string, string | undefined>> {
    if (teamIds.length === 0) return new Map();
    const { data, error } = await getSupabaseClient().from('teams')
      .select('id, logo_url')
      .in('id', teamIds);
    if (error) throw error;
    return new Map((data ?? []).map(team => [team.id, team.logo_url ?? undefined]));
  },

  async createInvitation(input: {
    teamId: string;
    role: TeamRole;
    invitedEmail?: string;
    maxUses?: number;
    expiresInHours?: number;
  }): Promise<{ invitationId: string; token: string; expiresAt: string; link: string }> {
    const { data, error } = await getSupabaseClient().rpc('create_team_invitation', {
      p_team_id: input.teamId,
      p_role: input.role,
      p_invited_email: input.invitedEmail?.trim() || null,
      p_max_uses: input.maxUses ?? 1,
      p_expires_in_hours: input.expiresInHours ?? 168,
    });
    if (error) throw error;
    return {
      invitationId: data.invitation_id,
      token: data.token,
      expiresAt: data.expires_at,
      link: Linking.createURL('wricket/team/join', {
        scheme: 'sportstage',
        queryParams: { token: data.token },
      }),
    };
  },

  async previewInvitation(token: string): Promise<TeamInvitationPreview> {
    const { data, error } = await getSupabaseClient().rpc('preview_team_invitation', { p_token: token });
    if (error) throw error;
    return {
      teamId: data.team_id,
      teamName: data.team_name,
      teamShortName: data.team_short_name,
      role: data.role,
      expiresAt: data.expires_at,
    };
  },

  async acceptInvitation(token: string): Promise<{ teamId: string; teamName: string; role: TeamRole }> {
    const { data, error } = await getSupabaseClient().rpc('accept_team_invitation', { p_token: token });
    if (error) throw error;
    return { teamId: data.team_id, teamName: data.team_name, role: data.role };
  },

  async listRoster(teamId: string): Promise<TeamRosterMember[]> {
    const client = getSupabaseClient();
    const { data: roster, error } = await client.from('team_players')
      .select('player_id, jersey_no, is_captain, is_keeper, created_at')
      .eq('team_id', teamId)
      .order('created_at');
    if (error) throw error;
    const playerIds = roster.map(member => member.player_id);
    const [{ data: players, error: playerError }, { data: accounts, error: accountError }] = await Promise.all([
      playerIds.length
        ? client.from('players').select('id, profile_id, display_name, role').in('id', playerIds)
        : Promise.resolve({ data: [], error: null }),
      client.from('team_account_members')
        .select('account_id, player_id, status')
        .eq('team_id', teamId)
        .eq('status', 'ACTIVE'),
    ]);
    if (playerError) throw playerError;
    if (accountError) throw accountError;
    const playerById = new Map((players ?? []).map(player => [player.id, player]));
    const accountByPlayer = new Map((accounts ?? [])
      .filter(member => member.player_id)
      .map(member => [member.player_id as string, member.account_id]));
    return roster.map(member => ({
      accountId: accountByPlayer.get(member.player_id),
      playerId: member.player_id,
      name: playerById.get(member.player_id)?.display_name ?? 'Team player',
      role: member.is_captain ? 'CAPTAIN' : 'PLAYER',
      status: 'ACTIVE',
      joinedAt: member.created_at,
      jerseyNo: member.jersey_no ?? undefined,
      playerRole: normalizePlayerRole(playerById.get(member.player_id)?.role),
      isKeeper: Boolean(member.is_keeper),
    }));
  },

  async searchRegisteredPlayers(teamId: string, query: string): Promise<RegisteredPlayerSearchResult[]> {
    if (query.trim().length < 2) return [];
    const { data, error } = await getSupabaseClient().rpc('search_registered_players', {
      p_team_id: teamId,
      p_query: query.trim(),
      p_limit: 20,
    });
    if (error) throw error;
    return data.map((player: {
      player_id: string;
      account_id?: string | null;
      display_name: string;
      avatar_url?: string | null;
      membership_role?: TeamRole | null;
    }) => ({
      playerId: player.player_id,
      accountId: player.account_id ?? undefined,
      name: player.display_name,
      avatarUrl: player.avatar_url ?? undefined,
      currentRole: player.membership_role ?? undefined,
    }));
  },

  async assignRegisteredPlayer(teamId: string, playerId: string, role: TeamRole): Promise<void> {
    const { error } = await getSupabaseClient().rpc('assign_registered_player', {
      p_team_id: teamId,
      p_player_id: playerId,
      p_role: role,
    });
    if (error) throw error;
  },

  async removeTeamPlayer(teamId: string, playerId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('remove_team_player', {
      p_team_id: teamId,
      p_player_id: playerId,
    });
    if (error) throw error;
  },

  async listInvitations(teamId: string): Promise<TeamInvitation[]> {
    const { data, error } = await getSupabaseClient().from('team_invitations')
      .select('id, role, invited_email, use_count, max_uses, expires_at, revoked_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(invite => ({
      id: invite.id,
      role: invite.role,
      invitedEmail: invite.invited_email ?? undefined,
      useCount: invite.use_count,
      maxUses: invite.max_uses,
      expiresAt: invite.expires_at,
      revokedAt: invite.revoked_at ?? undefined,
    }));
  },

  async revokeInvitation(invitationId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('revoke_team_invitation', {
      p_invitation_id: invitationId,
    });
    if (error) throw error;
  },
};

function normalizePlayerRole(role: unknown): TeamRosterMember['playerRole'] {
  if (role === 'BAT' || role === 'BOWL' || role === 'AR' || role === 'WK') return role;
  return undefined;
}

function imageExtension(uri: string): 'jpg' | 'png' | 'webp' {
  const value = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (value === 'png' || value === 'webp') return value;
  return 'jpg';
}
