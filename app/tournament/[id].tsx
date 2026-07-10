import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable, TextInput, Modal, Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, palette } from '@/lib/theme/colors';
import { spacing, radius } from '@/lib/theme/spacing';
import {
  getTournament,
  listTeams,
  createTeam,
  listMatches,
} from '@/lib/db/repo';
import { Tournament, Team, Match, FORMAT_LABEL } from '@/lib/domain/types';
import { computePointsTable, PointsRow } from '@/lib/app/points';

type Tab = 'fixtures' | 'table' | 'teams';

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [points, setPoints] = useState<PointsRow[]>([]);
  const [tab, setTab] = useState<Tab>('fixtures');
  const [showAddTeam, setShowAddTeam] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [t, teamList, matchList] = await Promise.all([
      getTournament(id),
      listTeams(id),
      listMatches(id),
    ]);
    setTournament(t);
    setTeams(teamList);
    setMatches(matchList);
    const pts = await computePointsTable(id);
    setPoints(pts);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!tournament) {
    return <Screen><Text tone="muted">Loading…</Text></Screen>;
  }

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: tournament.name }} />
      <View style={styles.header}>
        <Text variant="overline" tone="muted">{FORMAT_LABEL[tournament.format]}</Text>
        <Text variant="h1">{tournament.name}</Text>
        <Text variant="caption" tone="dim" style={{ marginTop: spacing.xs }}>
          {teams.length} teams · {matches.length} matches
        </Text>
      </View>

      <View style={styles.tabBar}>
        <TabBtn label="Fixtures" active={tab === 'fixtures'} onPress={() => setTab('fixtures')} />
        <TabBtn label="Table" active={tab === 'table'} onPress={() => setTab('table')} />
        <TabBtn label="Teams" active={tab === 'teams'} onPress={() => setTab('teams')} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        {tab === 'fixtures' && (
          <FixturesView
            matches={matches}
            teams={teams}
            tournament={tournament}
            onNew={() => router.push({ pathname: '/match/new', params: { tournamentId: tournament.id } })}
          />
        )}
        {tab === 'table' && <PointsTableView rows={points} teams={teams} />}
        {tab === 'teams' && (
          <TeamsView teams={teams} onAdd={() => setShowAddTeam(true)} />
        )}
      </View>

      <AddTeamModal
        visible={showAddTeam}
        tournamentId={tournament.id}
        usedColors={teams.map(t => t.colorHex)}
        onClose={() => setShowAddTeam(false)}
        onSaved={() => {
          setShowAddTeam(false);
          refresh();
        }}
      />
    </Screen>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text variant="bodyStrong" tone={active ? 'default' : 'muted'}>{label}</Text>
    </Pressable>
  );
}

function FixturesView({
  matches,
  teams,
  tournament,
  onNew,
}: {
  matches: Match[];
  teams: Team[];
  tournament: Tournament;
  onNew: () => void;
}) {
  const router = useRouter();
  const teamMap = new Map(teams.map(t => [t.id, t]));

  if (matches.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingTop: spacing.xxl }}>
        <Text variant="body" tone="muted" style={{ marginBottom: spacing.lg, textAlign: 'center' }}>
          No matches yet. {teams.length < 2 ? 'Add teams first, then schedule a match.' : 'Schedule a match between two teams.'}
        </Text>
        <Button
          title="New match"
          onPress={onNew}
          disabled={teams.length < 2}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={matches}
      keyExtractor={m => m.id}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing.xxxl }}
      ListHeaderComponent={
        <Button title="New match" onPress={onNew} fullWidth style={{ marginBottom: spacing.lg }} />
      }
      renderItem={({ item }) => {
        const a = teamMap.get(item.teamAId);
        const b = teamMap.get(item.teamBId);
        const isCompleted = item.status === 'COMPLETED';
        const isLive = item.status === 'IN_PROGRESS' || item.status === 'INNINGS_BREAK';
        return (
          <Card
            onPress={() =>
              router.push(
                isCompleted ? `/match/${item.id}/scorecard` : `/match/${item.id}/score`,
              )
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.teamDot, { backgroundColor: a?.colorHex ?? palette.ink400 }]} />
                  <Text variant="bodyStrong">{a?.name ?? '—'}</Text>
                </View>
                <Text variant="caption" tone="dim" style={{ marginVertical: 2 }}>vs</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={[styles.teamDot, { backgroundColor: b?.colorHex ?? palette.ink400 }]} />
                  <Text variant="bodyStrong">{b?.name ?? '—'}</Text>
                </View>
              </View>
              {isLive && (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text variant="caption" style={{ color: colors.danger }}>LIVE</Text>
                </View>
              )}
              {isCompleted && (
                <Text variant="caption" tone="muted">Completed</Text>
              )}
              {item.status === 'SETUP' && (
                <Text variant="caption" tone="muted">Setup</Text>
              )}
            </View>
          </Card>
        );
      }}
    />
  );
}

