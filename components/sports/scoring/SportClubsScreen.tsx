import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from '@/components/sports/platform/StageUI';
import {
  sportRosterApi,
  type SportClubSummary,
  type SportRosterInvitations,
} from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/wricket/presentation/design';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { supabaseErrorMessage } from '@/lib/supabase/errorMessage';

export function SportClubsScreen({ sportId }: { sportId: ScoringSportId }) {
  const auth = useAuth();
  const router = useRouter();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [clubs, setClubs] = useState<SportClubSummary[]>([]);
  const [invitations, setInvitations] = useState<SportRosterInvitations>({ clubs: [], teams: [], access: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [owner, setOwner] = useState<string>();
  const requestRef = useRef(0);
  const savingRef = useRef(false);
  const currentOwner = `${auth.session?.user.id ?? ''}:${presentation.catalogCode}`;

  const reload = useCallback(() => {
    const request = ++requestRef.current;
    const accountId = auth.session?.user.id;
    if (!accountId) return;
    setLoading(true);
    setLoadError(undefined);
    void Promise.all([
      sportRosterApi.listMyClubs(accountId, presentation.catalogCode),
      sportRosterApi.listMyInvitations(accountId, presentation.catalogCode),
    ]).then(([nextClubs, nextInvitations]) => {
      if (request !== requestRef.current) return;
      setClubs(nextClubs);
      setInvitations(nextInvitations);
      setOwner(currentOwner);
    }).catch((cause) => { if (request === requestRef.current) setLoadError(message(cause)); })
      .finally(() => { if (request === requestRef.current) setLoading(false); });
  }, [auth.session?.user.id, currentOwner, presentation.catalogCode]);
  useFocusEffect(useCallback(() => { reload(); return () => { requestRef.current++; }; }, [reload]));

  const create = async () => {
    if (!name.trim() || savingRef.current) return;
    savingRef.current = true;
    setActionError(undefined);
    setSaving(true);
    try {
      const clubId = await sportRosterApi.createClub({
        sportCode: presentation.catalogCode,
        name,
        shortName,
        visibility,
      });
      setName('');
      setShortName('');
      setCreateOpen(false);
      router.push(`/${presentation.routeSegment}/club/${clubId}` as Href);
    } catch (cause) {
      setActionError(message(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const respondClub = async (membershipId: string, accept: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setActionError(undefined);
    setSaving(true);
    try {
      const clubId = await sportRosterApi.respondToClubInvitation(membershipId, accept);
      reload();
      if (accept) router.push(`/${presentation.routeSegment}/club/${clubId}` as Href);
    } catch (cause) {
      setActionError(message(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const respondTeam = async (membershipId: string, accept: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setActionError(undefined);
    setSaving(true);
    try {
      const teamId = await sportRosterApi.respondToTeamInvitation(membershipId, accept);
      reload();
      if (accept) router.push(`/${presentation.routeSegment}/team/${teamId}` as Href);
    } catch (cause) {
      setActionError(message(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const respondAccess = async (accessType: 'CLUB' | 'TEAM', accessId: string, accept: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setActionError(undefined);
    setSaving(true);
    try {
      const resourceId = await sportRosterApi.respondToAccessInvitation(accessType, accessId, accept);
      reload();
      if (accept) router.push(`/${presentation.routeSegment}/${accessType === 'CLUB' ? 'club' : 'team'}/${resourceId}` as Href);
    } catch (cause) {
      setActionError(message(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const currentInvitations = owner === currentOwner ? invitations : { clubs: [], teams: [], access: [] };
  const currentClubs = owner === currentOwner ? clubs : [];
  const invitationCount = currentInvitations.clubs.length + currentInvitations.teams.length + currentInvitations.access.length;
  return <StagePage focused title="Clubs" eyebrow={config.name.toUpperCase()}>
    <StageIntro eyebrow="YOUR PLAYING GROUPS" title="Find your regular group." description="Your clubs, reusable teams and pending invitations." />
    {loadError ? <StageNotice retry={reload}>{loadError}</StageNotice> : null}
    {actionError ? <StageNotice>{actionError}</StageNotice> : null}
    {loading ? <StageNotice>Loading your clubs…</StageNotice> : null}
    {invitationCount ? <>
      <StageText variant="eyebrow" muted>PENDING INVITATIONS · {invitationCount}</StageText>
      {currentInvitations.clubs.map(item => <InvitationRow key={item.id} title={item.clubName} detail="Club membership" disabled={saving} onAccept={() => void respondClub(item.id, true)} onDecline={() => void respondClub(item.id, false)} />)}
      {currentInvitations.teams.map(item => <InvitationRow key={item.id} title={item.teamName} detail={`${item.clubName} · ${item.eligibility.join(' + ')}`} disabled={saving} onAccept={() => void respondTeam(item.id, true)} onDecline={() => void respondTeam(item.id, false)} />)}
      {currentInvitations.access.map(item => <InvitationRow key={item.id} title={item.resourceName} detail={`${item.role} access`} disabled={saving} onAccept={() => void respondAccess(item.accessType, item.id, true)} onDecline={() => void respondAccess(item.accessType, item.id, false)} />)}
    </> : null}
    <StageText variant="eyebrow" muted>MY CLUBS</StageText>
    {currentClubs.length ? <StageList>{currentClubs.map(club => <StageRow key={club.id} title={club.name} detail={`${club.visibility.toLowerCase()} · ${club.ownerAccountId === auth.session?.user.id ? 'Owner' : club.myMembershipStatus?.toLowerCase() ?? 'Member'}`} symbol={initials(club.shortName || club.name)} onPress={() => router.push(`/${presentation.routeSegment}/club/${club.id}` as Href)} />)}</StageList> : !loading && !loadError ? <StageNotice>No clubs yet. Create a club for your regular group or accept an invitation above.</StageNotice> : null}
    <StageButton primary title="Create a club" onPress={() => { setActionError(undefined); setCreateOpen(true); }} />
    <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => !saving && setCreateOpen(false)}>
      <View style={styles.overlay}><View style={styles.modalCard}>
        <StageIntro eyebrow={config.name.toUpperCase()} title="Create your club." description="Give your playing group a name and choose who can discover it." />
        <StageField label="Club name" value={name} onChangeText={setName} maxLength={120} placeholder="Your club name" />
        <StageField label="Short name (optional)" value={shortName} onChangeText={setShortName} maxLength={20} placeholder="Short name" />
        <View style={styles.choiceRow} accessibilityRole="radiogroup" accessibilityLabel="Club visibility">{(['PUBLIC', 'PRIVATE'] as const).map(item => <Pressable key={item} accessibilityRole="radio" aria-checked={visibility === item} accessibilityState={{ checked: visibility === item }} onPress={() => setVisibility(item)} style={[styles.choice, visibility === item && { borderColor: colors.accent, backgroundColor: '#24361f' }]}><StageText style={visibility === item ? { color: colors.accent } : undefined}>{item === 'PUBLIC' ? 'Public' : 'Private'}</StageText></Pressable>)}</View>
        {actionError ? <StageNotice>{actionError}</StageNotice> : null}
        <StageButton primary title="Create club" disabled={!name.trim()} loading={saving} onPress={() => void create()} />
        <StageButton title="Cancel" disabled={saving} onPress={() => setCreateOpen(false)} />
      </View></View>
    </Modal>
  </StagePage>;
}

function InvitationRow({ title, detail, disabled, onAccept, onDecline }: { title: string; detail: string; disabled: boolean; onAccept: () => void; onDecline: () => void }) {
  return <View style={styles.invitation}><StageText variant="rowTitle">{title}</StageText><StageText variant="small" muted>{detail}</StageText><View style={styles.choiceRow}><View style={{ flex: 1 }}><StageButton primary title="Accept" disabled={disabled} onPress={onAccept} /></View><View style={{ flex: 1 }}><StageButton title="Decline" disabled={disabled} onPress={onDecline} /></View></View></View>;
}

function initials(value: string): string { return value.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join(''); }
function message(cause: unknown): string { return supabaseErrorMessage(cause, 'Please try again.'); }
const styles = StyleSheet.create({
  invitation: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, gap: 10 },
  overlay: { flex: 1, padding: 18, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  modalCard: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.bg, gap: 18 },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
