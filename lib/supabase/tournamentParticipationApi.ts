import { getSupabaseClient } from './client';
import type { RegistrationPayment, RegistrationStatus } from './tournamentRegistrationApi';

export interface RegistrationQuestion {
  id: string;
  label: string;
  type: 'TEXT' | 'CHOICE';
  required: boolean;
  options?: string[];
}
export interface PlayerAllocation {
  registration_id: string;
  player_id: string;
  team_id: string;
  captain_label: boolean;
  icon_label: boolean;
}
export interface TrackedApplication {
  id: string;
  tournamentId: string;
  tournamentName: string;
  teamName?: string;
  kind: 'PLAYER' | 'TEAM';
  status: RegistrationStatus;
  payment: RegistrationPayment;
}
export const tournamentParticipationApi = {
  async questions(tournamentId: string): Promise<RegistrationQuestion[]> {
    const { data, error } = await getSupabaseClient().from('tournament_registration_forms').select('questions').eq('tournament_id', tournamentId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.questions ?? [];
  },
  async configureQuestions(tournamentId: string, questions: RegistrationQuestion[]): Promise<void> {
    const { error } = await getSupabaseClient().rpc('configure_tournament_registration_form', { p_tournament_id: tournamentId, p_questions: questions });
    if (error) throw new Error(error.message);
  },
  async allocations(tournamentId: string): Promise<PlayerAllocation[]> {
    const { data, error } = await getSupabaseClient().from('tournament_player_allocations')
      .select('registration_id,player_id,team_id,captain_label,icon_label').eq('tournament_id', tournamentId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async teams(tournamentId: string): Promise<{ id: string; name: string }[]> {
    const { data, error } = await getSupabaseClient().from('teams').select('id,name').eq('tournament_id', tournamentId).order('name');
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  async allocate(registrationId: string, teamId: string | null, captainLabel = false, iconLabel = false): Promise<void> {
    const { error } = await getSupabaseClient().rpc('allocate_tournament_player', {
      p_registration_id: registrationId, p_team_id: teamId, p_captain_label: captainLabel, p_icon_label: iconLabel,
    });
    if (error) throw new Error(error.message);
  },
  async mine(accountId: string): Promise<TrackedApplication[]> {
    const client = getSupabaseClient();
    const [players, teams] = await Promise.all([
      client.from('tournament_player_registrations').select('id,tournament_id,status,payment_status,created_at,tournaments!tournament_id(name)').eq('account_id', accountId).order('created_at', { ascending: false }),
      client.from('tournament_team_applications').select('id,tournament_id,team_name_snapshot,status,payment_status,created_at,tournaments!tournament_id(name)').eq('account_id', accountId).order('created_at', { ascending: false }),
    ]);
    if (players.error) throw new Error(players.error.message);
    if (teams.error) throw new Error(teams.error.message);
    const name = (value: { name: string } | { name: string }[] | null) => (Array.isArray(value) ? value[0]?.name : value?.name) ?? 'Tournament';
    return [...(players.data ?? []).map(row => ({ id: row.id, tournamentId: row.tournament_id, tournamentName: name(row.tournaments), kind: 'PLAYER' as const,
      status: row.status as RegistrationStatus, payment: row.payment_status as RegistrationPayment, createdAt: row.created_at })),
    ...(teams.data ?? []).map(row => ({ id: row.id, tournamentId: row.tournament_id, tournamentName: name(row.tournaments), teamName: row.team_name_snapshot, kind: 'TEAM' as const,
      status: row.status as RegistrationStatus, payment: row.payment_status as RegistrationPayment, createdAt: row.created_at }))]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
