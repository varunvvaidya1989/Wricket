import { getSupabaseClient } from './client';

export type SportFormatEligibility = 'SINGLES' | 'DOUBLES';
export type SportMembershipStatus = 'INVITED' | 'ACTIVE' | 'LEFT' | 'REMOVED';

export interface SportPlayerSearchResult {
  sportProfileId: string;
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SportClubSummary {
  id: string;
  sportId: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  ownerAccountId: string;
  myMembershipStatus?: SportMembershipStatus;
}

export interface SportClubMembership {
  id: string;
  clubId: string;
  sportProfileId: string;
  accountId?: string;
  displayName: string;
  avatarUrl?: string;
  status: SportMembershipStatus;
  isManager: boolean;
  acceptedAt?: string;
  endedAt?: string;
}

export interface SportTeamSummary {
  id: string;
  clubId: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
  colorHex?: string;
  ownerAccountId: string;
}

export interface SportTeamMembership {
  id: string;
  teamId: string;
  sportProfileId: string;
  accountId?: string;
  clubMembershipId: string;
  displayName: string;
  avatarUrl?: string;
  status: SportMembershipStatus;
  eligibility: SportFormatEligibility[];
  isCaptain: boolean;
  acceptedAt?: string;
  endedAt?: string;
}

export interface SportRosterInvitations {
  clubs: Array<SportClubMembership & { clubName: string }>;
  teams: Array<SportTeamMembership & { teamName: string; clubName: string }>;
  access: SportAccessInvitation[];
}

export interface SportAccessInvitation {
  id: string;
  accessType: 'CLUB' | 'TEAM';
  resourceId: string;
  resourceName: string;
  role: 'MANAGER' | 'CAPTAIN';
}

const clubFields = 'id, sport_id, name, short_name, logo_url, visibility, owner_account_id';
const clubMembershipFields = 'id, club_id, sport_profile_id, display_name_snapshot, avatar_url_snapshot, status, accepted_at, ended_at';
const teamFields = 'id, club_id, name, short_name, logo_url, color_hex, owner_account_id';
const teamMembershipFields = 'id, team_id, sport_profile_id, club_membership_id, display_name_snapshot, avatar_url_snapshot, status, eligibility, accepted_at, ended_at';

export const sportRosterApi = {
  async searchPlayers(sportCode: string, query: string): Promise<SportPlayerSearchResult[]> {
    if (query.trim().length < 2) return [];
    const { data, error } = await getSupabaseClient().rpc('search_sport_players', {
      p_sport_code: sportCode,
      p_query: query.trim(),
      p_limit: 20,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      sportProfileId: String(row.sport_profile_id),
      accountId: String(row.account_id),
      displayName: String(row.display_name),
      avatarUrl: optionalString(row.avatar_url),
    }));
  },

  async listMyClubs(accountId: string, sportCode: string): Promise<SportClubSummary[]> {
    const client = getSupabaseClient();
    const profile = await getMySportProfile(accountId, sportCode);
    if (!profile) return [];
    const [{ data: memberships, error: membershipError }, { data: owned, error: ownedError }] = await Promise.all([
      client.from('sport_club_memberships')
        .select(`${clubMembershipFields}, sport_clubs!inner(${clubFields}, sports!inner(code))`)
        .eq('sport_profile_id', profile.id)
        .eq('status', 'ACTIVE')
        .eq('sport_clubs.sports.code', sportCode),
      client.from('sport_clubs')
        .select(`${clubFields}, sports!inner(code)`)
        .eq('owner_account_id', accountId)
        .eq('sports.code', sportCode),
    ]);
    if (membershipError) throw membershipError;
    if (ownedError) throw ownedError;

    const clubs = new Map<string, SportClubSummary>();
    for (const row of owned ?? []) {
      const club = mapClub(row as Record<string, unknown>);
      clubs.set(club.id, { ...club, myMembershipStatus: 'ACTIVE' });
    }
    for (const row of memberships ?? []) {
      const relation = one((row as Record<string, unknown>).sport_clubs);
      if (!relation) continue;
      const club = mapClub(relation);
      clubs.set(club.id, {
        ...club,
        myMembershipStatus: String((row as Record<string, unknown>).status) as SportMembershipStatus,
      });
    }
    return [...clubs.values()].sort((left, right) => left.name.localeCompare(right.name));
  },

