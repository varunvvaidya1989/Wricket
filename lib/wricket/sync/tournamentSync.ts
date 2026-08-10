import { getTeam, getTournament, getUser } from '@/lib/wricket/db/repo';
import {
  getTeamPlayerForSync,
  listPendingSyncItems,
  markSyncComplete,
  markSyncFailed,
  mergeCloudTeam,
  mergeCloudTeamPlayer,
  mergeCloudTournament,
  mergeCloudPlayer,
  retryFailedSyncItems,
  seedSyncOutbox,
  splitMembershipId,
  updateTournamentCloudMedia,
} from '@/lib/wricket/db/syncRepo';
import type { MatchFormat, PlayerRole } from '@/lib/wricket/domain/types';
import {
  listCloudPlayers,
  listCloudTeamPlayers,
  listCloudTeams,
  listCloudTournaments,
  upsertCloudTeam,
  upsertCloudTeamPlayer,
  upsertCloudTournament,
  upsertCloudPlayer,
} from '@/lib/supabase/wricketSync';

export interface SyncSummary {
  uploaded: number;
  downloaded: number;
  failed: number;
}

export async function syncTournamentData(
  userId: string,
  options: { forceRetry?: boolean } = {},
): Promise<SyncSummary> {
  const summary: SyncSummary = { uploaded: 0, downloaded: 0, failed: 0 };
  await seedSyncOutbox();
  if (options.forceRetry) await retryFailedSyncItems();

  for (const item of await listPendingSyncItems()) {
    try {
      if (item.entityType === 'TOURNAMENT') {
        const tournament = await getTournament(item.entityId);
        if (!tournament) continue;
        const uploaded = await upsertCloudTournament(tournament, userId);
        await updateTournamentCloudMedia(item.entityId, uploaded.bannerUrl, uploaded.logoUrl);
        await markSyncComplete(item, uploaded.cloudId);
      } else if (item.entityType === 'TEAM') {
        const team = await getTeam(item.entityId);
        if (!team) continue;
        if (!team.tournamentId) throw new Error('Standalone teams are not cloud-synced yet');
        const tournament = await getTournament(team.tournamentId);
        if (!tournament?.cloudId) throw new Error('Tournament must sync before its teams');
        const cloudId = await upsertCloudTeam(team, tournament.cloudId);
        await markSyncComplete(item, cloudId);
      } else if (item.entityType === 'PLAYER') {
        const player = await getUser(item.entityId);
        if (!player) continue;
        const cloudId = await upsertCloudPlayer(player, userId);
        await markSyncComplete(item, cloudId);
      } else {
        const [teamId, playerId] = splitMembershipId(item.entityId);
        const membership = await getTeamPlayerForSync(teamId, playerId);
        if (!membership) continue;
        if (!membership.team_cloud_id || !membership.player_cloud_id) {
          throw new Error('Team and player must sync before their membership');
        }
        await upsertCloudTeamPlayer({
          teamCloudId: membership.team_cloud_id,
          playerCloudId: membership.player_cloud_id,
          jerseyNo: membership.jersey_no,
          isCaptain: Boolean(membership.is_captain),
          isKeeper: Boolean(membership.is_keeper),
        });
        await markSyncComplete(item);
      }
      summary.uploaded += 1;
    } catch (error) {
      await markSyncFailed(item, errorMessage(error));
      summary.failed += 1;
    }
  }

  const cloudTournaments = await listCloudTournaments();
  const ownedTournamentIds = new Set(
    cloudTournaments.filter(item => item.created_by === userId).map(item => item.id),
  );
  for (const item of cloudTournaments) {
    await mergeCloudTournament({
      cloudId: item.id,
      sourceLocalId: item.created_by === userId ? item.source_local_id : null,
      name: item.name,
      format: item.format as MatchFormat,
      startDate: item.start_at
        ? Date.parse(item.start_at)
        : Date.parse(`${item.start_date}T00:00:00.000Z`),
      endDate: item.end_date ? Date.parse(`${item.end_date}T00:00:00.000Z`) : undefined,
      pointsWin: item.points_win,
      pointsTie: item.points_tie,
      pointsLoss: item.points_loss,
      pointsNoResult: item.points_no_result,
      createdAt: Date.parse(item.created_at),
      organizerProfileId: item.created_by,
      organizerPhone: item.organizer_phone ?? undefined,
      location: item.location ?? undefined,
      latitude: item.latitude ?? undefined,
      longitude: item.longitude ?? undefined,
      googlePlaceId: item.google_place_id ?? undefined,
      googleMapsUrl: item.google_maps_url ?? undefined,
      plannedTeamCount: item.planned_team_count ?? 2,
      playersPerTeam: item.players_per_team ?? 11,
      oversPerMatch: item.overs_per_match ?? 20,
      description: item.description ?? undefined,
      socialMediaUrl: item.social_media_url ?? undefined,
      bannerUrl: item.banner_url ?? undefined,
      logoUrl: item.logo_url ?? undefined,
    });
    summary.downloaded += 1;
  }

  const cloudTeams = await listCloudTeams();
  for (const item of cloudTeams) {
    await mergeCloudTeam({
      cloudId: item.id,
      sourceLocalId: item.tournament_id && ownedTournamentIds.has(item.tournament_id)
        ? item.source_local_id
        : null,
      tournamentCloudId: item.tournament_id,
      name: item.name,
      shortName: item.short_name,
      colorHex: item.color_hex,
      logoUrl: item.logo_url ?? undefined,
      createdAt: Date.parse(item.created_at),
    });
    summary.downloaded += 1;
  }

  const cloudMemberships = await listCloudTeamPlayers();
  const cloudPlayerIds = Array.from(new Set(cloudMemberships.map(item => item.player_id)));
  const cloudPlayers = await listCloudPlayers(cloudPlayerIds);
  for (const item of cloudPlayers) {
    await mergeCloudPlayer({
      cloudId: item.id,
      sourceLocalId: item.created_by === userId ? item.source_local_id : null,
      name: item.display_name,
      role: (item.role ?? 'AR') as PlayerRole,
      battingHand: item.batting_hand === 'RIGHT' || item.batting_hand === 'LEFT'
        ? item.batting_hand
        : undefined,
      bowlingStyle: item.bowling_style ?? undefined,
      createdAt: Date.parse(item.created_at),
    });
    summary.downloaded += 1;
  }

  for (const item of cloudMemberships) {
    await mergeCloudTeamPlayer({
      teamCloudId: item.team_id,
      playerCloudId: item.player_id,
      jerseyNo: item.jersey_no ?? undefined,
      isCaptain: item.is_captain,
      isKeeper: item.is_keeper,
    });
    summary.downloaded += 1;
  }

  return summary;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown synchronization error';
}
