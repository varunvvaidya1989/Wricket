import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { SportIcon } from '@/components/sports/SportIcon';
import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  SPORT_CONFIGS,
  SPORT_PRESENTATION,
  canScoreCompetition,
  competitionEntrantPlayers,
  createScoringSession,
  listSportCompetitions,
  saveScoringSession,
  type ScoringSportId,
  type MatchFormat,
  type Side,
} from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SportMatchSetupScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const { competitionId, fixtureId, sideAId: linkedSideAId, sideBId: linkedSideBId } = useLocalSearchParams<{
    competitionId?: string;
    fixtureId?: string;
    sideAId?: string;
    sideBId?: string;
  }>();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('SINGLES');
  const [sideA, setSideA] = useState('Player A');
  const [sideB, setSideB] = useState('Player B');
  const [partnerA, setPartnerA] = useState('');
  const [partnerB, setPartnerB] = useState('');
  const [initialServer, setInitialServer] = useState<Side>(0);
  const [optionEnabled, setOptionEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionError, setPermissionError] = useState<string>();
  const [selectedCompetition, setSelectedCompetition] = useState<{
    id: string;
    name: string;
    kind: 'TOURNAMENT' | 'LEAGUE';
    matchFormat: MatchFormat;
    fixtureId?: string;
    sideEntrantIds?: readonly [string, string];
    sidePlayers?: readonly [readonly string[], readonly string[]];
  }>();
  const playerNames = selectedCompetition?.sidePlayers?.flat() ?? (matchFormat === 'DOUBLES'
    ? [sideA, partnerA, sideB, partnerB]
    : [sideA, sideB]);
  const canStart = playerNames.every((name) => name.trim())
    && new Set(playerNames.map((name) => name.trim().toLowerCase())).size === playerNames.length;
  const sidePlayers: readonly [readonly string[], readonly string[]] = selectedCompetition?.sidePlayers
    ?? (matchFormat === 'DOUBLES'
      ? [[sideA, partnerA], [sideB, partnerB]]
      : [[sideA], [sideB]]);
  const scoringSideNames: readonly [string, string] = selectedCompetition?.fixtureId
    ? [sideA, sideB]
    : matchFormat === 'DOUBLES'
      ? [`${sideA.trim()} / ${partnerA.trim()}`, `${sideB.trim()} / ${partnerB.trim()}`]
      : [sideA, sideB];
  const options = useMemo(
    () => presentation.option ? { [presentation.option.key]: optionEnabled } : {},
    [optionEnabled, presentation.option],
  );

  useEffect(() => {
    if (!competitionId) {
      setSelectedCompetition(undefined);
      setPermissionError(undefined);
      return;
    }
    void listSportCompetitions(sportId).then((competitions) => {
      const competition = competitions.find((candidate) => candidate.id === competitionId);
      if (!competition) {
        setSelectedCompetition(undefined);
        setPermissionError('This competition could not be found.');
        return;
      }
      if (!canScoreCompetition(competition, auth.session?.user.id)) {
        setPermissionError('Only the competition creator or an assigned match official can start scoring.');
      } else {
        setPermissionError(undefined);
      }
      const sideA = competition.entrants.find((entrant) => entrant.id === linkedSideAId);
      const sideB = competition.entrants.find((entrant) => entrant.id === linkedSideBId);
      if (fixtureId && sideA && sideB) {
        const linkedSides = [sideA.id, sideB.id] as const;
        const linkedPlayers = [
          competitionEntrantPlayers(sideA).map((player) => player.name),
          competitionEntrantPlayers(sideB).map((player) => player.name),
        ] as const;
        setSelectedCompetition({
          id: competition.id,
          name: competition.name,
          kind: competition.kind,
          matchFormat: competition.matchFormat,
          fixtureId,
          sideEntrantIds: linkedSides,
          sidePlayers: linkedPlayers,
        });
        setMatchFormat(competition.matchFormat);
        setSideA(sideA.name);
        setSideB(sideB.name);
        return;
      }
      setSelectedCompetition({
        id: competition.id,
        name: competition.name,
        kind: competition.kind,
        matchFormat: competition.matchFormat,
        fixtureId: undefined,
        sideEntrantIds: undefined,
        sidePlayers: undefined,
      });
      setMatchFormat(competition.matchFormat);
    });
  }, [auth.session?.user.id, competitionId, fixtureId, linkedSideAId, linkedSideBId, sportId]);

  const start = async () => {
    if (!canStart || saving || permissionError) return;
    const createdByAccountId = auth.session?.user.id;
    if (!createdByAccountId) {
      Alert.alert('Sign in required', 'Sign in to create a match.');
      return;
    }
    setSaving(true);
    try {
      const session = createScoringSession({
        sportId,
        matchFormat,
        sideNames: scoringSideNames,
        sidePlayers,
        initialServer,
        createdByAccountId,
        competitionId: selectedCompetition?.id,
        fixtureId: selectedCompetition?.fixtureId,
        sideEntrantIds: selectedCompetition?.sideEntrantIds,
        options,
      });
      await saveScoringSession(session);
      router.replace(`/${presentation.routeSegment}/match/${session.id}/score` as Href);
    } catch (cause) {
      Alert.alert('Could not start match', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppHeader title="New match" eyebrow={config.name.toUpperCase()} back />
      <View style={styles.content}>
        <View style={[styles.sportHero, { borderColor: presentation.accent }]}>
          <View style={[styles.sportIcon, { backgroundColor: `${presentation.accent}16` }]}>
            <SportIcon code={presentation.catalogCode} color={presentation.accent} size={32} />
          </View>
          <View style={styles.flex}>
            <Text variant="h2">{config.name}</Text>
            <Text variant="caption" tone="muted" style={styles.rules}>{presentation.rulesSummary}</Text>
          </View>
        </View>

        {permissionError ? (
          <View style={styles.permissionBanner}>
            <MaterialCommunityIcons name="eye-outline" size={20} color={colors.textMuted} />
            <Text variant="caption" tone="muted" style={styles.flex}>{permissionError}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="overline" tone="dim">MATCH FORMAT</Text>
          <View style={styles.formatSelector}>
            {config.matchFormats.map((format) => (
              <Pressable
                key={format}
                accessibilityRole="radio"
                accessibilityState={{ checked: matchFormat === format, disabled: Boolean(selectedCompetition?.fixtureId) }}
                disabled={Boolean(selectedCompetition?.fixtureId)}
                onPress={() => setMatchFormat(format)}
                style={[
                  styles.formatOption,
                  matchFormat === format && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}16` },
                  selectedCompetition?.fixtureId && matchFormat !== format && styles.disabled,
                ]}
              >
                <MaterialCommunityIcons name={format === 'DOUBLES' ? 'account-multiple' : 'account'} size={20} color={matchFormat === format ? presentation.accent : colors.textDim} />
                <Text variant="caption" style={matchFormat === format ? { color: presentation.accent } : undefined}>{format}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption" tone="muted">
            {selectedCompetition?.fixtureId
              ? `Format is fixed by this ${selectedCompetition.kind.toLowerCase()}.`
              : matchFormat === 'DOUBLES' ? 'Enter two players on each side.' : 'Enter one player on each side.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="overline" tone="dim">{selectedCompetition?.kind === 'TOURNAMENT' ? 'TEAMS' : 'PLAYERS'}</Text>
          {selectedCompetition?.fixtureId ? (
            <View style={styles.linkedSides}>
              {([0, 1] as const).map((side) => (
                <View key={side} style={styles.linkedSide}>
                  <Text variant="overline" tone="dim">SIDE {side === 0 ? 'A' : 'B'}</Text>
                  <Text variant="bodyStrong">{side === 0 ? sideA : sideB}</Text>
                  <Text variant="caption" tone="muted">
                    {selectedCompetition.sidePlayers?.[side].join(' · ')}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <>
              <PlayerNameInput label={matchFormat === 'DOUBLES' ? 'SIDE A · PLAYER 1' : 'SIDE A'} value={sideA} onChangeText={setSideA} />
              {matchFormat === 'DOUBLES' ? <PlayerNameInput label="SIDE A · PLAYER 2" value={partnerA} onChangeText={setPartnerA} placeholder="Partner A" /> : null}
              <PlayerNameInput label={matchFormat === 'DOUBLES' ? 'SIDE B · PLAYER 1' : 'SIDE B'} value={sideB} onChangeText={setSideB} />
              {matchFormat === 'DOUBLES' ? <PlayerNameInput label="SIDE B · PLAYER 2" value={partnerB} onChangeText={setPartnerB} placeholder="Partner B" /> : null}
            </>
          )}
          {!canStart ? <Text variant="caption" tone="danger">Every player needs a unique name.</Text> : null}
        </View>

        {selectedCompetition ? (
          <View style={[styles.competitionLink, { borderColor: presentation.accent }]}>
            <MaterialCommunityIcons name="trophy-outline" size={21} color={presentation.accent} />
            <View style={styles.flex}>
              <Text variant="overline" tone="dim">COMPETITION MATCH</Text>
              <Text variant="bodyStrong" numberOfLines={1}>{selectedCompetition.name}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="overline" tone="dim">FIRST SERVER</Text>
          <View style={styles.segmented}>
            {([0, 1] as const).map((side) => (
              <Pressable
                key={side}
                accessibilityRole="radio"
                accessibilityState={{ checked: initialServer === side }}
                onPress={() => setInitialServer(side)}
                style={[
                  styles.segment,
                  initialServer === side && { backgroundColor: presentation.accent, borderColor: presentation.accent },
                ]}
              >
                <MaterialCommunityIcons
                  name="circle-small"
                  size={22}
                  color={initialServer === side ? colors.accentInk : colors.textDim}
                />
                <Text
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={initialServer === side ? styles.selectedSegmentText : undefined}
                >
                  {scoringSideNames[side] || `Side ${side === 0 ? 'A' : 'B'}`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {presentation.option ? (
          <View style={styles.optionCard}>
            <View style={styles.optionCopy}>
              <Text variant="bodyStrong">{presentation.option.label}</Text>
              <Text variant="caption" tone="muted" style={styles.rules}>{presentation.option.description}</Text>
            </View>
            <Switch
              accessibilityLabel={presentation.option.label}
              value={optionEnabled}
              onValueChange={setOptionEnabled}
              trackColor={{ false: colors.borderStrong, true: presentation.accent }}
              thumbColor={optionEnabled ? colors.accentInk : colors.textMuted}
            />
          </View>
        ) : null}

        <View style={styles.offlineNote}>
          <MaterialCommunityIcons name="cloud-off-outline" size={19} color={colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flex}>
            Match events are stored on this device and rebuilt from the rally log whenever you resume.
          </Text>
        </View>

        <Button
          title="Start scoring"
          size="lg"
          fullWidth
          disabled={!canStart || Boolean(permissionError)}
          loading={saving}
          onPress={() => void start()}
          style={{ backgroundColor: presentation.accent }}
        />
      </View>
    </Screen>
  );
}

function PlayerNameInput({
  label,
  value,
  onChangeText,
  placeholder = 'Player name',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.inputWrap}>
      <Text variant="overline" tone="dim">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        maxLength={40}
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  sportHero: { padding: spacing.lg, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sportIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  permissionBanner: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rules: { marginTop: 4, lineHeight: 17 },
  section: { gap: spacing.sm },
  formatSelector: { flexDirection: 'row', gap: spacing.sm },
  formatOption: { flex: 1, minHeight: 58, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  linkedSides: { flexDirection: 'row', gap: spacing.sm },
  linkedSide: { flex: 1, minWidth: 0, minHeight: 88, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: 5 },
  inputWrap: { gap: 6 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16 },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  selectedSegmentText: { color: colors.accentInk },
  optionCard: { minHeight: 78, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  optionCopy: { flex: 1 },
  offlineNote: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  competitionLink: { padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disabled: { opacity: 0.4 },
  flex: { flex: 1, minWidth: 0 },
});
