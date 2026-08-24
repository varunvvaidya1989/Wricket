import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportLiveActivityBadge } from '@/components/sports/platform/SportLiveActivityBadge';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSportFeatureFlag } from '@/hooks/useSportFeatureFlag';
import { formatCount } from '@/lib/formatters/count';
import {
  SPORT_PRESENTATION,
  SPORT_SHELL_CONFIGS,
  listSportCompetitions,
  type ScoringSportId,
} from '@/lib/sports/scoring';
import { sportCompetitionApi } from '@/lib/supabase/sportCompetitionApi';
import { sportScoringApi, type SportCloudMatchFeed } from '@/lib/supabase/sportScoringApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';

export function SportShellHome({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const shell = SPORT_SHELL_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [matches, setMatches] = useState<readonly SportCloudMatchFeed[]>([]);
  const baseRoute = `/${presentation.routeSegment}`;

  const reload = useCallback(() => {
    const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
    const accountId = auth.session?.user.id;
    if (!connectedSport || !accountId) { setMatches([]); return; }
    void sportScoringApi.listMine({ sportId: connectedSport.id, accountId, limit: 20 })
      .then(setMatches).catch(() => setMatches([]));
  }, [auth.profile?.connectedSports, auth.session?.user.id, presentation.catalogCode]);
  useFocusEffect(useCallback(() => {
    reload();
    const connectedSport = auth.profile?.connectedSports.find(
      (sport) => sport.code === presentation.catalogCode,
    );
    return connectedSport
      ? sportScoringApi.subscribeSportLive(connectedSport.id, reload)
      : undefined;
  }, [auth.profile?.connectedSports, presentation.catalogCode, reload]));

  const name = playerName(auth.profile?.displayName, auth.session?.user.email);
  return (
    <Screen scroll padded={false}>
      <ShellHeader title={shell.displayName} eyebrow="SPORTSTAGE" />
      <View style={styles.homeContent}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}><Text style={styles.emoji}>{shell.icon}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.tagline}>{shell.tagline}</Text>
            <View style={styles.formatRow}>
              <MaterialCommunityIcons name="format-list-checks" size={14} color={colors.textDim} />
              <Text style={styles.formatCopy} numberOfLines={2}>{shell.defaultFormatSummary}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${shell.displayName} match format`}
                onPress={() => router.push(`${baseRoute}/match/new` as Href)}
                hitSlop={8}
              >
                <Text style={styles.editCopy}>Edit →</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open My ${shell.displayName}`}
          onPress={() => router.push(`${baseRoute}/my-sport` as Href)}
          style={({ pressed }) => [styles.snapshotCard, pressed && styles.pressed]}
        >
          <InitialsAvatar name={name} size="small" />
          <View style={styles.flex}>
            <View style={styles.snapshotNameRow}>
              <Text style={styles.snapshotName} numberOfLines={1}>{name}</Text>
              <View style={styles.activeTag}><Text style={styles.activeTagText}>● ACTIVE</Text></View>
            </View>
            <Text style={styles.snapshotSub}>{formatCount(matches.length, 'match')} played · view profile</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
        </Pressable>

        <Button title="New match" size="lg" fullWidth onPress={() => router.push(`${baseRoute}/match/new` as Href)} style={styles.cta} />

        <View style={styles.sectionHeading}>
          <Text variant="overline" tone="dim">RECENT MATCHES</Text>
          <Text variant="caption" tone="muted">{matches.length}</Text>
        </View>

        {matches.length > 0 ? matches.map((match) => (
          <CloudMatch key={match.id} match={match} onOpen={() => router.push(`${baseRoute}/match/${match.id}/feed` as Href)} />
        )) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="scoreboard-outline" size={28} color={colors.textDim} />
            <Text variant="bodyStrong">No matches yet</Text>
            <Text variant="caption" tone="muted" style={styles.emptyCopy}>Start a match and its live event feed will appear here on every device.</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

export function SportShellHub({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const shell = SPORT_SHELL_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const cloudCompetitions = useSportFeatureFlag(
    'cloud_competitions',
    presentation.catalogCode,
    auth.session?.user.id,
  );
  const [matches, setMatches] = useState<readonly SportCloudMatchFeed[]>([]);
  const [competitionCount, setCompetitionCount] = useState(0);
  const baseRoute = `/${presentation.routeSegment}`;

  const reload = useCallback(() => {
    void Promise.all([
      (() => {
        const connectedSport = auth.profile?.connectedSports.find((sport) => sport.code === presentation.catalogCode);
        const accountId = auth.session?.user.id;
        return connectedSport && accountId
          ? sportScoringApi.listMine({ sportId: connectedSport.id, accountId })
          : Promise.resolve([]);
      })(),
      cloudCompetitions.enabled
        ? sportCompetitionApi.list(presentation.catalogCode).catch(() => [])
        : Promise.resolve([]),
      listSportCompetitions(sportId),
    ]).then(([cloudMatches, cloudCompetitions, localCompetitions]) => {
      setMatches(cloudMatches);
      setCompetitionCount(cloudCompetitions.length + localCompetitions.length);
    }).catch(() => {
      setMatches([]);
      setCompetitionCount(0);
    });
  }, [auth.profile?.connectedSports, auth.session?.user.id, cloudCompetitions.enabled, presentation.catalogCode, sportId]);
  useFocusEffect(reload);

  const completedCount = useMemo(() => matches.filter((match) => match.status === 'COMPLETED').length, [matches]);
  const secondaryValue = useMemo(() => matches.reduce(
    (total, match) => total + match.events.filter((event) => event.kind === 'POINT').length,
    0,
  ), [matches]);
  const name = playerName(auth.profile?.displayName, auth.session?.user.email);
  const sections = [
    { label: 'Clubs & teams', detail: 'Verified memberships and reusable rosters', icon: 'account-group-outline' as const, route: `${baseRoute}/clubs` },
    { label: 'Matches', detail: formatCount(matches.length, 'match'), icon: 'scoreboard-outline' as const, route: `${baseRoute}/matches` },
    { label: 'Competitions', detail: formatCount(competitionCount, 'competition'), icon: 'trophy-outline' as const, route: `${baseRoute}/competitions` },
    { label: 'Performance', detail: formatCount(completedCount, 'completed result'), icon: 'chart-line' as const, route: `${baseRoute}/stats` },
  ];

  return (
    <Screen scroll padded={false}>
      <ShellHeader title={`My ${shell.displayName}`} eyebrow="PLAYER HUB" />
      <View style={styles.hubContent}>
        <View style={styles.fullProfile}>
          <View style={styles.profileIdentity}>
            <InitialsAvatar name={name} size="large" />
            <View style={styles.flex}>
              <Text variant="h3" numberOfLines={1}>{name}</Text>
              <View style={styles.profileStatusRow}>
                <View style={styles.statusDot} />
                <Text variant="overline" style={styles.accentText}>ACTIVE</Text>
              </View>
            </View>
          </View>
          <View style={styles.statRow}>
            <StatTile value={matches.length} label="Matches" />
            <StatTile value={completedCount} label="Results" subLabel="completed" />
            <StatTile value={secondaryValue} label={shell.secondaryStatLabel} />
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text variant="overline" tone="dim">MY {shell.displayName.toUpperCase()}</Text>
          <Text variant="caption" tone="muted">MANAGE</Text>
        </View>
        {sections.map((section) => (
          <Pressable key={section.label} onPress={() => router.push(section.route as Href)} style={({ pressed }) => [styles.hubCard, pressed && styles.pressed]}>
            <View style={styles.hubIcon}><MaterialCommunityIcons name={section.icon} size={20} color={colors.accent} /></View>
            <View style={styles.flex}>
              <Text style={styles.hubLabel}>{section.label}</Text>
              <Text variant="caption" tone="muted">{section.detail}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function CloudMatch({ match, onOpen }: { match: SportCloudMatchFeed; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.recentCard, pressed && styles.pressed]}>
      <View style={styles.recentAccent} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>{match.participantA} <Text tone="dim">vs</Text> {match.participantB}</Text>
        <Text variant="caption" tone="dim">{match.status} · {match.currentSequence} EVENTS · {new Date(match.updatedAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.recentScore}>
        {match.status === 'LIVE' ? <SportLiveActivityBadge count={1} appearance="card" /> : null}
        <Text variant="scoreMd">{match.headlineScore}</Text>
      </View>
    </Pressable>
  );
}

function InitialsAvatar({ name, size }: { name: string; size: 'small' | 'large' }) {
  return <View style={[styles.initialsAvatar, size === 'large' && styles.initialsAvatarLarge]}><Text style={[styles.initialsText, size === 'large' && styles.initialsTextLarge]}>{initials(name)}</Text></View>;
}

function ShellHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.flex}>
        <Text style={styles.headerEyebrow}>{eyebrow}</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      </View>
      <SportAvatarButton compact initialsOnly />
    </View>
  );
}

function StatTile({ value, label, subLabel }: { value: number; label: string; subLabel?: string }) {
  return <View style={styles.statTile}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text>{subLabel ? <Text style={styles.statSubLabel}>{subLabel}</Text> : null}</View>;
}

function playerName(displayName?: string, email?: string): string {
  return displayName ?? email?.split('@')[0] ?? 'SportStage player';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P';
}

const styles = StyleSheet.create({
  homeContent: { paddingBottom: spacing.xxxl, gap: 0 },
  hubContent: { paddingBottom: spacing.xxxl, gap: 0 },
  headerRow: { minHeight: 58, paddingHorizontal: spacing.lg, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerEyebrow: { color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9, letterSpacing: 0.9 },
  headerTitle: { marginTop: 3, color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 },
  introCard: { marginHorizontal: spacing.lg, marginTop: 14, padding: spacing.lg, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  introIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 19 },
  tagline: { color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  formatRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  formatCopy: { flex: 1, color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9.5, lineHeight: 14 },
  editCopy: { color: colors.accent, fontFamily: 'IBMPlexMono_500Medium', fontSize: 9.5 },
  snapshotCard: { minHeight: 68, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 11 },
  snapshotNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  snapshotName: { flexShrink: 1, color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12.5 },
  activeTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accentMuted },
  activeTagText: { color: colors.accent, fontFamily: 'IBMPlexMono_500Medium', fontSize: 7.5 },
  snapshotSub: { marginTop: 3, color: colors.textDim, fontFamily: 'IBMPlexMono_400Regular', fontSize: 9 },
  initialsAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  initialsAvatarLarge: { width: 48, height: 48, borderRadius: 24 },
  initialsText: { color: colors.accent, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12 },
  initialsTextLarge: { fontSize: 15 },
  cta: { marginHorizontal: spacing.lg, marginTop: spacing.lg, minHeight: 48, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.accent },
  sectionHeading: { marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentCard: { minHeight: 72, marginHorizontal: spacing.lg, marginBottom: 10, paddingRight: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md, overflow: 'hidden' },
  recentScore: { alignItems: 'flex-end', gap: 4 },
  recentAccent: { alignSelf: 'stretch', width: 3, backgroundColor: colors.accent },
  empty: { marginHorizontal: spacing.lg, padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  emptyCopy: { maxWidth: 300, textAlign: 'center', lineHeight: 18 },
  fullProfile: { marginHorizontal: spacing.lg, marginTop: 14, padding: spacing.lg, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.lg, backgroundColor: colors.surface },
  profileIdentity: { marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileStatusRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  accentText: { color: colors.accent },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statTile: { flex: 1, minWidth: 0, minHeight: 66, paddingHorizontal: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: colors.text, fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16 },
  statLabel: { marginTop: 2, color: colors.textDim, fontFamily: 'IBMPlexMono_500Medium', fontSize: 7.5, textAlign: 'center' },
  statSubLabel: { color: colors.textDim, opacity: 0.7, fontFamily: 'IBMPlexMono_400Regular', fontSize: 7, textAlign: 'center' },
  hubCard: { minHeight: 64, marginHorizontal: spacing.lg, marginTop: 10, paddingHorizontal: spacing.lg, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hubIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  hubLabel: { color: colors.text, fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 14 },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});
