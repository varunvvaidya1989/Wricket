import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageField, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from '@/components/sports/platform/StageUI';
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
import { colors } from '@/lib/wricket/presentation/design';
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
  const [step, setStep] = useState(-1);
  const [serverConfirmed, setServerConfirmed] = useState(false);
  const [venue, setVenue] = useState('');
  const [saveError, setSaveError] = useState<string>();
  const savingRef = useRef(false);
  const [editingRules, setEditingRules] = useState(false);
  const requiredSlots = matchFormat === 'SINGLES' ? [0, 2] : [0, 1, 2, 3];
  const creatorSelected = requiredSlots.some((slot) => (
    players[slot]?.accountId === auth.session?.user.id
  ));
  const allSlotsSelected = requiredSlots.every((slot) => players[slot]);
  const playersReady = allSlotsSelected && creatorSelected;
  const canStart = playersReady && serverConfirmed;

  useEffect(() => {
    const accountId = auth.session?.user.id;
    if (!accountId) return;
    let active = true;
    void sportRosterApi.getMySportProfile(accountId, presentation.catalogCode)
      .then((profile) => {
        if (!active) return;
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
      .catch((cause) => { if (active) setProfileError(supabaseErrorMessage(
        cause,
        `Could not load your ${config.name} profile. Check your connection and try again.`,
      )); });
    return () => { active = false; };
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
    setServerConfirmed(false);
    setQuery('');
    setResults([]);
    setPlayerPickerOpen(false);
  };

  const chooseFormat = (format: MatchFormat) => {
    setMatchFormat(format);
    setServerConfirmed(false);
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
    if (!canStart || savingRef.current) return;
    savingRef.current = true;
    setSaveError(undefined);
    setSaving(true);
    try {
      const scoringMatchId = await sportScoringApi.createStandalone({
        sportCode: presentation.catalogCode,
        matchFormat,
        sideAProfileIds: sides.sideA.map((player) => player!.sportProfileId),
        sideBProfileIds: sides.sideB.map((player) => player!.sportProfileId),
        rulesSnapshot: { initial_server: initialServer, options: rules, ...(venue.trim() ? { venue: venue.trim() } : {}) },
      });
      router.replace(`/${presentation.routeSegment}/match/${scoringMatchId}/score` as Href);
    } catch (cause) {
      setSaveError(supabaseErrorMessage(
        cause,
        'Could not start scoring. Check your connection and try again.',
      ));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const serverName = players[initialServer === 0 ? 0 : 2]?.displayName;
  const sideNames = [sides.sideA.map(player => player?.displayName).filter(Boolean).join(' / '), sides.sideB.map(player => player?.displayName).filter(Boolean).join(' / ')];
  const header = step === 0 ? 'Players & serve' : step === 1 ? 'Match rules' : step === 2 ? 'Review match' : 'New match';
  const back = () => step >= 0 ? setStep(-1) : router.canGoBack() ? router.back() : router.replace(`/${presentation.routeSegment}` as Href);
  return <StagePage focused title={header} eyebrow={config.name.toUpperCase()} onBack={back} footer={
    <StageButton primary title={step === 0 ? 'Use these players' : step === 1 ? 'Use these rules' : step === 2 ? 'Start match' : 'Review match'} disabled={saving || Boolean(profileError) || (step === 0 ? !canStart : step !== 1 && !canStart)} loading={saving} onPress={() => step === 0 || step === 1 ? setStep(-1) : step === 2 ? void start() : setStep(2)} />
  }>
    {step === -1 ? <>
      <StageIntro eyebrow={`NEW ${config.name.toUpperCase()} MATCH`} title="Ready when you are." description="Review the essentials before play starts." />
      <StageList>
        <StageRow title="Players" detail={allSlotsSelected ? `${sideNames[0]} vs ${sideNames[1]}` : `${requiredSlots.filter(slot => !players[slot]).length} player slots to fill · ${matchFormat.toLowerCase()}`} symbol={playersReady ? '✓' : '+'} onPress={() => setStep(0)} />
        <StageRow title="Match rules" detail={sportRulesSummary(sportId, rules)} symbol="✓" onPress={() => setStep(1)} />
        <StageRow title="First server" detail={serverConfirmed ? serverName : 'Choose who serves first'} symbol={serverConfirmed ? '✓' : '↗'} onPress={() => setStep(0)} />
      </StageList>
      <StageField label="Venue (optional)" value={venue} onChangeText={setVenue} maxLength={160} placeholder="Club · Court" />
      <StageNotice>Both sides and the first server must be confirmed before starting.</StageNotice>
    </> : null}
    {step === 0 ? <>
      <StageIntro eyebrow="MATCH PLAYERS" title="Who’s playing?" description={`Select yourself and eligible SportStage ${config.name} players, then confirm the first server.`} />
      <StageText variant="eyebrow" muted>MATCH FORMAT</StageText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Match format">{config.matchFormats.map(format => <Pressable key={format} accessibilityRole="radio" aria-checked={matchFormat === format} accessibilityState={{ checked: matchFormat === format }} onPress={() => chooseFormat(format)} style={[styles.format, matchFormat === format && styles.selected]}><StageText style={matchFormat === format ? styles.accentText : undefined}>{format === 'DOUBLES' ? 'Doubles' : 'Singles'}</StageText></Pressable>)}</View>
      {([0, 1] as const).map(side => <View key={side} style={styles.section}>
        <StageText variant="eyebrow" muted>SIDE {side === 0 ? 'A' : 'B'}</StageText>
        {requiredSlots.filter(slot => (slot < 2 ? 0 : 1) === side).map(slot => <View key={slot} style={styles.playerSlot}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${slotLabel(slot)}: ${players[slot]?.displayName ?? 'Choose a player'}`} onPress={() => openPlayerPicker(slot)} style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.avatar}><StageText style={styles.accentText}>{players[slot]?.displayName[0]?.toUpperCase() || '+'}</StageText></View>
            <View style={styles.flex}><StageText variant="small" muted>{slotLabel(slot)}</StageText><StageText variant="rowTitle">{players[slot]?.displayName ?? 'Choose a player'}{players[slot]?.accountId === auth.session?.user.id ? ' · You' : ''}</StageText></View>
          </Pressable>
          {players[slot] ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${players[slot]?.displayName}`} style={styles.closeButton} onPress={() => { setPlayers(current => { const next = [...current] as typeof current; next[slot] = undefined; return next; }); setServerConfirmed(false); }}><MaterialCommunityIcons name="close" size={19} color={colors.textMuted} /></Pressable> : null}
        </View>)}
      </View>)}
      {allSlotsSelected && !creatorSelected ? <StageNotice>Select yourself in one of the player slots.</StageNotice> : null}
      <StageText variant="eyebrow" muted>FIRST SERVER</StageText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="First server">{([0, 1] as const).map(side => <Pressable key={side} accessibilityRole="radio" aria-checked={serverConfirmed && initialServer === side} accessibilityState={{ checked: serverConfirmed && initialServer === side, disabled: !playersReady }} disabled={!playersReady} onPress={() => { setInitialServer(side); setServerConfirmed(true); }} style={[styles.format, serverConfirmed && initialServer === side && styles.serverSelected]}><StageText style={serverConfirmed && initialServer === side ? styles.serverText : undefined}>{players[side === 0 ? 0 : 2]?.displayName ?? `Side ${side ? 'B' : 'A'}`}</StageText></Pressable>)}</View>
    </> : null}
    {step === 1 ? <>
      <StageIntro eyebrow={config.name.toUpperCase()} title="Know the format." description="The selected rules are used when your match starts." />
      <View style={styles.reviewCard}><StageText variant="heading">Standard match</StageText><StageText muted>{sportRulesSummary(sportId, rules)}</StageText></View>
      <StageNotice>{sportId === 'pickleball' ? 'In side-out scoring, winning a rally does not always earn a point. The scoring screen names the rally winner.' : 'The scoring screen uses this sport’s points, games and sets.'}</StageNotice>
      <StageButton title={editingRules ? 'Hide rule options' : 'Customize match rules'} onPress={() => setEditingRules(!editingRules)} />
      {editingRules ? <SportMatchRulesEditor sportId={sportId} value={rules} onChange={setRules} accent={colors.accent} /> : null}
    </> : null}
    {step === 2 ? <>
      <StageIntro eyebrow="READY TO PLAY" title="One last look." description="Starting creates the match and opens the scoring screen." />
      <StageList>
        <StageRow title="Players" detail={`${sideNames[0]} vs ${sideNames[1]} · ${matchFormat.toLowerCase()}`} symbol="1" onPress={() => setStep(0)} />
        <StageRow title="Rules" detail={sportRulesSummary(sportId, rules)} symbol="2" onPress={() => setStep(1)} />
        <StageRow title="First server" detail={serverName} symbol="3" onPress={() => setStep(0)} />
        <StageRow title="Venue" detail={venue.trim() || 'Not specified'} symbol="4" onPress={() => setStep(-1)} />
      </StageList>
      <StageButton title="Edit match setup" onPress={() => setStep(-1)} />
    </> : null}
    {profileError ? <><StageNotice retry={() => setProfileRetry(value => value + 1)}>{profileError}</StageNotice><StageButton title="Manage my sports" onPress={() => router.push('/account')} /></> : null}
    {saveError ? <StageNotice>{saveError} Your setup is retained; try starting again.</StageNotice> : null}
    <Modal visible={playerPickerOpen} transparent animationType="fade" onRequestClose={() => setPlayerPickerOpen(false)}>
      <View style={styles.overlay}><View style={styles.pickerCard}>
        <View style={styles.pickerHeader}><View style={styles.flex}><StageText variant="eyebrow" muted>{slotLabel(activeSlot)}</StageText><StageText variant="heading">Choose a player</StageText></View><Pressable accessibilityRole="button" accessibilityLabel="Close player search" onPress={() => setPlayerPickerOpen(false)} style={styles.closeButton}><MaterialCommunityIcons name="close" size={21} color={colors.text} /></Pressable></View>
        <TextInput accessibilityLabel={`Search ${config.name} players`} autoFocus value={query} onChangeText={setQuery} placeholder={`Search ${config.name} players`} placeholderTextColor={colors.textMuted} style={styles.input} />
        {searchError ? <StageNotice retry={() => setSearchRetry(value => value + 1)}>{searchError}</StageNotice> : null}
        {searching ? <StageText variant="small" muted>Finding players…</StageText> : null}
        <ScrollView style={styles.resultList} contentContainerStyle={styles.resultListContent} keyboardShouldPersistTaps="handled">
          {selectableResults.map(player => <Pressable key={player.sportProfileId} accessibilityRole="button" accessibilityLabel={`Select ${player.displayName}`} onPress={() => choosePlayer(player)} style={styles.searchResult}><View style={styles.avatar}><StageText style={styles.accentText}>{player.displayName[0]?.toUpperCase()}</StageText></View><StageText variant="rowTitle" style={styles.flex}>{player.displayName}</StageText><StageText variant="eyebrow" style={styles.accentText}>{player.accountId === auth.session?.user.id ? 'YOU' : 'SELECT'}</StageText></Pressable>)}
          {!selectableResults.length && !searching && !searchError ? <StageText variant="small" muted style={styles.emptyResults}>{query.trim().length === 1 ? 'Type one more character to search other players.' : `No matching ${config.name} players found.`}</StageText> : null}
        </ScrollView>
      </View></View>
    </Modal>
  </StagePage>;
}

function slotLabel(slot: number): string {
  return `${slot < 2 ? 'Side A' : 'Side B'} · Player ${slot % 2 + 1}`;
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  format: { flex: 1, minWidth: 0, minHeight: 52, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface },
  selected: { borderColor: '#6b8b53', backgroundColor: '#24361f' },
  serverSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  serverText: { color: colors.bg },
  accentText: { color: colors.accent },
  playerSlot: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#263b25', alignItems: 'center', justifyContent: 'center' },
  reviewCard: { padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, gap: 12 },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#41543b', borderRadius: 10, backgroundColor: '#111b13', color: colors.text, fontFamily: 'Inter_400Regular', fontSize: 13 },
  searchResult: { minHeight: 58, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  overlay: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.72)' },
  pickerCard: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '80%', padding: 18, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 16, backgroundColor: colors.surface, gap: 12 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resultList: { flexGrow: 0 },
  resultListContent: { gap: 8 },
  emptyResults: { paddingVertical: 18, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
});
