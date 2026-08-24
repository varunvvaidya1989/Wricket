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
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [profileError, setProfileError] = useState<string>();
  const [initialServer, setInitialServer] = useState<Side>(0);
  const [rules, setRules] = useState<MatchOptions>(() => defaultSportRules(sportId));
  const [saving, setSaving] = useState(false);
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
  }, [auth.profile?.displayName, auth.session?.user.email, auth.session?.user.id, config.name, presentation.catalogCode]);

  useEffect(() => {
    if (!playerPickerOpen) return;
    if (query.trim().length === 1) { setResults([]); return; }
    const timer = setTimeout(() => {
      void sportRosterApi.listMatchOpponents(presentation.catalogCode, query)
        .then(setResults)
        .catch((cause) => Alert.alert('Could not search players', supabaseErrorMessage(
          cause,
          'Could not load players. Check your connection and try again.',
        )));
    }, query.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [playerPickerOpen, presentation.catalogCode, query]);

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
    <Screen scroll padded={false}>
      <AppHeader title="New match" eyebrow={config.name.toUpperCase()} back />
      <View style={styles.content}>
        <View style={styles.sportHero}>
          <View style={styles.sportIcon}><SportIcon code={presentation.catalogCode} color={colors.accent} size={30} /></View>
          <View style={styles.flex}><Text variant="h2">{config.name}</Text><Text variant="caption" tone="muted">{presentation.rulesSummary}</Text></View>
        </View>

        <View style={styles.section}>
          <Text variant="overline" tone="dim">MATCH FORMAT</Text>
          <View style={styles.row}>{config.matchFormats.map((format) => <Pressable key={format} onPress={() => chooseFormat(format)} style={[styles.format, matchFormat === format && styles.selected]}><MaterialCommunityIcons name={format === 'DOUBLES' ? 'account-multiple' : 'account'} size={20} color={matchFormat === format ? colors.accent : colors.textDim} /><Text variant="caption" style={matchFormat === format ? styles.accentText : undefined}>{format}</Text></Pressable>)}</View>
        </View>

        <View style={styles.section}>
          <View style={styles.heading}><Text variant="overline" tone="dim">PLAYERS</Text><Text variant="caption" tone="muted">Same sport only</Text></View>
          {requiredSlots.map((slot) => <Pressable key={slot} onPress={() => openPlayerPicker(slot)} style={[styles.playerSlot, playerPickerOpen && activeSlot === slot && styles.selected]}>
            <View style={styles.avatar}><Text variant="bodyStrong" tone="accent">{players[slot]?.displayName.charAt(0).toUpperCase() || '+'}</Text></View>
            <View style={styles.flex}><Text variant="overline" tone="dim">{slotLabel(slot)}</Text><Text variant="bodyStrong">{players[slot]?.displayName ?? 'Choose a player'}{players[slot]?.accountId === auth.session?.user.id ? ' · You' : ''}</Text></View>
            {players[slot]
              ? <Pressable hitSlop={8} onPress={(event) => { event.stopPropagation(); setPlayers((current) => { const next = [...current] as typeof current; next[slot] = undefined; return next; }); }}><MaterialCommunityIcons name="close" size={19} color={colors.textDim} /></Pressable>
              : <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textDim} />}
          </Pressable>)}
          {profileError ? <Text variant="caption" tone="danger">{profileError}</Text> : null}
          {allSlotsSelected && !creatorSelected ? <Text variant="caption" tone="danger">Select yourself in one of the player slots.</Text> : null}
          <Text variant="caption" tone="muted">Select yourself in any slot, then choose SportStage users who have also selected {config.name}.</Text>
        </View>

        <View style={styles.section}>
          <Text variant="overline" tone="dim">FIRST SERVER</Text>
          <View style={styles.row}>{([0, 1] as const).map((side) => <Pressable key={side} onPress={() => setInitialServer(side)} style={[styles.format, initialServer === side && styles.serverSelected]}><Text variant="bodyStrong" numberOfLines={1} style={initialServer === side ? styles.serverText : undefined}>Side {side ? 'B' : 'A'}</Text></Pressable>)}</View>
        </View>

        <SportMatchRulesEditor sportId={sportId} value={rules} onChange={setRules} accent={presentation.accent} />

        <Button title="Start scoring" size="lg" fullWidth disabled={!canStart || Boolean(profileError)} loading={saving} onPress={() => void start()} />
      </View>

      <Modal visible={playerPickerOpen} transparent animationType="fade" onRequestClose={() => setPlayerPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <View style={styles.flex}><Text variant="overline" tone="dim">{slotLabel(activeSlot)}</Text><Text variant="h3">Choose a player</Text></View>
              <Pressable accessibilityLabel="Close player search" onPress={() => setPlayerPickerOpen(false)} style={styles.closeButton}><MaterialCommunityIcons name="close" size={21} color={colors.text} /></Pressable>
            </View>
            <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={`Search ${config.name} players`} placeholderTextColor={colors.textDim} style={styles.input} />
            <ScrollView style={styles.resultList} contentContainerStyle={styles.resultListContent} keyboardShouldPersistTaps="handled">
              {selectableResults.map((player) => <Pressable key={player.sportProfileId} onPress={() => choosePlayer(player)} style={styles.searchResult}><View style={styles.avatar}><Text variant="bodyStrong" tone="accent">{player.displayName.charAt(0).toUpperCase()}</Text></View><Text variant="bodyStrong" style={styles.flex}>{player.displayName}</Text><Text variant="overline" tone="accent">{player.accountId === auth.session?.user.id ? 'YOU' : 'SELECT'}</Text></Pressable>)}
              {!selectableResults.length ? <Text variant="caption" tone="muted" style={styles.emptyResults}>{query.trim().length === 1 ? 'Type one more character to search other players.' : `No matching ${config.name} players found.`}</Text> : null}
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
  pickerCard: { maxHeight: '72%', padding: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surfaceElevated, gap: spacing.md },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  resultList: { flexGrow: 0 },
  resultListContent: { gap: spacing.sm },
  emptyResults: { paddingVertical: spacing.lg, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
});
