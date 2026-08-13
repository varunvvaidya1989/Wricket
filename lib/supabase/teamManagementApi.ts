import * as Linking from 'expo-linking';

import { getTeamByCloudId, updateTeamLogoByCloudId } from '@/lib/wricket/db/repo';
import { mergeCloudPlayer, mergeCloudTeam, mergeCloudTeamPlayer } from '@/lib/wricket/db/syncRepo';
import type { PlayerRole, Team } from '@/lib/wricket/domain/types';
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

export interface MyTeamSummary {
  id: string;
  name: string;
  shortName: string;
  colorHex: string;
  logoUrl?: string;
  role: 'OWNER' | TeamRole;
  tournamentId?: string;
  tournamentName?: string;
  sourceTeamId?: string;
}

export interface StandaloneMatchTeamSummary {
  id: string;
  name: string;
  shortName: string;
  colorHex: string;
  logoUrl?: string;
  reason: 'MY_TEAM' | 'PLAYED_AGAINST';
}

export const teamManagementApi = {
  async listStandaloneMatchTeams(): Promise<StandaloneMatchTeamSummary[]> {
    const { data, error } = await getSupabaseClient().rpc('list_standalone_match_teams');
    if (error) throw error;
    return (data ?? []).map((team: any) => ({
      id: team.team_id,
      name: team.team_name,
      shortName: team.short_name,
      colorHex: team.color_hex,
      logoUrl: team.logo_url ?? undefined,
      reason: team.eligibility_reason,
    }));
  },

  async hydrateTeamsForScoring(teamIds: string[]): Promise<Team[]> {
    if (teamIds.length === 0) return [];
    const client = getSupabaseClient();
    const [{ data: teams, error: teamError }, { data: memberships, error: membershipError }] = await Promise.all([
      client.from('teams')
        .select('id, source_local_id, tournament_id, name, short_name, color_hex, logo_url, created_at')
        .in('id', teamIds),
      client.from('team_players')
        .select('team_id, player_id, jersey_no, is_captain, is_keeper')
        .in('team_id', teamIds),
    ]);
    if (teamError) throw teamError;
    if (membershipError) throw membershipError;

    const playerIds = Array.from(new Set((memberships ?? []).map(member => member.player_id)));
    const { data: players, error: playerError } = playerIds.length
      ? await client.from('players')
        .select('id, source_local_id, display_name, role, batting_hand, bowling_style, created_at')
        .in('id', playerIds)
      : { data: [], error: null };
    if (playerError) throw playerError;

    for (const team of teams ?? []) {
      await mergeCloudTeam({
        cloudId: team.id,
        sourceLocalId: team.source_local_id ?? null,
        tournamentCloudId: team.tournament_id ?? null,
        name: team.name,
        shortName: team.short_name,
        colorHex: team.color_hex,
        logoUrl: team.logo_url ?? undefined,
        createdAt: Date.parse(team.created_at),
      });
    }
    for (const player of players ?? []) {
      await mergeCloudPlayer({
        cloudId: player.id,
        sourceLocalId: player.source_local_id ?? null,
        name: player.display_name,
        role: (player.role ?? 'AR') as PlayerRole,
        battingHand: player.batting_hand === 'RIGHT' || player.batting_hand === 'LEFT'
          ? player.batting_hand
          : undefined,
        bowlingStyle: player.bowling_style ?? undefined,
        createdAt: Date.parse(player.created_at),
      });
    }
    for (const member of memberships ?? []) {
      await mergeCloudTeamPlayer({
        teamCloudId: member.team_id,
        playerCloudId: member.player_id,
        jerseyNo: member.jersey_no ?? undefined,
        isCaptain: member.is_captain,
        isKeeper: member.is_keeper,
      });
    }

    const localTeams = await Promise.all(teamIds.map(getTeamByCloudId));
    return localTeams.filter((team): team is Team => Boolean(team));
  },

  async createTeamEntity(input: {
    name: string;
    shortName: string;
    colorHex: string;
    ownerId: string;
  }): Promise<MyTeamSummary> {
    const name = input.name.trim();
    const shortName = input.shortName.trim().toUpperCase().slice(0, 4);
    if (!name || !shortName) throw new Error('Team name and short name are required');
    const { data, error } = await getSupabaseClient().from('teams').insert({
      tournament_id: null,
      entity_owner_id: input.ownerId,
      source_team_id: null,
      name,
      short_name: shortName,
      color_hex: input.colorHex,
    }).select('id, name, short_name, color_hex, logo_url').single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      shortName: data.short_name,
      colorHex: data.color_hex,
      logoUrl: data.logo_url ?? undefined,
      role: 'OWNER',
    };
  },

  async listMine(accountId: string): Promise<MyTeamSummary[]> {
    const client = getSupabaseClient();
    const { data: memberships, error: membershipError } = await client.from('team_account_members')
      .select('team_id, role')
      .eq('account_id', accountId)
      .eq('status', 'ACTIVE');
    if (membershipError) throw membershipError;
    const memberRoleByTeam = new Map((memberships ?? []).map(member => [member.team_id, member.role as TeamRole]));
    const memberIds = [...memberRoleByTeam.keys()];
    const [{ data: owned, error: ownedError }, memberResult] = await Promise.all([
      client.from('teams')
        .select('id, entity_owner_id, name, short_name, color_hex, logo_url, tournament_id, source_team_id, tournaments(name)')
        .eq('entity_owner_id', accountId),
      memberIds.length
        ? client.from('teams')
          .select('id, entity_owner_id, name, short_name, color_hex, logo_url, tournament_id, source_team_id, tournaments(name)')
          .in('id', memberIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ownedError) throw ownedError;
    if (memberResult.error) throw memberResult.error;
    const rows = new Map<string, any>();
    for (const team of [...(owned ?? []), ...(memberResult.data ?? [])]) rows.set(team.id, team);
    return [...rows.values()]
      .filter(team => !team.source_team_id || !rows.has(team.source_team_id))
      .map((team): MyTeamSummary => {
      const tournament = Array.isArray(team.tournaments) ? team.tournaments[0] : team.tournaments;
      return {
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        colorHex: team.color_hex,
        logoUrl: team.logo_url ?? undefined,
        role: team.entity_owner_id === accountId ? 'OWNER' : memberRoleByTeam.get(team.id) ?? 'PLAYER',
        tournamentId: team.tournament_id ?? undefined,
        tournamentName: tournament?.name ?? undefined,
        sourceTeamId: team.source_team_id ?? undefined,
      };
      }).sort((a, b) => a.name.localeCompare(b.name));
  },

  async listReusableForTournament(accountId: string, tournamentId: string): Promise<MyTeamSummary[]> {
    const [mine, { data: entries, error }] = await Promise.all([
      teamManagementApi.listMine(accountId),
      getSupabaseClient().from('teams')
        .select('id, source_team_id')
        .eq('tournament_id', tournamentId),
    ]);
    if (error) throw error;
    const enteredTeamIds = new Set((entries ?? []).flatMap(team => [
      team.id,
      ...(team.source_team_id ? [team.source_team_id] : []),
    ]));
    return mine.filter(team =>
      team.tournamentId !== tournamentId
      && !enteredTeamIds.has(team.id)
      && (!team.sourceTeamId || !enteredTeamIds.has(team.sourceTeamId)),
    );
  },

  async enterTournament(teamId: string, tournamentId: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('enter_team_in_tournament', {
      p_source_team_id: teamId,
      p_tournament_id: tournamentId,
    });
    if (error) throw error;
    return data;
  },

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

  async setWicketKeeper(teamId: string, playerId: string, isKeeper: boolean): Promise<void> {
    const { error } = await getSupabaseClient().rpc('set_team_player_keeper', {
      p_team_id: teamId,
      p_player_id: playerId,
      p_is_keeper: isKeeper,
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
