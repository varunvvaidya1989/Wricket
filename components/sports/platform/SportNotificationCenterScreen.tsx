import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/components/providers/AuthProvider';
import { StageIntro, StageList, StageNotice, StagePage, StageRow, StageStateArt, StageText } from './StageUI';
import { notificationDestination } from '@/lib/sports/platform/notificationDestination';
import { sportOperationsApi, type SportNotification } from '@/lib/supabase/sportOperationsApi';

export function SportNotificationCenterScreen() {
  const auth = useAuth();
  const router = useRouter();
  const accountId = auth.session?.user.id;
  const generation = useRef(0);
  const opening = useRef(false);
  const [result, setResult] = useState<{ accountId?: string; items: SportNotification[] }>({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const items = result.accountId === accountId ? result.items : [];
  useFocusEffect(useCallback(() => {
    const request = ++generation.current;
    setLoading(true); setError(undefined);
    if (!accountId) { setResult({ items: [] }); setLoading(false); return; }
    void sportOperationsApi.notifications().then(next => { if (request === generation.current) setResult({ accountId, items: next }); })
      .catch(cause => { if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Could not load notifications.'); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    return () => { generation.current += 1; };
    // A retry intentionally re-runs the focused request without changing the account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, attempt]));

  const open = async (item: SportNotification) => {
    if (opening.current) return;
    opening.current = true;
    const request = generation.current;
    try {
      const destination = notificationDestination(item.deepLink);
      if (item.deepLink && !destination) throw new Error('This notification link is unavailable. Open the sport to review the update.');
      if (!item.readAt) {
        await sportOperationsApi.markRead(item.id);
        if (request !== generation.current) return;
        setResult(current => ({ ...current, items: current.items.map(entry => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry) }));
      }
      if (request === generation.current && destination) router.push(destination as Href);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Could not open notification.');
    } finally { opening.current = false; }
  };
  const attention = items.filter(item => !item.readAt && ['INVITATION', 'OFFICIAL_ASSIGNMENT'].includes(item.kind));
  const updates = items.filter(item => !attention.includes(item));
  const rows = (entries: SportNotification[]) => <StageList>{entries.map(item => <StageRow key={item.id} symbol={item.kind === 'INVITATION' ? '+' : '↗'} title={`${!item.readAt ? '● ' : ''}${item.title}`} detail={`${item.body} · ${new Date(item.createdAt).toLocaleString()}`} onPress={() => void open(item)} />)}</StageList>;
  return <StagePage focused title="Notifications">
    <StageIntro eyebrow="YOUR UPDATES" title="Pick up where it matters." description="Invitations and useful changes in one place." />
    {error ? <StageNotice retry={() => setAttempt(value => value + 1)}>{error}</StageNotice> : null}
    {loading ? <StageNotice>Checking your notifications…</StageNotice> : null}
    {!loading && !error && !items.length ? <View style={{ gap: 18 }}><StageStateArt symbol="✓" /><StageIntro eyebrow="ALL CAUGHT UP" title="Nothing waiting on you." description="Invitations, schedules and match results will appear here." /></View> : null}
    {attention.length ? <><StageText variant="eyebrow" muted>NEEDS YOUR ATTENTION</StageText>{rows(attention)}</> : null}
    {updates.length ? <><StageText variant="eyebrow" muted>MATCHDAY</StageText>{rows(updates)}</> : null}
  </StagePage>;
}

