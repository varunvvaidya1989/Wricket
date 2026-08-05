import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors, palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { FORMAT_LABEL, Tournament } from '@/lib/wricket/domain/types';
import { SportStageLogo } from '@/components/branding/SportStageLogo';

const SPORTSTAGE_URL = 'https://sportstageapp.com';

export function TournamentShareBanner({ tournament, teamCount, matchCount, visible, onClose }: {
  tournament: Tournament;
  teamCount: number;
  matchCount: number;
  visible: boolean;
  onClose: () => void;
}) {
  const bannerRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (!bannerRef.current) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
      const uri = await captureRef(bannerRef, { format: 'png', quality: 1, width: 1080, height: 1350, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Share ${tournament.name}` });
    } catch (cause) {
      Alert.alert('Could not share tournament', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSharing(false); }
  };

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.heading}>
          <View><Text variant="overline" tone="muted">QUICK SHARE</Text><Text variant="h2">Tournament poster</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close share preview" onPress={onClose} style={styles.close}><MaterialCommunityIcons name="close" size={23} color={colors.text} /></Pressable>
        </View>

        <View ref={bannerRef} collapsable={false} style={styles.poster}>
          {(tournament.bannerUrl || tournament.bannerLocalUri) ? <Image source={{ uri: tournament.bannerUrl ?? tournament.bannerLocalUri }} style={styles.posterImage} /> : null}
          <View style={styles.imageShade} />
          <View style={styles.posterTop}>
            <SportStageLogo size={38} />
            <View style={{ flex: 1 }}><Text variant="overline" style={styles.brand}>SPORTSTAGE</Text><Text variant="caption" style={styles.wricket}>WRICKET · TOURNAMENT</Text></View>
            <View style={styles.status}><Text variant="overline" style={{ color: tournament.status === 'ACTIVE' ? colors.accent : colors.textMuted }}>{tournament.status}</Text></View>
          </View>

          <View style={styles.posterBody}>
            <Text variant="overline" style={styles.format}>{FORMAT_LABEL[tournament.format]}</Text>
            <Text variant="h1" style={styles.name} numberOfLines={3}>{tournament.name}</Text>
            {tournament.description ? <Text variant="caption" style={styles.description} numberOfLines={2}>{tournament.description}</Text> : null}
            <View style={styles.rule} />
            <BannerDetail icon="calendar-outline" value={formatDateRange(tournament.startDate, tournament.endDate)} />
            <BannerDetail icon="clock-outline" value={formatTime(tournament.startDate)} />
            {tournament.location ? <BannerDetail icon="map-marker-outline" value={tournament.location} /> : null}
            <BannerDetail icon="account-group-outline" value={`${teamCount || tournament.plannedTeamCount} teams · ${tournament.playersPerTeam} players per team`} />
            <BannerDetail icon="cricket" value={`${matchCount} matches · ${tournament.pointsWin} points for a win`} />
            {tournament.organizerPhone ? <BannerDetail icon="phone-outline" value={`Organiser: ${tournament.organizerPhone}`} /> : null}
          </View>

          <View style={styles.posterFooter}>
            <View><Text variant="caption" style={styles.follow}>Follow scores, fixtures and updates</Text><Text variant="bodyStrong" style={styles.url}>{SPORTSTAGE_URL}</Text></View>
            <View style={styles.qrHint}><MaterialCommunityIcons name="cellphone" size={20} color={colors.accentInk} /></View>
          </View>
        </View>

        <Text variant="caption" tone="muted" style={styles.note}>The SportStage link is included inside the image so it remains visible wherever the poster is shared.</Text>
        <Button title="Share image" onPress={() => void share()} loading={sharing} fullWidth />
      </View>
    </View>
  </Modal>;
}

function BannerDetail({ icon, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string }) {
  return <View style={styles.detail}><MaterialCommunityIcons name={icon} size={17} color={colors.accent} /><Text variant="caption" style={styles.detailText} numberOfLines={2}>{value}</Text></View>;
}

function formatDateRange(startValue: number, endValue?: number): string {
  const start = new Date(startValue);
  const startText = `${ordinal(start.getDate())} ${start.toLocaleString('en', { month: 'short' })}, ${start.getFullYear()}`;
  if (!endValue) return startText;
  const end = new Date(endValue);
  return `${startText} – ${ordinal(end.getDate())} ${end.toLocaleString('en', { month: 'short' })}, ${end.getFullYear()}`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { maxHeight: '96%', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.bg },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  poster: { width: '100%', aspectRatio: 4 / 5, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: '#10150F', borderWidth: 1, borderColor: '#304028' },
  posterImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.22 },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,12,7,0.68)' },
  posterTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  brand: { color: colors.accent, letterSpacing: 1.6 },
  wricket: { color: '#9DA895', marginTop: 1 },
  status: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: '#526149', backgroundColor: 'rgba(16,21,15,0.78)' },
  posterBody: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  format: { color: '#E8C468', marginBottom: spacing.xs },
  name: { color: palette.white, fontSize: 29, lineHeight: 32 },
  description: { color: '#B8C0B4', lineHeight: 17, marginTop: spacing.sm },
  rule: { width: 48, height: 3, marginVertical: spacing.md, borderRadius: 2, backgroundColor: colors.accent },
  detail: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailText: { flex: 1, color: '#E6EAE4', lineHeight: 17 },
  posterFooter: { minHeight: 64, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.accent },
  follow: { color: '#26301D' },
  url: { color: colors.accentInk },
  qrHint: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,20,12,0.12)' },
  note: { lineHeight: 18 },
});
