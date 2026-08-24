import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { SportStageLogo } from '@/components/branding/SportStageLogo';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors, palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import type { GeneratedFixtureSetup } from '@/lib/supabase/fixturesApi';
import { FORMAT_LABEL, type Team, type Tournament } from '@/lib/wricket/domain/types';
import type { FixtureMatch } from '@/lib/wricket/fixtures';
import { TournamentLogo } from './TournamentLogo';

const SPORTSTAGE_URL = 'https://sportstageapp.com';
const EXPORT_WIDTH = 1080;

interface TournamentShareBannerProps {
  tournament: Tournament;
  teams: Team[];
  captainByTeamId: ReadonlyMap<string, string>;
  fixtureSetup: GeneratedFixtureSetup;
  visible: boolean;
  onClose: () => void;
}

export function TournamentShareBanner({ tournament, teams, captainByTeamId, fixtureSetup, visible, onClose }: TournamentShareBannerProps) {
  const posterRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [posterSize, setPosterSize] = useState({ width: 0, height: 0 });
  const shareUrl = tournament.cloudId ? `${SPORTSTAGE_URL}/tournament?id=${encodeURIComponent(tournament.cloudId)}` : undefined;
  const fixtures = useMemo(() => buildShareFixtures(fixtureSetup, teams), [fixtureSetup, teams]);

  const share = async () => {
    if (!posterRef.current) return;
    if (!shareUrl) {
      Alert.alert('Tournament is still syncing', 'Wait for the tournament to finish syncing before sharing its link.');
      return;
    }
    setSharing(true);
    try {
      const exportHeight = posterSize.width > 0 ? Math.max(1350, Math.round(EXPORT_WIDTH * posterSize.height / posterSize.width)) : 1350;
      if (Platform.OS === 'web') {
        const dataUri = await captureRef(posterRef, { format: 'png', quality: 1, width: EXPORT_WIDTH, height: exportHeight, result: 'data-uri' });
        await shareWebPoster(dataUri, tournament.name, shareUrl);
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
        const uri = await captureRef(posterRef, { format: 'png', quality: 1, width: EXPORT_WIDTH, height: exportHeight, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Share ${tournament.name}` });
      }
    } catch (cause) {
      Alert.alert('Could not share tournament', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const shareLink = async () => {
    if (!shareUrl) return;
    const message = `View ${tournament.name} on SportStage: ${shareUrl}`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ title: tournament.name, text: message, url: shareUrl });
        else {
          await navigator.clipboard.writeText(shareUrl);
          Alert.alert('Tournament link copied', 'The SportStage tournament link is ready to paste.');
        }
      } else {
        await Share.share({ title: tournament.name, message, url: shareUrl });
      }
    } catch (cause) {
      if ((cause as { name?: string }).name !== 'AbortError') {
        Alert.alert('Could not share link', cause instanceof Error ? cause.message : 'Please try again.');
      }
    }
  };

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.heading}>
          <View><Text variant="overline" tone="accent">SHARE TOURNAMENT</Text><Text variant="h2">Complete tournament card</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close share preview" onPress={onClose} style={styles.close}><MaterialCommunityIcons name="close" size={23} color={colors.text} /></Pressable>
        </View>

        <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator>
          <View ref={posterRef} collapsable={false} onLayout={event => setPosterSize(event.nativeEvent.layout)} style={styles.poster}>
            <PosterHero tournament={tournament} teamCount={teams.length} fixtureCount={fixtures.length} />
            <View style={styles.posterContent}>
              <PosterSection eyebrow="TOURNAMENT DETAILS" title="The complete stage">
                {tournament.description ? <Text variant="caption" style={styles.description}>{tournament.description}</Text> : null}
                <View style={styles.detailGrid}>
                  <BannerDetail icon="calendar-outline" label="DATES" value={formatDateRange(tournament.startDate, tournament.endDate)} />
                  <BannerDetail icon="clock-outline" label="FIRST BALL" value={formatTime(tournament.startDate)} />
                  <BannerDetail icon="map-marker-outline" label="VENUE" value={tournament.location ?? 'Venue to be announced'} />
                  <BannerDetail icon="cricket" label="FORMAT" value={`${FORMAT_LABEL[tournament.format]} / ${tournament.oversPerMatch} overs`} />
                  <BannerDetail icon="account-group-outline" label="SQUAD" value={`${tournament.playersPerTeam} players per team`} />
                  <BannerDetail icon="star-four-points-outline" label="POINTS" value={`${tournament.pointsWin} win / ${tournament.pointsTie} tie / ${tournament.pointsNoResult} no result`} />
                </View>
                {tournament.rewards ? <InfoStrip icon="trophy-award" text={tournament.rewards} /> : null}
                {tournament.organizerPhone ? <InfoStrip icon="phone-outline" text={`Organiser: ${tournament.organizerPhone}`} /> : null}
              </PosterSection>

              <PosterSection eyebrow={`${teams.length} REGISTERED`} title="Teams and captains">
                <View style={styles.cardGrid}>{teams.map(team => <ShareTeamCard key={team.id} team={team} captainName={captainByTeamId.get(team.id)} />)}</View>
              </PosterSection>

              {fixtures.length ? <PosterSection eyebrow={`${fixtures.length} MATCH${fixtures.length === 1 ? '' : 'ES'}`} title="Fixtures">
                <View style={styles.cardGrid}>{fixtures.map(item => <ShareFixtureCard key={item.fixture.id} item={item} />)}</View>
              </PosterSection> : null}
            </View>

            <View style={styles.posterFooter}>
              <SportStageLogo size={38} />
              <View style={styles.footerCopy}><Text variant="overline" style={styles.footerLabel}>OPEN THE COMPLETE TOURNAMENT</Text><Text variant="caption" style={styles.url}>{shareUrl ?? 'Syncing tournament link'}</Text></View>
              <MaterialCommunityIcons name="open-in-new" size={22} color={colors.accentInk} />
            </View>
          </View>
        </ScrollView>

        <Text variant="caption" tone="muted" style={styles.note}>The exported image includes every team, captain, and fixture plus a link that opens this tournament after SportStage sign-in.</Text>
        <View style={styles.shareActions}>
          <Button title={Platform.OS === 'web' ? 'Share or download image' : 'Share complete image'} onPress={() => void share()} loading={sharing} disabled={!shareUrl} fullWidth />
          <Button title="Share tournament link" variant="secondary" onPress={() => void shareLink()} disabled={!shareUrl || sharing} fullWidth />
        </View>
      </View>
    </View>
  </Modal>;
}

function PosterHero({ tournament, teamCount, fixtureCount }: { tournament: Tournament; teamCount: number; fixtureCount: number }) {
  const mediaUri = tournament.bannerUrl ?? tournament.bannerLocalUri;
  return <View style={styles.hero}>
    {mediaUri ? <Image source={{ uri: mediaUri }} resizeMode="cover" style={styles.heroImage} /> : null}
    <View style={styles.heroShade} /><View style={styles.pitchCircle} /><View style={styles.pitchLine} />
    <View style={styles.heroTop}>
      <View style={styles.brandLockup}><SportStageLogo size={38} /><View><Text variant="overline" style={styles.brand}>SPORTSTAGE</Text><Text variant="caption" style={styles.wricket}>WRICKET / TOURNAMENT</Text></View></View>
      <View style={styles.status}><Text variant="overline" style={styles.statusText}>{tournament.status === 'COMPLETED' ? 'COMPLETED' : 'TOURNAMENT INFO'}</Text></View>
    </View>
    <View style={styles.heroBody}>
      <TournamentLogo name={tournament.name} uri={tournament.logoUrl ?? tournament.logoLocalUri} size={66} style={styles.tournamentLogo} />
      <Text variant="overline" style={styles.format}>{FORMAT_LABEL[tournament.format]}</Text>
      <Text variant="h1" style={styles.name}>{tournament.name}</Text>
      <View style={styles.heroStats}><HeroStat value={String(teamCount || tournament.plannedTeamCount)} label="TEAMS" /><HeroStat value={String(fixtureCount)} label="FIXTURES" /><HeroStat value={String(tournament.oversPerMatch)} label="OVERS" /></View>
    </View>
  </View>;
}

function PosterSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}><View style={styles.sectionRule} /><View><Text variant="overline" style={styles.sectionEyebrow}>{eyebrow}</Text><Text variant="h2" style={styles.sectionTitle}>{title}</Text></View></View>{children}</View>;
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return <View style={styles.heroStat}><Text variant="h2" style={styles.heroStatValue}>{value}</Text><Text variant="overline" style={styles.heroStatLabel}>{label}</Text></View>;
}

function BannerDetail({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.detail}><View style={styles.detailIcon}><MaterialCommunityIcons name={icon} size={17} color={colors.accent} /></View><View style={styles.flex}><Text variant="overline" style={styles.detailLabel}>{label}</Text><Text variant="caption" style={styles.detailText}>{value}</Text></View></View>;
}

function InfoStrip({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return <View style={styles.infoStrip}><MaterialCommunityIcons name={icon} size={18} color={colors.gold} /><Text variant="caption" style={styles.infoText}>{text}</Text></View>;
}

function ShareTeamCard({ team, captainName }: { team: Team; captainName?: string }) {
  return <View style={styles.teamCard}><TournamentLogo name={team.name} uri={team.logoUrl} size={44} style={{ backgroundColor: team.colorHex }} /><View style={styles.flex}><Text variant="bodyStrong" style={styles.teamName} numberOfLines={2}>{team.name}</Text><Text variant="overline" style={styles.captainLabel}>CAPTAIN</Text><Text variant="caption" style={captainName ? styles.captainName : styles.unassigned} numberOfLines={2}>{captainName ?? 'Not assigned'}</Text></View></View>;
}

interface ShareFixture { fixture: FixtureMatch; teamAName: string; teamBName: string; context: string }

function ShareFixtureCard({ item }: { item: ShareFixture }) {
  const { fixture } = item;
  const score = fixture.scoreA !== undefined || fixture.scoreB !== undefined ? `${fixture.scoreA ?? '-'} - ${fixture.scoreB ?? '-'}` : undefined;
  return <View style={styles.fixtureCard}>
    <View style={styles.fixtureTop}><Text variant="overline" style={styles.fixtureContext}>{item.context}</Text><Text variant="overline" style={[styles.fixtureStatus, fixture.status === 'LIVE' && styles.live]}>{fixture.status}</Text></View>
    <View style={styles.fixtureTeams}><Text variant="caption" style={styles.fixtureTeam} numberOfLines={2}>{item.teamAName}</Text><Text variant="overline" style={styles.versus}>{score ?? 'VS'}</Text><Text variant="caption" style={[styles.fixtureTeam, styles.fixtureTeamRight]} numberOfLines={2}>{item.teamBName}</Text></View>
    <Text variant="caption" style={styles.fixtureMeta}>{fixture.scheduledAt ? formatFixtureDate(fixture.scheduledAt) : 'Schedule to be announced'}{fixture.venue ? ` / ${fixture.venue}` : ''}</Text>
  </View>;
}

function buildShareFixtures(setup: GeneratedFixtureSetup, teams: Team[]): ShareFixture[] {
  const teamNames = new Map<string, string>();
  for (const team of teams) { teamNames.set(team.id, team.name); if (team.cloudId) teamNames.set(team.cloudId, team.name); }
  const stageOrder = new Map(setup.stages.map((stage, index) => [stage.id, Number(stage.stage_order ?? index)]));
  const stageType = new Map(setup.stages.map(stage => [stage.id, String(stage.type ?? '')]));
  const groupNames = new Map(setup.groups.map(group => [group.id, String(group.name ?? 'Group')]));
  const knockoutNames = new Map<string, string>();
  for (const round of setup.bracket?.rounds ?? []) knockoutNames.set(round.id, knockoutRoundLabel(round.name));
  return [...setup.matches]
    .sort((a, b) => (stageOrder.get(a.stageId) ?? 0) - (stageOrder.get(b.stageId) ?? 0) || a.round - b.round || a.leg - b.leg)
    .map(fixture => ({
      fixture,
      teamAName: teamNames.get(fixture.teamA) ?? 'TBD',
      teamBName: fixture.teamB ? teamNames.get(fixture.teamB) ?? 'TBD' : 'BYE',
      context: fixture.groupId ? `${groupNames.get(fixture.groupId) ?? 'GROUP'} / ROUND ${fixture.round}` : knockoutNames.get(fixture.roundId ?? '') ?? (stageType.get(fixture.stageId) === 'KNOCKOUT' ? `KNOCKOUT / ROUND ${fixture.round}` : `ROUND ${fixture.round}`),
    }));
}

function knockoutRoundLabel(value: string): string {
  return ({ QF: 'QUARTER-FINAL', SF: 'SEMI-FINAL', F: 'FINAL', '3RD_PLACE': 'THIRD PLACE' } as Record<string, string>)[value] ?? value.replaceAll('_', ' ');
}

async function shareWebPoster(dataUri: string, tournamentName: string, shareUrl: string): Promise<void> {
  const filename = `${tournamentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tournament'}-sportstage.png`;
  const blob = await (await fetch(dataUri)).blob();
  const file = new File([blob], filename, { type: 'image/png' });
  const webNavigator = navigator as Navigator & { canShare?(data: ShareData): boolean };
  if (webNavigator.share && (!webNavigator.canShare || webNavigator.canShare({ files: [file] }))) {
    await webNavigator.share({ title: tournamentName, text: `View ${tournamentName} on SportStage: ${shareUrl}`, files: [file] });
    return;
  }
  const anchor = document.createElement('a'); anchor.href = dataUri; anchor.download = filename; anchor.click();
}

function formatDateRange(startValue: number, endValue?: number): string {
  const start = new Date(startValue);
  const startText = `${ordinal(start.getDate())} ${start.toLocaleString('en', { month: 'short' })}, ${start.getFullYear()}`;
  if (!endValue) return startText;
  const end = new Date(endValue);
  return `${startText} - ${ordinal(end.getDate())} ${end.toLocaleString('en', { month: 'short' })}, ${end.getFullYear()}`;
}

function formatTime(value: number): string { return new Date(value).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true }); }
function formatFixtureDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Schedule to be announced' : `${date.toLocaleDateString('en', { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true })}`; }
function ordinal(day: number): string { if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`; return `${day}${day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'}`; }

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.78)' },
  sheet: { height: '96%', padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.bg },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  preview: { flex: 1, borderRadius: radius.lg, backgroundColor: '#0C100D' },
  previewContent: { padding: spacing.xs },
  poster: { width: '100%', overflow: 'hidden', borderRadius: radius.md, backgroundColor: '#101510', borderWidth: 1, borderColor: '#344236' },
  hero: { minHeight: 360, overflow: 'hidden', backgroundColor: '#132018' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.32 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,11,7,0.58)' },
  pitchCircle: { position: 'absolute', width: 280, height: 280, right: -105, bottom: -100, borderRadius: 140, borderWidth: 1, borderColor: 'rgba(95,227,138,0.24)' },
  pitchLine: { position: 'absolute', width: 1, height: 340, right: 84, bottom: -80, backgroundColor: 'rgba(95,227,138,0.18)', transform: [{ rotate: '34deg' }] },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: { color: colors.accent, letterSpacing: 1.6 },
  wricket: { color: '#A8B2A7', marginTop: 1 },
  status: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: '#647268', backgroundColor: 'rgba(12,18,13,0.74)' },
  statusText: { color: '#DCE4DA' },
  heroBody: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg, paddingTop: spacing.xxl },
  tournamentLogo: { marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  format: { color: colors.gold, marginBottom: spacing.xs, letterSpacing: 1.4 },
  name: { color: palette.white, fontSize: 32, lineHeight: 35 },
  heroStats: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  heroStat: { flex: 1, paddingTop: spacing.md },
  heroStatValue: { color: palette.white },
  heroStatLabel: { color: '#96A296', marginTop: 2 },
  posterContent: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  sectionRule: { width: 3, borderRadius: 2, backgroundColor: colors.accent },
  sectionEyebrow: { color: colors.accent, letterSpacing: 1.3 },
  sectionTitle: { color: palette.white },
  description: { color: '#C3CCC1', lineHeight: 19 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detail: { width: '48.5%', minHeight: 68, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#19211A' },
  detailIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: 'rgba(95,227,138,0.10)' },
  detailLabel: { color: '#849087' },
  detailText: { color: '#EDF1EC', lineHeight: 17, marginTop: 2 },
  infoStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: 'rgba(232,196,104,0.28)', borderRadius: radius.md, backgroundColor: 'rgba(232,196,104,0.07)' },
  infoText: { flex: 1, color: '#E6D39E' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  teamCard: { width: '48.5%', minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: '#2C382E', borderRadius: radius.md, backgroundColor: '#171E18' },
  teamName: { color: palette.white, lineHeight: 17 },
  captainLabel: { color: colors.gold, fontSize: 8, marginTop: 4 },
  captainName: { color: '#C9D1C7', fontSize: 11, lineHeight: 14 },
  unassigned: { color: '#77827A', fontSize: 11 },
  fixtureCard: { width: '48.5%', minHeight: 106, gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: '#2C382E', borderRadius: radius.md, backgroundColor: '#171E18' },
  fixtureTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  fixtureContext: { flex: 1, color: colors.gold, fontSize: 8 },
  fixtureStatus: { color: '#89948C', fontSize: 8 },
  live: { color: colors.live },
  fixtureTeams: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fixtureTeam: { flex: 1, color: palette.white, fontSize: 11, lineHeight: 14 },
  fixtureTeamRight: { textAlign: 'right' },
  versus: { color: colors.accent, fontSize: 9 },
  fixtureMeta: { color: '#87928A', fontSize: 9 },
  posterFooter: { minHeight: 78, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.accent },
  footerCopy: { flex: 1 },
  footerLabel: { color: '#26301D' },
  url: { color: colors.accentInk, fontSize: 11, marginTop: 2 },
  note: { lineHeight: 18 },
  shareActions: { gap: spacing.sm },
  flex: { flex: 1 },
});
