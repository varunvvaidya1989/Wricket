import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  canManageCompetition,
  createSportCompetition,
  listScoringSessions,
  listSportCompetitions,
  removeSportCompetition,
  saveSportCompetition,
  type CompetitionKind,
  type MatchFormat,
  type ScoringSessionRecord,
  type ScoringSportId,
  type SportCompetitionRecord,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportCompetitionsScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [competitions, setCompetitions] = useState<readonly SportCompetitionRecord[]>([]);
  const [sessions, setSessions] = useState<readonly ScoringSessionRecord[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CompetitionKind>('TOURNAMENT');
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('SINGLES');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    void Promise.all([listSportCompetitions(sportId), listScoringSessions()])
      .then(([storedCompetitions, storedSessions]) => {
        setCompetitions(storedCompetitions);
        setSessions(storedSessions.filter((session) => session.sportId === sportId));
      })
      .catch(() => { setCompetitions([]); setSessions([]); });
  }, [sportId]);
  useFocusEffect(reload);

  const create = async () => {
    if (!name.trim() || saving) return;
    const creatorAccountId = auth.session?.user.id;
    if (!creatorAccountId) {
      Alert.alert('Sign in required', 'Sign in to create a competition.');
      return;
    }
    setSaving(true);
    try {
      const competition = await saveSportCompetition(createSportCompetition({
        sportId,
        name,
        kind,
        matchFormat: kind === 'LEAGUE' ? 'SINGLES' : matchFormat,
        creatorAccountId,
        creatorName: auth.profile?.displayName ?? auth.session?.user.email ?? 'Competition creator',
      }));
      setName('');
      setCreateOpen(false);
      reload();
      router.push(`/${presentation.routeSegment}/competition/${competition.id}` as Href);
    } catch (cause) {
      Alert.alert('Could not create competition', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (competition: SportCompetitionRecord) => {
    if (!canManageCompetition(competition, auth.session?.user.id)) {
      Alert.alert('Creator access required', 'Only the competition creator can delete this competition.');
      return;
    }
    Alert.alert(
    `Delete ${competition.kind.toLowerCase()}?`,
    'Matches already scored will remain in Match history.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeSportCompetition(competition.id).then(reload) },
    ],
    );
  };

  return (
    <Screen scroll padded={false}>
      <AppHeader
        title="Competitions"
        eyebrow={config.name.toUpperCase()}
        right={<View style={styles.headerActions}><Pressable accessibilityLabel="Create competition" onPress={() => setCreateOpen(true)} style={[styles.headerAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="plus" size={23} color={presentation.accent} /></Pressable><SportAvatarButton /></View>}
      />
      <View style={styles.content}>
        <View style={styles.summary}>
          <SummaryValue value={competitions.filter((item) => item.kind === 'TOURNAMENT').length} label="TOURNAMENTS" />
          <SummaryValue value={competitions.filter((item) => item.kind === 'LEAGUE').length} label="LEAGUES" />
          <SummaryValue value={sessions.filter((item) => item.competitionId).length} label="MATCHES" />
        </View>
        <Button title="Create tournament or league" fullWidth onPress={() => setCreateOpen(true)} style={{ backgroundColor: presentation.accent }} />

        {competitions.length ? competitions.map((competition) => {
          const matchCount = sessions.filter((session) => session.competitionId === competition.id).length;
          const canManage = canManageCompetition(competition, auth.session?.user.id);
          return (
            <Pressable
              key={competition.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${competition.name}`}
              onPress={() => router.push(`/${presentation.routeSegment}/competition/${competition.id}` as Href)}
              style={({ pressed }) => [styles.competition, pressed && styles.pressed]}
            >
              <View style={[styles.kindIcon, { backgroundColor: `${presentation.accent}16` }]}>
                <MaterialCommunityIcons name={competition.kind === 'LEAGUE' ? 'table-large' : 'tournament'} size={23} color={presentation.accent} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>{competition.name}</Text>
                <Text variant="caption" tone="dim">{competition.kind} · {competition.matchFormat} · {matchCount} MATCHES</Text>
                <Text variant="caption" tone="muted">{canManage ? 'CREATED BY YOU' : `VIEWING · ${competition.creatorName}`}</Text>
              </View>
              <View style={[styles.playButton, { backgroundColor: presentation.accent }]}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accentInk} />
              </View>
              {canManage ? <Pressable
                accessibilityLabel={`Delete ${competition.name}`}
                hitSlop={8}
                onPress={(event) => { event.stopPropagation(); remove(competition); }}
                style={styles.deleteButton}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.textDim} />
              </Pressable> : null}
            </Pressable>
          );
        }) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="trophy-outline" size={32} color={colors.textDim} />
            <Text variant="bodyStrong">No competitions yet</Text>
            <Text variant="caption" tone="muted" style={styles.emptyCopy}>Create a tournament or league, add entrants, then schedule each match manually.</Text>
          </View>
        )}
      </View>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <View><Text variant="overline" tone="dim">{config.name}</Text><Text variant="h2">New competition</Text></View>
              <Pressable accessibilityLabel="Close" onPress={() => setCreateOpen(false)} style={styles.close}><MaterialCommunityIcons name="close" size={21} color={colors.textMuted} /></Pressable>
            </View>
            <TextInput value={name} onChangeText={setName} autoFocus maxLength={60} placeholder="Competition name" placeholderTextColor={colors.textDim} style={styles.input} />
            <View style={styles.kindSelector}>
              {(['TOURNAMENT', 'LEAGUE'] as const).map((value) => (
                <Pressable key={value} onPress={() => { setKind(value); if (value === 'LEAGUE') setMatchFormat('SINGLES'); }} style={[styles.kindOption, kind === value && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}16` }]}>
                  <Text variant="caption" style={kind === value ? { color: presentation.accent } : undefined}>{value}</Text>
                </Pressable>
              ))}
            </View>
            {kind === 'TOURNAMENT' ? (
              <View style={styles.formatSection}>
                <Text variant="overline" tone="dim">MATCH FORMAT</Text>
                <View style={styles.kindSelector}>
                  {config.matchFormats.map((value) => (
                    <Pressable key={value} onPress={() => setMatchFormat(value)} style={[styles.kindOption, matchFormat === value && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}16` }]}>
                      <Text variant="caption" style={matchFormat === value ? { color: presentation.accent } : undefined}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.participantNote}>
              <MaterialCommunityIcons name={kind === 'TOURNAMENT' ? 'account-group-outline' : 'account-outline'} size={20} color={presentation.accent} />
              <Text variant="caption" tone="muted" style={styles.flex}>
                {kind === 'TOURNAMENT'
                  ? `Tournaments register teams. Each ${matchFormat.toLowerCase()} team has ${matchFormat === 'DOUBLES' ? 'two players' : 'one player'}.`
                  : 'Leagues register individual players and use singles fixtures.'}
              </Text>
            </View>
            <Button title={`Create ${kind.toLowerCase()}`} loading={saving} disabled={!name.trim()} onPress={() => void create()} fullWidth style={{ backgroundColor: presentation.accent }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SummaryValue({ value, label }: { value: number; label: string }) {
  return <View style={styles.summaryValue}><Text variant="scoreMd">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  headerAction: { width: 40, height: 40, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summary: { paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' },
  summaryValue: { flex: 1, alignItems: 'center', gap: 3 },
  competition: { minHeight: 76, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  deleteButton: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  emptyCopy: { textAlign: 'center', lineHeight: 18 },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center' },
  modalCard: { padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  modalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 38, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16 },
  kindSelector: { flexDirection: 'row', gap: spacing.sm },
  kindOption: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  formatSection: { gap: spacing.sm },
  participantNote: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
