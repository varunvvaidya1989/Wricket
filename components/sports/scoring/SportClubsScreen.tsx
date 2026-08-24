import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import {
  sportRosterApi,
  type SportClubSummary,
  type SportRosterInvitations,
} from '@/lib/supabase/sportRosterApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { SportAvatarButton } from './SportProfileDrawer';

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

  const reload = useCallback(() => {
    const accountId = auth.session?.user.id;
    if (!accountId) return;
    setLoading(true);
    void Promise.all([
      sportRosterApi.listMyClubs(accountId, presentation.catalogCode),
      sportRosterApi.listMyInvitations(accountId, presentation.catalogCode),
    ]).then(([nextClubs, nextInvitations]) => {
      setClubs(nextClubs);
      setInvitations(nextInvitations);
    }).catch((cause) => Alert.alert('Could not load clubs', message(cause)))
      .finally(() => setLoading(false));
  }, [auth.session?.user.id, presentation.catalogCode]);
  useFocusEffect(reload);

  const create = async () => {
    if (!name.trim() || saving) return;
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
      Alert.alert('Could not create club', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const respondClub = async (membershipId: string, accept: boolean) => {
    setSaving(true);
    try {
      const clubId = await sportRosterApi.respondToClubInvitation(membershipId, accept);
      reload();
      if (accept) router.push(`/${presentation.routeSegment}/club/${clubId}` as Href);
    } catch (cause) {
      Alert.alert('Could not respond', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const respondTeam = async (membershipId: string, accept: boolean) => {
    setSaving(true);
    try {
      const teamId = await sportRosterApi.respondToTeamInvitation(membershipId, accept);
      reload();
      if (accept) router.push(`/${presentation.routeSegment}/team/${teamId}` as Href);
    } catch (cause) {
      Alert.alert('Could not respond', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const respondAccess = async (accessType: 'CLUB' | 'TEAM', accessId: string, accept: boolean) => {
    setSaving(true);
    try {
      const resourceId = await sportRosterApi.respondToAccessInvitation(accessType, accessId, accept);
      reload();
      if (accept) router.push(`/${presentation.routeSegment}/${accessType === 'CLUB' ? 'club' : 'team'}/${resourceId}` as Href);
    } catch (cause) {
      Alert.alert('Could not respond', message(cause));
    } finally {
      setSaving(false);
    }
  };

  const invitationCount = invitations.clubs.length + invitations.teams.length + invitations.access.length;

  return (
    <Screen scroll padded={false}>
      <AppHeader title="Clubs & teams" eyebrow={config.name.toUpperCase()} back right={<SportAvatarButton />} />
      <View style={styles.content}>
        <View style={[styles.hero, { borderColor: presentation.accent }]}>
          <MaterialCommunityIcons name="account-group-outline" size={30} color={presentation.accent} />
          <View style={styles.flex}><Text variant="h2">Account-backed rosters</Text><Text variant="caption" tone="muted">Every member is a verified SportStage {config.name} player.</Text></View>
        </View>

        {invitationCount ? (
          <View style={styles.sectionStack}>
            <Text variant="overline" style={{ color: presentation.accent }}>PENDING INVITATIONS · {invitationCount}</Text>
            {invitations.clubs.map((invitation) => (
              <InvitationRow key={invitation.id} title={invitation.clubName} detail="Club membership" disabled={saving} onAccept={() => void respondClub(invitation.id, true)} onDecline={() => void respondClub(invitation.id, false)} />
            ))}
            {invitations.teams.map((invitation) => (
              <InvitationRow key={invitation.id} title={invitation.teamName} detail={`${invitation.clubName} · ${invitation.eligibility.join(' + ')}`} disabled={saving} onAccept={() => void respondTeam(invitation.id, true)} onDecline={() => void respondTeam(invitation.id, false)} />
            ))}
            {invitations.access.map((invitation) => (
              <InvitationRow key={invitation.id} title={invitation.resourceName} detail={`${invitation.role} access`} disabled={saving} onAccept={() => void respondAccess(invitation.accessType, invitation.id, true)} onDecline={() => void respondAccess(invitation.accessType, invitation.id, false)} />
            ))}
          </View>
        ) : null}

        <View style={styles.headingRow}><Text variant="overline" tone="dim">MY CLUBS</Text><Pressable onPress={() => setCreateOpen(true)} style={[styles.smallAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="plus" size={17} color={presentation.accent} /><Text variant="caption" style={{ color: presentation.accent }}>CREATE</Text></Pressable></View>
        {loading ? <SportStageLoader variant="compact" message={`Loading ${config.name} clubs`} detail="" accent={presentation.accent} /> : clubs.length ? clubs.map((club) => (
          <Pressable key={club.id} onPress={() => router.push(`/${presentation.routeSegment}/club/${club.id}` as Href)} style={({ pressed }) => [styles.clubCard, pressed && styles.pressed]}>
            <View style={[styles.clubIcon, { backgroundColor: `${presentation.accent}16` }]}><Text variant="h3" style={{ color: presentation.accent }}>{initials(club.shortName || club.name)}</Text></View>
            <View style={styles.flex}><Text variant="bodyStrong">{club.name}</Text><Text variant="caption" tone="muted">{club.visibility} · {club.ownerAccountId === auth.session?.user.id ? 'OWNER' : club.myMembershipStatus}</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
          </Pressable>
        )) : <View style={styles.empty}><MaterialCommunityIcons name="account-group-outline" size={30} color={colors.textDim} /><Text variant="bodyStrong">No clubs yet</Text><Text variant="caption" tone="muted">Create a club to build reusable teams and invite SportStage players.</Text></View>}
      </View>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.overlay}><View style={styles.modalCard}>
          <View style={styles.headingRow}><Text variant="h2">Create {config.name} club</Text><Pressable onPress={() => setCreateOpen(false)}><MaterialCommunityIcons name="close" size={24} color={colors.textMuted} /></Pressable></View>
          <TextInput value={name} onChangeText={setName} maxLength={120} placeholder="Club name" placeholderTextColor={colors.textDim} style={styles.input} />
          <TextInput value={shortName} onChangeText={setShortName} maxLength={20} placeholder="Short name (optional)" placeholderTextColor={colors.textDim} style={styles.input} />
          <View style={styles.choiceRow}>{(['PUBLIC', 'PRIVATE'] as const).map((item) => <Pressable key={item} onPress={() => setVisibility(item)} style={[styles.choice, visibility === item && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}14` }]}><Text variant="caption" style={visibility === item ? { color: presentation.accent } : undefined}>{item}</Text></Pressable>)}</View>
          <Button title="Create club" disabled={!name.trim()} loading={saving} onPress={() => void create()} fullWidth style={{ backgroundColor: presentation.accent }} />
        </View></View>
      </Modal>
    </Screen>
  );
}

function InvitationRow({ title, detail, disabled, onAccept, onDecline }: { title: string; detail: string; disabled: boolean; onAccept: () => void; onDecline: () => void }) {
  return <View style={styles.invitation}><View style={styles.flex}><Text variant="bodyStrong">{title}</Text><Text variant="caption" tone="muted">{detail}</Text></View><Pressable disabled={disabled} onPress={onDecline}><Text variant="overline" tone="danger">DECLINE</Text></Pressable><Pressable disabled={disabled} onPress={onAccept}><Text variant="overline" tone="accent">ACCEPT</Text></Pressable></View>;
}

function initials(value: string): string {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Please try again.';
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  hero: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionStack: { gap: spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  smallAction: { minHeight: 36, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  clubCard: { minHeight: 76, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clubIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  invitation: { minHeight: 68, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 520, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing.md },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontFamily: 'Inter_500Medium' },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
