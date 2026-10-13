import * as Linking from 'expo-linking';
import { getSupabaseClient } from './client';
import { teamManagementApi, type MyTeamSummary } from './teamManagementApi';
import type { PlayerRole } from '@/lib/wricket/domain/types';
import { tournamentRegistrationApi, type RegistrationPayment, type RegistrationStatus } from './tournamentRegistrationApi';

export interface TournamentTeamApplication {
  id: string;
  tournament_id: string;
  account_id: string;
  source_team_id: string | null;
  team_name_snapshot: string;
  contact_phone: string;
  applicant_note: string;
  status: RegistrationStatus;
  payment_required: boolean;
  payment_status: RegistrationPayment;
  entry_team_id: string | null;
  custom_answers: Record<string, string>;
}
export interface TournamentEntryInvitation {
  id: string;
  kind: 'TEAM_APPLICATION' | 'CLAIM_CAPTAIN';
  placeholder_team_id: string | null;
  target_account_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  use_count: number;
  max_uses: number;
}
export interface TournamentEntryPreview {
  kind: TournamentEntryInvitation['kind'];
  tournament_id: string;
  tournament_name: string;
  team_id: string | null;
  team_name: string | null;
  expires_at: string;
  fee_required: boolean;
  fee_label: string;
  payment_instructions: string;
}
export interface TournamentRosterPlayer {
  player_id: string;
  account_id: string | null;
  display_name: string;
  playing_role: PlayerRole;
  team_names: string[];
}
export const tournamentTeamEntryApi = {
  async availablePlaces(tournamentId: string): Promise<number> {
    const [{ data: tournament, error }, entries] = await Promise.all([
      getSupabaseClient().from('tournaments').select('planned_team_count').eq('id', tournamentId).single(),
      getSupabaseClient().from('teams').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    ]);
    if (error) throw new Error(error.message);
    if (entries.error) throw new Error(entries.error.message);
    return Math.max(0, tournament.planned_team_count - (entries.count ?? 0));
  },
  async placeholderIds(tournamentId: string): Promise<Set<string>> {
    if ((await tournamentRegistrationApi.settings(tournamentId))?.entry_mode === 'PLAYER_POOL') return new Set();
    const { data, error } = await getSupabaseClient().from('teams').select('id').eq('tournament_id', tournamentId).is('source_team_id', null);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map(row => row.id));
  },
  async applications(tournamentId: string, accountId?: string): Promise<TournamentTeamApplication[]> {
    let query = getSupabaseClient().from('tournament_team_applications')
      .select('id,tournament_id,account_id,source_team_id,team_name_snapshot,contact_phone,applicant_note,status,payment_required,payment_status,entry_team_id,custom_answers')
      .eq('tournament_id', tournamentId);
    if (accountId) query = query.eq('account_id', accountId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async eligibleTeams(accountId: string, tournamentId: string): Promise<MyTeamSummary[]> {
    const [mine, applications, { data: entries, error }] = await Promise.all([
      teamManagementApi.listMine(accountId), tournamentTeamEntryApi.applications(tournamentId),
      getSupabaseClient().from('teams').select('source_team_id').eq('tournament_id', tournamentId),
    ]);
    if (error) throw new Error(error.message);
    const unavailable = new Set([...applications.map(row => row.source_team_id), ...(entries ?? []).map(row => row.source_team_id)]);
    return mine.filter(team => !team.tournamentId && !team.sourceTeamId && (team.role === 'OWNER' || team.role === 'CAPTAIN') && !unavailable.has(team.id));
  },
  async submit(tournamentId: string, sourceTeamId: string, phone: string, note: string, token?: string, answers: Record<string, string> = {}): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('submit_tournament_team_form', {
      p_tournament_id: tournamentId, p_source_team_id: sourceTeamId, p_phone: phone.trim(), p_note: note.trim(), p_token: token ?? null,
      p_answers: answers,
    });
    if (error) throw new Error(error.message);
    return data;
  },
  async review(id: string, status?: Exclude<RegistrationStatus, 'WITHDRAWN'>, payment?: RegistrationPayment): Promise<string | null> {
    const { data, error } = await getSupabaseClient().rpc('review_tournament_team_application', { p_application_id: id, p_status: status ?? null, p_payment_status: payment ?? null });
    if (error) throw new Error(error.message);
    return data;
  },
  async withdraw(id: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('withdraw_tournament_team_application', { p_application_id: id });
    if (error) throw new Error(error.message);
  },
  async createInvitation(tournamentId: string, placeholderId?: string, targetAccountId?: string): Promise<{ id: string; token: string; link: string }> {
    const { data, error } = await getSupabaseClient().rpc('create_tournament_entry_invitation', {
      p_tournament_id: tournamentId, p_placeholder_team_id: placeholderId ?? null, p_target_account_id: targetAccountId ?? null, p_expires_hours: 168,
    });
    if (error) throw new Error(error.message);
    return { id: data.invitation_id, token: data.token, link: Linking.createURL('wricket/tournament/join', { isTripleSlashed: true, queryParams: { token: data.token } }) };
  },
  async invitations(tournamentId: string, placeholderId?: string): Promise<TournamentEntryInvitation[]> {
    let query = getSupabaseClient().from('tournament_entry_invitations').select('id,kind,placeholder_team_id,target_account_id,expires_at,revoked_at,use_count,max_uses').eq('tournament_id', tournamentId);
    query = placeholderId ? query.eq('placeholder_team_id', placeholderId) : query.eq('kind', 'TEAM_APPLICATION');
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async revoke(id: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('revoke_tournament_entry_invitation', { p_invitation_id: id });
    if (error) throw new Error(error.message);
  },
  async preview(token: string): Promise<TournamentEntryPreview> {
    const { data, error } = await getSupabaseClient().rpc('preview_tournament_entry_invitation', { p_token: token });
    if (error) throw new Error(error.message);
    return data;
  },
  async claim(token: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('claim_tournament_placeholder', { p_token: token });
    if (error) throw new Error(error.message);
    return data;
  },
  async rosterPlayers(tournamentId: string): Promise<TournamentRosterPlayer[]> {
    const { data, error } = await getSupabaseClient().rpc('list_tournament_roster_players', { p_tournament_id: tournamentId });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
