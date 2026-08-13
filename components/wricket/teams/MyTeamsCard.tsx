import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors, palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { MyTeamSummary, teamManagementApi } from '@/lib/supabase/teamManagementApi';

export function MyTeamsCard({
  accountId,
  onOpenTeam,
  showIntro = true,
}: {
  accountId: string;
  onOpenTeam: (teamId: string) => void;
  showIntro?: boolean;
}) {
  const [teams, setTeams] = useState<MyTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTeams(await teamManagementApi.listMine(accountId));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useFocusEffect(useCallback(() => {
    void load().catch(() => undefined);
  }, [load]));

  const content = (
    <>
      <View style={styles.header}>
        {showIntro ? <View style={{ flex: 1 }}>
          <Text variant="h3">My teams</Text>
          <Text variant="caption" tone="muted">Teams you own, captain, or play for</Text>
        </View> : <View style={{ flex: 1 }} />}
        <Pressable onPress={() => setCreateOpen(true)} style={styles.addButton}>
          <MaterialCommunityIcons name="plus" size={18} color={colors.accentInk} />
          <Text variant="caption" style={{ color: colors.accentInk }}>CREATE TEAM</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text variant="caption" tone="muted" style={styles.message}>Loading teams…</Text>
      ) : teams.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="account-group-outline" size={24} color={colors.textMuted} />
          <Text variant="bodyStrong">Create your first team</Text>
          <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            Build one roster and enter that team into multiple tournaments.
          </Text>
        </View>
      ) : (
        <MyTeamsList teams={teams} onOpenTeam={onOpenTeam} />
      )}
      <CreateTeamEntityModal
        visible={createOpen}
        accountId={accountId}
        onClose={() => setCreateOpen(false)}
        onCreated={team => {
          setCreateOpen(false);
          setTeams(current => [...current, team].sort((a, b) => a.name.localeCompare(b.name)));
          onOpenTeam(team.id);
        }}
      />
    </>
  );
  return showIntro ? <Card>{content}</Card> : <View style={styles.embeddedRoot}>{content}</View>;
}

function MyTeamsList({ teams, onOpenTeam }: {
  teams: MyTeamSummary[];
  onOpenTeam: (teamId: string) => void;
}) {
  return (
    <View style={styles.list}>
      {teams.map(team => (
        <Pressable key={team.id} onPress={() => onOpenTeam(team.id)} style={({ pressed }) => [styles.teamRow, pressed && styles.teamRowPressed]}>
          <View style={styles.teamMeta}>
            <View style={styles.roleChip}>
              <Text variant="overline" tone={team.role === 'OWNER' ? 'accent' : 'muted'}>{roleLabel(team.role)}</Text>
            </View>
            <Text variant="caption" tone="dim" numberOfLines={1} style={styles.teamContext}>
              {team.tournamentName ?? 'Reusable team'}
            </Text>
          </View>
          <View style={styles.teamMain}>
            <View style={[styles.teamBadge, { backgroundColor: team.colorHex }]}>
              {team.logoUrl
                ? <Image source={{ uri: team.logoUrl }} style={styles.logo} />
                : <Text variant="caption" style={{ color: palette.black }}>{team.shortName}</Text>}
            </View>
            <View style={styles.teamCopy}>
              <Text variant="h3" numberOfLines={1}>{team.name}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>{team.shortName}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function roleLabel(role: MyTeamSummary['role']): string {
  if (role === 'OWNER') return 'OWNER';
  if (role === 'CAPTAIN') return 'CAPTAIN';
  return 'PLAYER';
}

function CreateTeamEntityModal({ visible, accountId, onClose, onCreated }: {
  visible: boolean;
  accountId: string;
  onClose: () => void;
  onCreated: (team: MyTeamSummary) => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState<string>(palette.team[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setShortName('');
    setColor(palette.team[0]);
  }, [visible]);

  const create = async () => {
    setSaving(true);
    try {
      onCreated(await teamManagementApi.createTeamEntity({
        name,
        shortName,
        colorHex: color,
        ownerId: accountId,
      }));
    } catch (cause) {
      Alert.alert('Could not create team', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text variant="h2">Create a team</Text>
            <Pressable onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <Text variant="caption" tone="muted" style={styles.label}>TEAM NAME</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Mumbai Mavericks" placeholderTextColor={colors.textDim} style={styles.input} />
          <Text variant="caption" tone="muted" style={styles.label}>SHORT NAME</Text>
          <TextInput value={shortName} onChangeText={value => setShortName(value.toUpperCase().slice(0, 4))} placeholder="MUM" placeholderTextColor={colors.textDim} autoCapitalize="characters" style={styles.input} />
          <Text variant="caption" tone="muted" style={styles.label}>COLOR</Text>
          <View style={styles.colors}>{palette.team.map(value => <Pressable key={value} onPress={() => setColor(value)} style={[styles.color, { backgroundColor: value }, color === value && styles.colorActive]} />)}</View>
          <Button title="Create team" disabled={!name.trim() || !shortName.trim()} loading={saving} onPress={() => void create()} fullWidth size="lg" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  embeddedRoot: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.accent },
  message: { marginTop: spacing.md },
  empty: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingVertical: spacing.md },
  list: { gap: spacing.md },
  teamRow: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  teamRowPressed: { opacity: 0.74 },
  teamMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roleChip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated },
  teamContext: { flex: 1 },
  teamMain: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  teamBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  teamCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  logo: { width: '100%', height: '100%' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.sm },
  label: { marginTop: spacing.sm },
  input: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 16, padding: spacing.md },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  color: { width: 34, height: 34, borderRadius: 17 },
  colorActive: { borderWidth: 3, borderColor: colors.text },
});
