import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  defaultSportRules,
  sportRulesSummary,
  type MatchOptions,
  type MatchFormat,
  type ScoringSportId,
  type Side,
} from '@/lib/sports/scoring';
import { supabaseErrorMessage } from '@/lib/supabase/errorMessage';
import { sportRosterApi, type SportPlayerSearchResult } from '@/lib/supabase/sportRosterApi';
import { sportScoringApi } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportMatchRulesEditor } from './SportMatchRulesEditor';

type PlayerSlot = SportPlayerSearchResult | undefined;

export function SportMatchSetupScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('SINGLES');
  const [players, setPlayers] = useState<[PlayerSlot, PlayerSlot, PlayerSlot, PlayerSlot]>([
    undefined, undefined, undefined, undefined,
  ]);
  const [selfPlayer, setSelfPlayer] = useState<SportPlayerSearchResult>();
  const [activeSlot, setActiveSlot] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SportPlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchRetry, setSearchRetry] = useState(0);
  const [profileRetry, setProfileRetry] = useState(0);
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [initialServer, setInitialServer] = useState<Side>(0);
  const [rules, setRules] = useState<MatchOptions>(() => defaultSportRules(sportId));
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [editingRules, setEditingRules] = useState(false);
  const requiredSlots = matchFormat === 'SINGLES' ? [0, 2] : [0, 1, 2, 3];
  const creatorSelected = requiredSlots.some((slot) => (
    players[slot]?.accountId === auth.session?.user.id
  ));
  const allSlotsSelected = requiredSlots.every((slot) => players[slot]);
  const canStart = allSlotsSelected && creatorSelected;

  useEffect(() => {
    const accountId = auth.session?.user.id;
    if (!accountId) return;
    void sportRosterApi.getMySportProfile(accountId, presentation.catalogCode)
      .then((profile) => {
        if (!profile) {
          setProfileError(`Add ${config.name} to your SportStage account before starting a match.`);
          return;
        }
        setProfileError(undefined);
        setSelfPlayer({
          sportProfileId: profile.id,
          accountId,
          displayName: auth.profile?.displayName ?? auth.session?.user.email?.split('@')[0] ?? 'You',
        });
      })
      .catch((cause) => setProfileError(supabaseErrorMessage(
        cause,
        `Could not load your ${config.name} profile. Check your connection and try again.`,
      )));
  }, [auth.profile?.displayName, auth.session?.user.email, auth.session?.user.id, config.name, presentation.catalogCode, profileRetry]);

  useEffect(() => {
    if (!playerPickerOpen) return;
    if (query.trim().length === 1) { setResults([]); setSearching(false); return; }
    let current = true;
    setSearching(true);
    setSearchError(undefined);
    const timer = setTimeout(() => {
      void sportRosterApi.listMatchOpponents(presentation.catalogCode, query)
        .then((players) => { if (current) setResults(players); })
        .catch((cause) => { if (current) setSearchError(supabaseErrorMessage(cause, 'Could not load players. Check your connection and try again.')); })
        .finally(() => { if (current) setSearching(false); });
    }, query.trim() ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [playerPickerOpen, presentation.catalogCode, query, searchRetry]);

  const sides = useMemo(() => ({
    sideA: matchFormat === 'SINGLES' ? [players[0]] : [players[0], players[1]],
    sideB: matchFormat === 'SINGLES' ? [players[2]] : [players[2], players[3]],
  }), [matchFormat, players]);
  const selectableResults = useMemo(() => {
    const cleanQuery = query.trim().toLocaleLowerCase();
    return (selfPlayer ? [selfPlayer, ...results] : results).filter((player) => (
      (!cleanQuery || player.displayName.toLocaleLowerCase().includes(cleanQuery))
      && !players.some((selected, index) => (
        index !== activeSlot && selected?.sportProfileId === player.sportProfileId
      ))
    ));
  }, [activeSlot, players, query, results, selfPlayer]);
  const choosePlayer = (player: SportPlayerSearchResult) => {
    if (players.some((selected, index) => index !== activeSlot && selected?.sportProfileId === player.sportProfileId)) {
      Alert.alert('Player already selected', 'Every player can appear only once in a match.');
      return;
    }
    setPlayers((current) => {
      const next = [...current] as [PlayerSlot, PlayerSlot, PlayerSlot, PlayerSlot];
      next[activeSlot] = player;
      return next;
    });
    setQuery('');
    setResults([]);
    setPlayerPickerOpen(false);
  };

  const chooseFormat = (format: MatchFormat) => {
    setMatchFormat(format);
    if (format === 'SINGLES') {
      setPlayers((current) => [current[0], undefined, current[2], undefined]);
      setActiveSlot(0);
    }
  };

  const openPlayerPicker = (slot: number) => {
    setActiveSlot(slot);
    setQuery('');
    setResults([]);
    setPlayerPickerOpen(true);
  };

  const start = async () => {
    const accountId = auth.session?.user.id;
    if (!accountId) { Alert.alert('Sign in required', 'Sign in to create a match.'); return; }
    if (!creatorSelected) { Alert.alert('Select yourself', 'Choose yourself in one of the player slots.'); return; }
    if (!canStart || saving) return;
    setSaving(true);
    try {
      const scoringMatchId = await sportScoringApi.createStandalone({
        sportCode: presentation.catalogCode,
        matchFormat,
        sideAProfileIds: sides.sideA.map((player) => player!.sportProfileId),
        sideBProfileIds: sides.sideB.map((player) => player!.sportProfileId),
        rulesSnapshot: { initial_server: initialServer, options: rules },
      });
      router.replace(`/${presentation.routeSegment}/match/${scoringMatchId}/score` as Href);
    } catch (cause) {
      Alert.alert('Could not start match', supabaseErrorMessage(
        cause,
        'Could not start scoring. Check your connection and try again.',
      ));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded={false} edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="New match" eyebrow={config.name.toUpperCase()} back />
      <View style={styles.steps}>
        {['Players', 'Rules', 'Review'].map((label, index) => <View key={label} style={[styles.step, index === step && styles.currentStep]}><View style={[styles.stepNumber, index <= step && styles.stepNumberActive]}><Text variant="bodyStrong" style={index <= step ? styles.serverText : undefined}>{index < step ? '✓' : index + 1}</Text></View><Text variant="caption" tone={index === step ? 'default' : 'muted'}>{label}</Text></View>)}
      </View>
      <ScrollView key={step} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
      <View style={styles.content}>
        <View style={styles.sportHero}>
          <View style={styles.sportIcon}><SportIcon code={presentation.catalogCode} color={colors.accent} size={30} /></View>
          <View style={styles.flex}><Text variant="h2">{config.name}</Text><Text variant="caption" tone="muted">{presentation.rulesSummary}</Text></View>
        </View>

        {step === 0 ? <>
        <Text variant="h2">Who’s playing?</Text>
        <View style={styles.section}>
          <Text variant="overline" tone="dim">MATCH FORMAT</Text>
          <View style={styles.row}>{config.matchFormats.map((format) => <Pressable key={format} accessibilityRole="radio" accessibilityState={{ checked: matchFormat === format }} onPress={() => chooseFormat(format)} style={[styles.format, matchFormat === format && styles.selected]}><MaterialCommunityIcons name={format === 'DOUBLES' ? 'account-multiple' : 'account'} size={20} color={matchFormat === format ? colors.accent : colors.textDim} /><Text variant="bodyStrong" style={matchFormat === format ? styles.accentText : undefined}>{format === 'DOUBLES' ? 'Doubles' : 'Singles'}</Text></Pressable>)}</View>
        </View>

        <View style={styles.section}>
          <View style={styles.heading}><Text variant="overline" tone="dim">PLAYERS</Text><Text variant="caption" tone="muted">Same sport only</Text></View>
          {requiredSlots.map((slot) => <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`${slotLabel(slot)}: ${players[slot]?.displayName ?? 'Choose a player'}`} onPress={() => openPlayerPicker(slot)} style={[styles.playerSlot, playerPickerOpen && activeSlot === slot && styles.selected]}>
            <View style={styles.avatar}><Text variant="bodyStrong" tone="accent">{players[slot]?.displayName.charAt(0).toUpperCase() || '+'}</Text></View>
            <View style={styles.flex}><Text variant="overline" tone="dim">{slotLabel(slot)}</Text><Text variant="bodyStrong">{players[slot]?.displayName ?? 'Choose a player'}{players[slot]?.accountId === auth.session?.user.id ? ' · You' : ''}</Text></View>
            {players[slot]
              ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${players[slot]?.displayName}`} style={styles.closeButton} onPress={(event) => { event.stopPropagation(); setPlayers((current) => { const next = [...current] as typeof current; next[slot] = undefined; return next; }); }}><MaterialCommunityIcons name="close" size={19} color={colors.textDim} /></Pressable>
              : <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} />}
          </Pressable>)}
          {profileError ? <View style={styles.section}><Text variant="caption" tone="danger">{profileError}</Text><Button title="Retry profile" variant="secondary" onPress={() => setProfileRetry(profileRetry + 1)} /><Button title="Manage my sports" variant="ghost" onPress={() => router.push('/account')} /></View> : null}
          {allSlotsSelected && !creatorSelected ? <Text variant="caption" tone="danger">Select yourself in one of the player slots.</Text> : null}
          <Text variant="caption" tone="muted">Select yourself in any slot, then choose SportStage users who have also selected {config.name}.</Text>
        </View>
        </> : null}

        {step === 1 ? <>
        <Text variant="h2">Make it your match</Text>
        <View style={styles.section}>
          <Text variant="overline" tone="dim">FIRST SERVER</Text>
          <View style={styles.row}>{([0, 1] as const).map((side) => <Pressable key={side} accessibilityRole="radio" accessibilityState={{ checked: initialServer === side }} onPress={() => setInitialServer(side)} style={[styles.format, initialServer === side && styles.serverSelected]}><Text variant="bodyStrong" style={initialServer === side ? styles.serverText : undefined}>{players[side === 0 ? 0 : 2]?.displayName ?? `Side ${side ? 'B' : 'A'}`}</Text></Pressable>)}</View>
        </View>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: editingRules }} onPress={() => setEditingRules(!editingRules)} style={styles.rulesSummary}>
          <View style={styles.flex}><Text variant="bodyStrong">Match rules</Text><Text variant="caption" tone="muted">{sportRulesSummary(sportId, rules)}</Text></View>
          <MaterialCommunityIcons name={editingRules ? 'chevron-up' : 'pencil-outline'} size={22} color={colors.accent} />
        </Pressable>
        {editingRules ? <SportMatchRulesEditor sportId={sportId} value={rules} onChange={setRules} accent={presentation.accent} /> : <Text variant="caption" tone="muted">The standard format is ready to use. Tap above to customize it.</Text>}
        </> : null}

        {step === 2 ? <>
          <Text variant="h2">Ready to play?</Text>
          <View style={styles.reviewCard}>
            <Text variant="overline" tone="accent">{matchFormat}</Text>
            <Text variant="h2">{sides.sideA.map(player => player?.displayName).join(' / ')}</Text>
            <Text variant="caption" tone="muted">versus</Text>
            <Text variant="h2">{sides.sideB.map(player => player?.displayName).join(' / ')}</Text>
            <View style={styles.reviewDivider} />
            <Text tone="muted">First serve: {players[initialServer === 0 ? 0 : 2]?.displayName}</Text>
            <Text variant="caption" tone="muted">{sportRulesSummary(sportId, rules)}</Text>
          </View>
          <Text tone="muted">Tap the rally winner to score. You can undo the last rally if you make a mistake.</Text>
        </> : null}
      </View>
      </ScrollView>
      <View style={styles.footer}>
        {step === 0 && !canStart ? <Text variant="caption" tone="muted">{requiredSlots.filter(slot => !players[slot]).length} player slots remaining. Include yourself to continue.</Text> : null}
        <View style={styles.row}>
          {step > 0 ? <Button title="Back" variant="secondary" disabled={saving} onPress={() => setStep(step - 1)} /> : null}
          {step < 2 ? <Button title={step === 0 ? 'Continue to rules' : 'Review match'} disabled={!canStart || Boolean(profileError)} onPress={() => setStep(step + 1)} style={styles.flex} /> : <Button title="Start scoring" size="lg" disabled={!canStart || Boolean(profileError)} loading={saving} onPress={() => void start()} style={styles.flex} />}
        </View>
      </View>

      <Modal visible={playerPickerOpen} transparent animationType="fade" onRequestClose={() => setPlayerPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <View style={styles.flex}><Text variant="overline" tone="dim">{slotLabel(activeSlot)}</Text><Text variant="h3">Choose a player</Text></View>
              <Pressable accessibilityLabel="Close player search" onPress={() => setPlayerPickerOpen(false)} style={styles.closeButton}><MaterialCommunityIcons name="close" size={21} color={colors.text} /></Pressable>
            </View>
            <TextInput accessibilityLabel={`Search ${config.name} players`} autoFocus value={query} onChangeText={setQuery} placeholder={`Search ${config.name} players`} placeholderTextColor={colors.textDim} style={styles.input} />
            {searchError ? <View style={styles.section}><Text tone="danger">{searchError}</Text><Button title="Retry search" variant="secondary" onPress={() => setSearchRetry(searchRetry + 1)} /></View> : null}
            {searching ? <Text variant="caption" tone="muted">Finding players…</Text> : null}
            <ScrollView style={styles.resultList} contentContainerStyle={styles.resultListContent} keyboardShouldPersistTaps="handled">
              {selectableResults.map((player) => <Pressable key={player.sportProfileId} onPress={() => choosePlayer(player)} style={styles.searchResult}><View style={styles.avatar}><Text variant="bodyStrong" tone="accent">{player.displayName.charAt(0).toUpperCase()}</Text></View><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" tone="accent">{player.accountId === auth.session?.user.id ? 'YOU' : 'SELECT'}</Text></Pressable>)}
              {!selectableResults.length && !searching && !searchError ? <Text variant="caption" tone="muted" style={styles.emptyResults}>{query.trim().length === 1 ? 'Type one more character to search other players.' : `No matching ${config.name} players found.`}</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function slotLabel(slot: number): string {
  return `${slot < 2 ? 'Side A' : 'Side B'} · Player ${slot % 2 + 1}`;
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  steps: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 8 },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: colors.border },
  currentStep: { borderBottomColor: colors.accent },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  stepNumberActive: { backgroundColor: colors.accent },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, gap: 10 },
  rulesSummary: { padding: 18, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewCard: { padding: 24, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 14 },
  reviewDivider: { height: 1, backgroundColor: colors.border },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  sportHero: { padding: spacing.md, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sportIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: spacing.sm },
  format: { flex: 1, minHeight: 52, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 3 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  serverSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  serverText: { color: colors.accentInk },
  accentText: { color: colors.accent },
  playerSlot: { minHeight: 62, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 15 },
  searchResult: { minHeight: 58, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  overlay: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)' },
  pickerCard: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '80%', padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, gap: spacing.md },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  closeButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  resultList: { flexGrow: 0 },
  resultListContent: { gap: spacing.sm },
  emptyResults: { paddingVertical: spacing.lg, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
});
