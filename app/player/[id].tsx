import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, View } from 'react-native';

import { SportIcon } from '@/components/sports/SportIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { sportDiscoveryApi, type SportPublicPlayerCard } from '@/lib/supabase/sportDiscoveryApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function PublicPlayerCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<SportPublicPlayerCard>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    void sportDiscoveryApi.publicPlayerCard(id).then(setCard)
      .catch(() => setCard(undefined))
      .finally(() => setLoading(false));
  }, [id]);

  const share = () => {
    if (!card) return;
    const url = Linking.createURL(`player/${card.sportProfileId}`);
    void Share.share({ message: `${card.displayName} on SportStage: ${url}` });
  };

  return <Screen padded={false}>
    <AppHeader title="Player" eyebrow="PUBLIC SPORTSTAGE CARD" back right={card ? <Pressable accessibilityRole="button" accessibilityLabel="Share player card" onPress={share} style={styles.headerAction}><MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.text} /></Pressable> : undefined} />
    {loading ? <SportStageLoader variant="section" message="Opening player card" detail="Loading sports, form, and public highlights" /> : !card ? <View style={styles.center}><MaterialCommunityIcons name="account-lock-outline" size={36} color={colors.textDim} /><Text variant="h3">Player card unavailable</Text><Text variant="caption" tone="muted" style={styles.centerCopy}>This player has not made a public card available.</Text></View> : <View style={styles.content}>
      <View style={styles.card}>
        <View style={styles.glow} />
        {card.avatarUrl ? <Image source={{ uri: card.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text variant="h1" tone="accent">{initials(card.displayName)}</Text></View>}
        <View style={styles.sport}><SportIcon code={card.sportCode} size={18} color={colors.accent} /><Text variant="overline" tone="accent">{card.sportCode.replaceAll('_', ' ')}</Text></View>
        <Text variant="h1" style={styles.name}>{card.displayName}</Text>
        {card.headline ? <Text tone="muted" style={styles.headline}>{card.headline}</Text> : null}
        <Text variant="overline" tone="dim">SHARED SPORTSTAGE PROFILE</Text>
      </View>
    </View>}
  </Screen>;
}

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'; }

const styles = StyleSheet.create({
  headerAction: { width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  centerCopy: { textAlign: 'center' },
  content: { padding: spacing.lg },
  card: { minHeight: 420, padding: spacing.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: '#385A44', backgroundColor: '#111D17', alignItems: 'center', justifyContent: 'center', gap: spacing.md, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, width: 340, height: 260, borderRadius: 170, backgroundColor: 'rgba(95,227,138,0.08)' },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  sport: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { textAlign: 'center' },
  headline: { maxWidth: 420, textAlign: 'center', lineHeight: 22 },
});
