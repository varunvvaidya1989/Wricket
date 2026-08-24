import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { SportIcon } from '@/components/sports/SportIcon';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { TournamentLogo } from '@/components/wricket/tournament/TournamentLogo';
import { googleStaticMapUrl } from '@/lib/maps/googlePlaces';
import { normalizeSportRules, sportRulesSummary, type ScoringSportId } from '@/lib/sports/scoring';
import type { CompetitionPlayerStatistic } from '@/lib/supabase/sportResultsApi';
import type { CloudCompetitionDetail } from '@/lib/supabase/sportCompetitionApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface Props {
  detail: CloudCompetitionDetail;
  sportId: ScoringSportId;
  catalogCode: string;
  accent: string;
  playerStats: readonly CompetitionPlayerStatistic[];
  onEdit?: () => void;
  onRules?: () => void;
}

export function SportCompetitionOverview({ detail, sportId, catalogCode, accent, playerStats, onEdit, onRules }: Props) {
  const { competition } = detail;
  const approved = detail.entries.filter((entry) => entry.status === 'APPROVED');
  const matches = competition.kind === 'TOURNAMENT'
    ? detail.fixtures.flatMap((fixture) => fixture.matches)
    : detail.fixtures;
  const completed = matches.filter((match) => match.scoringStatus === 'COMPLETED').length;
  const live = matches.filter((match) => match.scoringStatus === 'LIVE' || match.scoringStatus === 'IN_PROGRESS').length;
  const primaryVenue = detail.venues[0];
  const mapUrl = primaryVenue?.googleMapsUrl ?? (primaryVenue?.latitude !== undefined && primaryVenue.longitude !== undefined
    ? `https://www.google.com/maps/search/?api=1&query=${primaryVenue.latitude},${primaryVenue.longitude}` : undefined);
  const contactPhone = detail.ownerContact.phone ?? competition.organizerPhone;
  const participantLabel = competition.kind === 'TOURNAMENT' ? 'TEAMS / CLUBS' : 'PLAYERS';
  const leader = playerStats[0];

  return <View style={styles.container}>
    <View style={styles.hero}>
      {competition.bannerUrl ? <Image source={{ uri: competition.bannerUrl }} style={styles.heroImage} /> : <View style={[styles.heroFallback, { backgroundColor: `${accent}24` }]}><SportIcon code={catalogCode} size={74} color={accent} /></View>}
      <View style={styles.heroShade} />
      <View style={styles.status}><Text variant="overline" style={{ color: competition.lifecycle === 'LIVE' ? colors.live : accent }}>● {competition.lifecycle.replaceAll('_', ' ')}</Text></View>
      <View style={styles.identity}>
        <TournamentLogo name={competition.name} uri={competition.logoUrl} size={72} style={styles.logo} />
        <View style={styles.flex}><Text variant="overline" style={{ color: accent }}>{competition.kind} · {competition.visibility}</Text><Text variant="h1" numberOfLines={2}>{competition.name}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{primaryVenue?.name ?? dateRange(competition.startsAt, competition.endsAt)}</Text></View>
      </View>
    </View>

    {onEdit || onRules ? <View style={styles.actions}>{onEdit ? <Action icon="pencil-outline" label="EDIT INFO" onPress={onEdit} /> : null}{onRules ? <Action icon="tune-variant" label="MATCH RULES" onPress={onRules} /> : null}</View> : null}

    <View style={styles.metrics}>
      <Metric value={String(approved.length)} label={participantLabel} icon={competition.kind === 'TOURNAMENT' ? 'account-group-outline' : 'account-outline'} />
      <Metric value={String(matches.length)} label="MATCHES" icon="tournament" />
      <Metric value={String(detail.venues.length)} label="VENUES" icon="map-marker-multiple-outline" />
    </View>
    {competition.plannedEntryCount ? <Text variant="caption" tone="muted">{approved.length} of {competition.plannedEntryCount} planned {competition.kind === 'TOURNAMENT' ? 'teams or clubs' : 'players'} registered.</Text> : null}

    <Text variant="overline" tone="dim">COMPETITION DETAILS</Text>
    <Card style={styles.infoCard}>
      <Info icon="calendar-outline" title={dateRange(competition.startsAt, competition.endsAt)} detail={competition.timezone} />
      <Info icon="account-tie-outline" title={detail.ownerContact.displayName} detail={contactPhone} actions={contactPhone ? <><Contact label="CALL" url={`tel:${contactPhone}`} accent={accent} /><Contact label="WHATSAPP" url={`https://wa.me/${contactPhone.replace(/\D/g, '')}`} accent={accent} /></> : undefined} />
      <Info icon="scale-balance" title={sportRulesSummary(sportId, normalizeSportRules(sportId, competition.rules))} detail="Scoring follows this sport profile" />
      {primaryVenue ? <Info icon="map-marker-outline" title={primaryVenue.name} detail={primaryVenue.address} /> : null}
    </Card>

    {primaryVenue && mapUrl ? <Pressable accessibilityRole="link" onPress={() => void openLink(mapUrl)} style={styles.mapCard}>
      {primaryVenue.latitude !== undefined && primaryVenue.longitude !== undefined && googleStaticMapUrl(primaryVenue.latitude, primaryVenue.longitude)
        ? <Image source={{ uri: googleStaticMapUrl(primaryVenue.latitude, primaryVenue.longitude) }} style={styles.mapImage} />
        : <View style={[styles.mapFallback, { backgroundColor: `${accent}18` }]}><MaterialCommunityIcons name="map-marker" size={34} color={accent} /></View>}
      <View style={styles.mapCaption}><View style={styles.flex}><Text variant="bodyStrong">Open venue in Google Maps</Text><Text variant="caption" tone="muted" numberOfLines={1}>{primaryVenue.address ?? primaryVenue.name}</Text></View><MaterialCommunityIcons name="open-in-new" size={19} color={accent} /></View>
    </Pressable> : null}

    {competition.description ? <Text variant="body" tone="muted">{competition.description}</Text> : null}
    {competition.socialMediaUrl ? <Pressable onPress={() => void openLink(competition.socialMediaUrl!)}><Text variant="bodyStrong" style={{ color: accent }}>Open competition social page</Text></Pressable> : null}

    <Text variant="overline" tone="dim">TOURNAMENT / LEAGUE STATS</Text>
    <View style={styles.statGrid}>
      <Stat value={String(completed)} label="COMPLETED" />
      <Stat value={String(live)} label="LIVE NOW" />
      <Stat value={matches.length ? `${Math.round((completed / matches.length) * 100)}%` : '0%'} label="PROGRESS" />
      <Stat value={String(detail.stages.length)} label="STAGES" />
    </View>
    {leader ? <View style={[styles.leader, { borderColor: accent }]}><MaterialCommunityIcons name="trophy-outline" size={25} color={accent} /><View style={styles.flex}><Text variant="overline" style={{ color: accent }}>WIN LEADER</Text><Text variant="bodyStrong">{leader.displayName}</Text><Text variant="caption" tone="muted">{leader.wins} wins from {leader.matchesPlayed} matches</Text></View></View> : <Text variant="caption" tone="muted">Player leaders appear after completed results are processed.</Text>}

    {approved.length ? <><Text variant="overline" tone="dim">{participantLabel}</Text><View style={styles.participants}>{approved.slice(0, 8).map((entry) => <View key={entry.id} style={styles.participant}><TournamentLogo name={entry.displayName} uri={entry.logoUrl} size={40} /><Text variant="caption" numberOfLines={2} style={styles.participantName}>{entry.displayName}</Text></View>)}</View></> : null}
  </View>;
}

