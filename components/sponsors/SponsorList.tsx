import React, { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { sponsorsForPlacement, type SponsorPlacement, type TournamentSponsor } from '@/lib/sponsors/types';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function SponsorList({ sponsors, placement, interactive = true, onLogoSettled }: {
  sponsors: readonly TournamentSponsor[]; placement: SponsorPlacement; interactive?: boolean; onLogoSettled?: (uri: string) => void;
}) {
  const visible = sponsorsForPlacement(sponsors, placement);
  const [linkError, setLinkError] = useState<string>();
  if (!visible.length) return null;
  return <View style={styles.section}>
    <Text variant="overline" tone="muted">SUPPORTED BY</Text>
    <View style={styles.grid}>{visible.map(sponsor => <View key={sponsor.id} style={styles.card}>
      <View style={styles.identity}>
        <SponsorLogo uri={sponsor.logoUrl} name={sponsor.name} onSettled={onLogoSettled} />
        <View style={styles.copy}><Text variant="overline" tone="accent">{sponsor.label}</Text><Text variant="bodyStrong">{sponsor.name}</Text></View>
      </View>
      {sponsor.description ? <Text variant="caption" tone="muted">{sponsor.description}</Text> : null}
      {sponsor.websiteUrl && interactive ? <Pressable accessibilityRole="link" accessibilityLabel={`Visit ${sponsor.name} website`} style={styles.link}
        onPress={() => {
          if (!/^https:\/\//i.test(sponsor.websiteUrl)) return;
          setLinkError(undefined);
          void Linking.openURL(sponsor.websiteUrl).catch(() => setLinkError('The sponsor website could not be opened.'));
        }}><Text variant="caption" tone="accent">Visit website ↗</Text></Pressable> : null}
    </View>)}</View>
    {linkError ? <Text accessibilityRole="alert" variant="caption" tone="danger">{linkError}</Text> : null}
  </View>;
}

export function SponsorLogo({ uri, name, onSettled }: { uri?: string; name: string; onSettled?: (uri: string) => void }) {
  const [failedUri, setFailedUri] = useState<string>();
  return <View style={styles.logo}>{uri && failedUri !== uri
    ? <Image source={{ uri }} accessibilityLabel={`${name} logo`} resizeMode="contain" style={styles.image} onLoadEnd={() => onSettled?.(uri)} onError={() => { setFailedUri(uri); onSettled?.(uri); }} />
    : <Text variant="h3" style={{ color: colors.accentInk }}>{name.slice(0, 2).toUpperCase()}</Text>}</View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { flexGrow: 1, flexBasis: 260, minWidth: 0, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: 48, height: 48 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