function PointsTableView({ rows, teams }: { rows: PointsRow[]; teams: Team[] }) {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  if (rows.length === 0) {
    return (
      <Text variant="body" tone="muted" style={{ textAlign: 'center', paddingTop: spacing.xxl }}>
        Points table appears once matches are played.
      </Text>
    );
  }
  return (
    <View style={{ paddingTop: spacing.md }}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text variant="caption" tone="muted" style={{ width: 24 }}>#</Text>
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>TEAM</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>P</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>W</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>L</Text>
        <Text variant="caption" tone="muted" style={styles.numCol}>PTS</Text>
        <Text variant="caption" tone="muted" style={[styles.numCol, { width: 56 }]}>NRR</Text>
      </View>
      {rows.map((r, i) => {
        const team = teamMap.get(r.teamId);
        return (
          <View key={r.teamId} style={styles.tableRow}>
            <Text variant="bodyStrong" style={{ width: 24 }}>{i + 1}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.teamDot, { backgroundColor: team?.colorHex ?? palette.ink400 }]} />
              <Text variant="bodyStrong">{team?.shortName ?? '—'}</Text>
            </View>
            <Text variant="body" style={styles.numCol}>{r.played}</Text>
            <Text variant="body" style={styles.numCol}>{r.won}</Text>
            <Text variant="body" style={styles.numCol}>{r.lost}</Text>
            <Text variant="bodyStrong" style={[styles.numCol, { color: colors.accent }]}>{r.points}</Text>
            <Text variant="body" style={[styles.numCol, { width: 56 }]}>{r.nrr.toFixed(2)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TeamsView({ teams, onAdd }: { teams: Team[]; onAdd: () => void }) {
  return (
    <View style={{ flex: 1, paddingTop: spacing.md }}>
      <Button title="Add team" onPress={onAdd} fullWidth style={{ marginBottom: spacing.lg }} />
      {teams.length === 0 ? (
        <Text variant="body" tone="muted" style={{ textAlign: 'center', marginTop: spacing.xl }}>
          No teams yet. Add at least 2 to schedule matches.
        </Text>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={t => t.id}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={[styles.teamSwatch, { backgroundColor: item.colorHex }]}>
                  <Text variant="bodyStrong" style={{ color: palette.black }}>{item.shortName}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{item.name}</Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

function AddTeamModal({
  visible,
  tournamentId,
  usedColors,
  onClose,
  onSaved,
}: {
  visible: boolean;
  tournamentId: string;
  usedColors: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState<string>(palette.team[0]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setShortName('');
    setColor(palette.team[0]);
  };

  const onSave = async () => {
    if (!name.trim() || !shortName.trim()) {
      Alert.alert('Missing info', 'Name and short name are required.');
      return;
    }
    setSaving(true);
    try {
      await createTeam({
        tournamentId,
        name: name.trim(),
        shortName: shortName.trim().toUpperCase().slice(0, 4),
        colorHex: color,
      });
      reset();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
            <Text variant="h2">Add team</Text>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>TEAM NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Mumbai Mavericks"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />

          <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>SHORT NAME (4 chars)</Text>
          <TextInput
            value={shortName}
            onChangeText={t => setShortName(t.toUpperCase().slice(0, 4))}
            placeholder="MUM"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="characters"
          />

          <Text variant="caption" tone="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>COLOR</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {palette.team.map(c => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  color === c && styles.colorDotActive,
                  usedColors.includes(c) && !{}.hasOwnProperty.call({}, 'x') && { opacity: 0.4 },
                ]}
              />
            ))}
          </View>

          <Button title="Add team" onPress={onSave} loading={saving} fullWidth size="lg" style={{ marginTop: spacing.xl }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  teamDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamSwatch: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeader: {
    borderBottomColor: colors.borderStrong,
  },
  numCol: {
    width: 36,
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 16,
  },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: colors.text,
  },
});
