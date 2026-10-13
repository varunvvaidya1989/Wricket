import { getSupabaseClient } from './client';
import type { PlayerRole } from '@/lib/wricket/domain/types';

export type TournamentEntryMode = 'PLAYER_POOL' | 'EXISTING_TEAMS';
export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type RegistrationPayment = 'NOT_REQUIRED' | 'PENDING' | 'DONE';
export interface RegistrationSettings {
  tournament_id: string;
  entry_mode: TournamentEntryMode;
  published_at: string | null;
  registration_open: boolean;
  fee_required: boolean;
  fee_label: string;
  payment_instructions: string;
}
export interface PlayerRegistration {
  id: string;
  tournament_id: string;
  account_id: string;
  player_id: string;
  playing_role: PlayerRole;
  contact_phone: string;
  applicant_note: string;
  status: RegistrationStatus;
  payment_status: RegistrationPayment;
  payment_required: boolean;
  created_at: string;
  players: { display_name: string } | null;
  custom_answers: Record<string, string>;
}
export interface RegisteredTournamentPlayer {
  registration_id: string;
  player_id: string;
  account_id: string;
  display_name: string;
  playing_role: PlayerRole;
  registered_at: string;
}
export const ENTRY_MODE_LABELS: Record<TournamentEntryMode, string> = {
  PLAYER_POOL: 'Player pool & auction', EXISTING_TEAMS: 'Existing teams',
};
export const PLAYING_ROLE_LABELS: Record<PlayerRole, string> = {
  BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicketkeeper',
};
export const PAYMENT_LABELS: Record<RegistrationPayment, string> = {
  NOT_REQUIRED: 'Not required', PENDING: 'Pending', DONE: 'Done',
};

export const tournamentRegistrationApi = {
  async settings(tournamentId: string): Promise<RegistrationSettings | null> {
    const { data, error } = await getSupabaseClient().from('tournament_registration_settings')
      .select('tournament_id,entry_mode,published_at,registration_open,fee_required,fee_label,payment_instructions')
      .eq('tournament_id', tournamentId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async configure(settings: RegistrationSettings, published: boolean): Promise<void> {
    const { error } = await getSupabaseClient().rpc('configure_tournament_registration', {
      p_tournament_id: settings.tournament_id, p_entry_mode: settings.entry_mode,
      p_published: published, p_open: settings.registration_open, p_fee_required: settings.fee_required,
      p_fee_label: settings.fee_label, p_payment_instructions: settings.payment_instructions,
    });
    if (error) throw error;
  },
  // RLS limits this query to the applicant's own row or all rows for the organiser.
  async applications(tournamentId: string, accountId?: string): Promise<PlayerRegistration[]> {
    let query = getSupabaseClient().from('tournament_player_registrations')
      .select('id,tournament_id,account_id,player_id,playing_role,contact_phone,applicant_note,status,payment_status,payment_required,created_at,custom_answers,players!player_id(display_name)')
      .eq('tournament_id', tournamentId);
    if (accountId) query = query.eq('account_id', accountId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    // Supabase's ungenerated relationship types infer an array for this many-to-one relation.
    return (data ?? []).map(row => ({ ...row, players: Array.isArray(row.players) ? row.players[0] ?? null : row.players })) as PlayerRegistration[];
  },
  async directory(tournamentId: string): Promise<RegisteredTournamentPlayer[]> {
    const { data, error } = await getSupabaseClient().rpc('list_registered_tournament_players', { p_tournament_id: tournamentId });
    if (error) throw error;
    return data ?? [];
  },
  async submit(tournamentId: string, role: PlayerRole, phone: string, note: string, answers: Record<string, string> = {}): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc('submit_tournament_player_form', {
      p_tournament_id: tournamentId, p_role: role, p_phone: phone.trim(), p_note: note.trim(),
      p_answers: answers,
    });
    if (error) throw error;
    return data;
  },
  async review(id: string, status?: Exclude<RegistrationStatus, 'WITHDRAWN'>, payment?: RegistrationPayment): Promise<void> {
    const { error } = await getSupabaseClient().rpc('review_tournament_player_registration', {
      p_registration_id: id, p_status: status ?? null, p_payment_status: payment ?? null,
    });
    if (error) throw error;
  },
  async withdraw(id: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('withdraw_tournament_player_registration', { p_registration_id: id });
    if (error) throw error;
  },
};