function Metric({ value, label, icon }: { value: string; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) { return <View style={styles.metric}><MaterialCommunityIcons name={icon} size={18} color={colors.textDim} /><Text variant="scoreMd">{value}</Text><Text variant="overline" tone="dim" style={styles.metricLabel}>{label}</Text></View>; }
function Stat({ value, label }: { value: string; label: string }) { return <View style={styles.stat}><Text variant="scoreMd">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>; }
function Action({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.action}><MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} /><Text variant="caption">{label}</Text></Pressable>; }
function Contact({ label, url, accent }: { label: string; url: string; accent: string }) { return <Pressable onPress={() => void openLink(url)}><Text variant="overline" style={{ color: accent }}>{label}</Text></Pressable>; }
function Info({ icon, title, detail, actions }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; detail?: string; actions?: React.ReactNode }) { return <View style={styles.info}><MaterialCommunityIcons name={icon} size={21} color={colors.textDim} /><View style={styles.flex}><Text variant="bodyStrong">{title}</Text>{detail ? <Text variant="caption" tone="muted">{detail}</Text> : null}</View>{actions ? <View style={styles.infoActions}>{actions}</View> : null}</View>; }
function dateRange(start?: string, end?: string): string { if (!start) return 'Dates to be announced'; const first = new Date(start).toLocaleDateString(); return end ? `${first} – ${new Date(end).toLocaleDateString()}` : first; }
async function openLink(url: string): Promise<void> { try { await Linking.openURL(url); } catch { /* Native link handler unavailable. */ } }

const styles = StyleSheet.create({
  container: { gap: spacing.md }, hero: { minHeight: 250, overflow: 'hidden', borderRadius: radius.xl, justifyContent: 'flex-end' }, heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' }, heroFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }, heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,6,0.48)' }, status: { position: 'absolute', top: spacing.md, right: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: 'rgba(8,11,9,0.78)' }, identity: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, logo: { borderWidth: 2, borderColor: colors.borderStrong }, actions: { flexDirection: 'row', gap: spacing.sm }, action: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, metrics: { paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' }, metric: { flex: 1, alignItems: 'center', gap: 2 }, metricLabel: { textAlign: 'center' }, infoCard: { padding: 0, overflow: 'hidden' }, info: { minHeight: 64, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, infoActions: { flexDirection: 'row', gap: spacing.sm }, mapCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg }, mapImage: { height: 150, width: '100%' }, mapFallback: { height: 120, alignItems: 'center', justifyContent: 'center' }, mapCaption: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, stat: { width: '48%', flexGrow: 1, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, gap: spacing.xs }, leader: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, participants: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, participant: { width: '23%', minWidth: 72, alignItems: 'center', gap: spacing.xs }, participantName: { textAlign: 'center' }, flex: { flex: 1, minWidth: 0 },
});
