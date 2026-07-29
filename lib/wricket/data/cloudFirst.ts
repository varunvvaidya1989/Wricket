import {
  createCloudPlayer,
  createCloudTeam,
  createCloudTournament,
  deleteCloudTeam,
  type CloudTournamentCreateInput,
  upsertCloudTeamPlayer,
} from '@/lib/supabase/wricketSync';
import {
  mergeCloudPlayer,
  mergeCloudTeam,
  mergeCloudTeamPlayer,
  mergeCloudTournament,
} from '@/lib/wricket/db/syncRepo';
import { deleteTeam, getTeam, getTournament, getUser } from '@/lib/wricket/db/repo';
import type { Team, Tournament, User } from '@/lib/wricket/domain/types';

export async function createOnlineTournament(
  input: CloudTournamentCreateInput,
  userId: string,
): Promise<Tournament> {
  const cloud = await createCloudTournament(input, userId);
  await mergeCloudTournament({
    cloudId: cloud.cloudId,
    sourceLocalId: cloud.cloudId,
    name: input.name,
    format: input.format,
    startDate: input.startDate,
    endDate: input.endDate,
    pointsWin: 2,
    pointsTie: 1,
    pointsLoss: 0,
    pointsNoResult: 1,
    createdAt: cloud.createdAt,
    organizerProfileId: userId,
    organizerPhone: input.organizerPhone,
    location: input.location,
    latitude: input.latitude,
    longitude: input.longitude,
    googlePlaceId: input.googlePlaceId,
    googleMapsUrl: input.googleMapsUrl,
    plannedTeamCount: input.plannedTeamCount,
    playersPerTeam: input.playersPerTeam,
    description: input.description,
    socialMediaUrl: input.socialMediaUrl,
    bannerUrl: cloud.bannerUrl,
    logoUrl: cloud.logoUrl,
  });
  const cached = await getTournament(cloud.cloudId);
  if (!cached) throw new Error('Tournament was created online but could not be cached locally');
  return cached;
}

export async function createOnlineTeam(input: {
  tournament: Tournament;
  name: string;
  shortName: string;
  colorHex: string;
}): Promise<Team> {
  if (!input.tournament.cloudId) throw new Error('Tournament is not available online');
  const cloud = await createCloudTeam({
    tournamentId: input.tournament.cloudId,
    name: input.name,
    shortName: input.shortName,
    colorHex: input.colorHex,
  });
  await mergeCloudTeam({
    cloudId: cloud.cloudId,
    sourceLocalId: cloud.cloudId,
    tournamentCloudId: input.tournament.cloudId,
    name: input.name,
    shortName: input.shortName,
    colorHex: input.colorHex,
    createdAt: cloud.createdAt,
  });
  const cached = await getTeam(cloud.cloudId);
  if (!cached) throw new Error('Team was created online but could not be cached locally');
  return cached;
}

export async function deleteOnlineTeam(team: Team): Promise<void> {
  if (!team.cloudId) throw new Error('Team is not available online');
  await deleteCloudTeam(team.cloudId);
  await deleteTeam(team.id);
}

export async function createOnlinePlayerForTeam(input: {
  team: Team;
  name: string;
  role: User['role'];
  battingHand?: User['battingHand'];
  bowlingStyle?: string;
  userId: string;
}): Promise<User> {
  if (!input.team.cloudId) throw new Error('Team is not available online');
  const cloud = await createCloudPlayer(input, input.userId);
  await mergeCloudPlayer({
    cloudId: cloud.cloudId,
    sourceLocalId: cloud.cloudId,
    name: input.name,
    role: input.role,
    battingHand: input.battingHand,
    bowlingStyle: input.bowlingStyle,
    createdAt: cloud.createdAt,
  });
  await upsertCloudTeamPlayer({
    teamCloudId: input.team.cloudId,
    playerCloudId: cloud.cloudId,
    jerseyNo: null,
    isCaptain: false,
    isKeeper: false,
  });
  await mergeCloudTeamPlayer({
    teamCloudId: input.team.cloudId,
    playerCloudId: cloud.cloudId,
    isCaptain: false,
    isKeeper: false,
  });
  const cached = await getUser(cloud.cloudId);
  if (!cached) throw new Error('Player was created online but could not be cached locally');
  return cached;
}
