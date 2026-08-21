import { getSupabaseClient } from './client';

export interface SportNotification {
  id: string; kind: string; title: string; body: string; deepLink?: string; readAt?: string; createdAt: string;
}

export const sportOperationsApi = {
  async notifications(): Promise<SportNotification[]> {
    const { data, error } = await getSupabaseClient().from('sport_notifications')
      .select('id, kind, title, body, deep_link, read_at, created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []).map(row => ({ id: String(row.id), kind: String(row.kind), title: String(row.title),
      body: String(row.body), deepLink: row.deep_link ? String(row.deep_link) : undefined,
      readAt: row.read_at ? String(row.read_at) : undefined, createdAt: String(row.created_at) }));
  },
  async markRead(notificationId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('mark_sport_notification_read', { p_notification_id: notificationId });
    if (error) throw error;
  },
  async supportAction(competitionId: string, action: 'REBUILD_PROJECTIONS' | 'REFRESH_PUBLIC_SNAPSHOTS' | 'RELEASE_SCORING_LEASE' | 'CREATE_RECOVERY_CHECKPOINT', reason: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('execute_sport_support_action', {
      p_competition_id: competitionId, p_action: action, p_reason: reason.trim(),
    });
    if (error) throw error;
  },
};