  async getClub(clubId: string): Promise<SportClubSummary> {
    const { data, error } = await getSupabaseClient().from('sport_clubs')
      .select(clubFields).eq('id', clubId).single();
    if (error) throw error;
    return mapClub(data);
  },

  async createClub(input: {
    sportCode: string;
    name: string;
    shortName?: string;
    visibility: 'PUBLIC' | 'PRIVATE';
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('create_sport_club', {
      p_sport_code: input.sportCode,
      p_name: input.name.trim(),
      p_short_name: input.shortName?.trim() || null,
      p_visibility: input.visibility,
    });
    if (error) throw error;
    return String(data);
  },

  async listClubMemberships(clubId: string): Promise<SportClubMembership[]> {
    const { data, error } = await getSupabaseClient().rpc('list_sport_club_roster', {
      p_club_id: clubId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => mapClubMembership({
      ...row,
      id: row.membership_id,
      club_id: clubId,
    }));
  },

  async canManageClub(clubId: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient().rpc('can_manage_sport_club', {
      p_club_id: clubId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async inviteClubMember(clubId: string, sportProfileId: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('invite_sport_club_member', {
      p_club_id: clubId,
      p_sport_profile_id: sportProfileId,
    });
    if (error) throw error;
    return String(data);
  },

  async respondToClubInvitation(membershipId: string, accept: boolean): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('respond_sport_club_invitation', {
      p_membership_id: membershipId,
      p_accept: accept,
    });
    if (error) throw error;
    return String(data);
  },

  async endClubMembership(membershipId: string, remove = false): Promise<void> {
    const { error } = await getSupabaseClient().rpc('end_sport_club_membership', {
      p_membership_id: membershipId,
      p_remove: remove,
    });
    if (error) throw error;
  },

  async listTeams(clubId: string): Promise<SportTeamSummary[]> {
    const { data, error } = await getSupabaseClient().from('sport_teams')
      .select(teamFields).eq('club_id', clubId).order('name');
    if (error) throw error;
    return (data ?? []).map(mapTeam);
  },

  async getTeam(teamId: string): Promise<SportTeamSummary> {
    const { data, error } = await getSupabaseClient().from('sport_teams')
      .select(teamFields).eq('id', teamId).single();
    if (error) throw error;
    return mapTeam(data);
  },

  async listOwnedTeams(accountId: string, sportCode: string): Promise<SportTeamSummary[]> {
    const { data, error } = await getSupabaseClient().from('sport_teams')
      .select(`${teamFields}, sport_clubs!inner(sports!inner(code))`)
      .eq('owner_account_id', accountId)
      .eq('sport_clubs.sports.code', sportCode)
      .order('name');
    if (error) throw error;
    return (data ?? []).map(mapTeam);
  },

  async createTeam(input: {
    clubId: string;
    name: string;
    shortName?: string;
    colorHex?: string;
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('create_sport_team', {
      p_club_id: input.clubId,
      p_name: input.name.trim(),
      p_short_name: input.shortName?.trim() || null,
      p_color_hex: input.colorHex?.trim() || null,
    });
    if (error) throw error;
    return String(data);
  },

  async listTeamMemberships(teamId: string): Promise<SportTeamMembership[]> {
    const { data, error } = await getSupabaseClient().rpc('list_sport_team_roster', {
      p_team_id: teamId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => mapTeamMembership({
      ...row,
      id: row.membership_id,
      team_id: teamId,
    }));
  },

  async canManageTeam(teamId: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient().rpc('can_manage_sport_team', {
      p_team_id: teamId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async inviteTeamMember(input: {
    teamId: string;
    clubMembershipId: string;
    eligibility: SportFormatEligibility[];
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('invite_sport_team_member', {
      p_team_id: input.teamId,
      p_club_membership_id: input.clubMembershipId,
      p_eligibility: input.eligibility,
    });
    if (error) throw error;
    return String(data);
  },

  async respondToTeamInvitation(membershipId: string, accept: boolean): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('respond_sport_team_invitation', {
      p_membership_id: membershipId,
      p_accept: accept,
    });
    if (error) throw error;
    return String(data);
  },

  async updateEligibility(membershipId: string, eligibility: SportFormatEligibility[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('update_sport_team_member_eligibility', {
      p_membership_id: membershipId,
      p_eligibility: eligibility,
    });
    if (error) throw error;
  },

  async endTeamMembership(membershipId: string, remove = false): Promise<void> {
    const { error } = await getSupabaseClient().rpc('end_sport_team_membership', {
      p_membership_id: membershipId,
      p_remove: remove,
    });
    if (error) throw error;
  },

  async inviteAccess(input: {
    accessType: 'CLUB' | 'TEAM';
    resourceId: string;
    accountId: string;
    role: 'MANAGER' | 'CAPTAIN';
  }): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('invite_sport_access', {
      p_resource_type: input.accessType,
      p_resource_id: input.resourceId,
      p_account_id: input.accountId,
      p_role: input.role,
    });
    if (error) throw error;
    return String(data);
  },

  async respondToAccessInvitation(
    accessType: 'CLUB' | 'TEAM',
    accessId: string,
    accept: boolean,
  ): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('respond_sport_access_invitation', {
      p_access_type: accessType,
      p_access_id: accessId,
      p_accept: accept,
    });
    if (error) throw error;
    return String(data);
  },

  async revokeAccess(input: {
    accessType: 'CLUB' | 'TEAM';
    resourceId: string;
    accountId: string;
    role: 'MANAGER' | 'CAPTAIN';
  }): Promise<void> {
    const { error } = await getSupabaseClient().rpc('revoke_sport_access', {
      p_resource_type: input.accessType,
      p_resource_id: input.resourceId,
      p_account_id: input.accountId,
      p_role: input.role,
    });
    if (error) throw error;
  },

  async listMyInvitations(accountId: string, sportCode: string): Promise<SportRosterInvitations> {
    const profile = await getMySportProfile(accountId, sportCode);
    if (!profile) return { clubs: [], teams: [], access: [] };
    const client = getSupabaseClient();
    const [clubResult, teamResult, clubAccessResult, teamAccessResult] = await Promise.all([
      client.rpc('list_my_sport_club_invitations', { p_sport_code: sportCode }),
      client.rpc('list_my_sport_team_invitations', { p_sport_code: sportCode }),
      client.from('sport_club_access')
        .select('id, club_id, role, sport_clubs!inner(name, sports!inner(code))')
        .eq('account_id', accountId).eq('status', 'PENDING')
        .eq('sport_clubs.sports.code', sportCode),
      client.from('sport_team_access')
        .select('id, team_id, role, sport_teams!inner(name, sport_clubs!inner(sports!inner(code)))')
        .eq('account_id', accountId).eq('status', 'PENDING')
        .eq('sport_teams.sport_clubs.sports.code', sportCode),
    ]);
    const { data: clubRows, error: clubError } = clubResult;
    const { data: teamRows, error: teamError } = teamResult;
    if (clubError) throw clubError;
    if (teamError) throw teamError;
    if (clubAccessResult.error) throw clubAccessResult.error;
    if (teamAccessResult.error) throw teamAccessResult.error;
    return {
      clubs: (clubRows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.membership_id),
        clubId: String(row.club_id),
        sportProfileId: String(row.sport_profile_id),
        displayName: String(row.display_name_snapshot),
        avatarUrl: optionalString(row.avatar_url_snapshot),
        status: 'INVITED' as const,
        isManager: false,
        clubName: String(row.club_name),
      })),
      teams: (teamRows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.membership_id),
        teamId: String(row.team_id),
        sportProfileId: String(row.sport_profile_id),
        clubMembershipId: String(row.club_membership_id),
        displayName: String(row.display_name_snapshot),
        avatarUrl: optionalString(row.avatar_url_snapshot),
        status: 'INVITED' as const,
        eligibility: Array.isArray(row.eligibility)
          ? row.eligibility.filter((item): item is SportFormatEligibility => item === 'SINGLES' || item === 'DOUBLES')
          : [],
        isCaptain: false,
        teamName: String(row.team_name),
        clubName: String(row.club_name),
      })),
      access: [
        ...(clubAccessResult.data ?? []).flatMap((row) => {
          const club = one((row as Record<string, unknown>).sport_clubs);
          return club ? [{
            id: String(row.id),
            accessType: 'CLUB' as const,
            resourceId: String(row.club_id),
            resourceName: String(club.name),
            role: 'MANAGER' as const,
          }] : [];
        }),
        ...(teamAccessResult.data ?? []).flatMap((row) => {
          const team = one((row as Record<string, unknown>).sport_teams);
          return team ? [{
            id: String(row.id),
            accessType: 'TEAM' as const,
            resourceId: String(row.team_id),
            resourceName: String(team.name),
            role: 'CAPTAIN' as const,
          }] : [];
        }),
      ],
    };
  },
};

async function getMySportProfile(
  accountId: string,
  sportCode: string,
): Promise<{ id: string; sportId: string } | undefined> {
  const { data, error } = await getSupabaseClient().from('sport_profiles')
    .select('id, sport_id, sports!inner(code)')
    .eq('account_id', accountId).eq('status', 'ACTIVE')
    .eq('sports.code', sportCode).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, sportId: data.sport_id } : undefined;
}

function mapClub(row: Record<string, unknown>): SportClubSummary {
  return {
    id: String(row.id),
    sportId: String(row.sport_id),
    name: String(row.name),
    shortName: optionalString(row.short_name),
    logoUrl: optionalString(row.logo_url),
    visibility: String(row.visibility) as SportClubSummary['visibility'],
    ownerAccountId: String(row.owner_account_id),
  };
}

function mapClubMembership(row: Record<string, unknown>): SportClubMembership {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    sportProfileId: String(row.sport_profile_id),
    accountId: optionalString(row.account_id),
    displayName: String(row.display_name_snapshot),
    avatarUrl: optionalString(row.avatar_url_snapshot),
    status: String(row.status) as SportMembershipStatus,
    isManager: Boolean(row.is_manager),
    acceptedAt: optionalString(row.accepted_at),
    endedAt: optionalString(row.ended_at),
  };
}

function mapTeam(row: Record<string, unknown>): SportTeamSummary {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: String(row.name),
    shortName: optionalString(row.short_name),
    logoUrl: optionalString(row.logo_url),
    colorHex: optionalString(row.color_hex),
    ownerAccountId: String(row.owner_account_id),
  };
}

function mapTeamMembership(row: Record<string, unknown>): SportTeamMembership {
  const eligibility = Array.isArray(row.eligibility)
    ? row.eligibility.filter((item): item is SportFormatEligibility => (
        item === 'SINGLES' || item === 'DOUBLES'
      ))
    : [];
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    sportProfileId: String(row.sport_profile_id),
    accountId: optionalString(row.account_id),
    clubMembershipId: String(row.club_membership_id),
    displayName: String(row.display_name_snapshot),
    avatarUrl: optionalString(row.avatar_url_snapshot),
    status: String(row.status) as SportMembershipStatus,
    eligibility,
    isCaptain: Boolean(row.is_captain),
    acceptedAt: optionalString(row.accepted_at),
    endedAt: optionalString(row.ended_at),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function one(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}
