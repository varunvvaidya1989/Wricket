import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type Href, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportIcon } from '@/components/sports/SportIcon';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { RELEASED_SPORTSTAGE_SPORTS } from '@/lib/sports/platform/sportLiveContent';
import { colors } from '@/lib/theme/colors';

const routes: Record<string, string> = {
  CRICKET: 'wricket', TENNIS: 'tennis', BADMINTON: 'badminton',
  PADEL: 'padel', TABLE_TENNIS: 'table-tennis', PICKLEBALL: 'pickleball',
};

export function MatchLauncher({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const connected = auth.profile?.connectedSports.some(sport => sport.code === selected && sport.accessStatus === 'ACTIVE');
  const start = () => {
    if (!selected || !routes[selected]) return;
    setOpen(false);
    const route = `/${routes[selected]}/match/new`;
    if (!auth.session) router.push({ pathname: '/auth', params: { returnTo: route } });
    else router.push((connected ? route : '/account') as Href);
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Start a match" onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, compact && styles.compact, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="plus" size={22} color={colors.accentInk} />
      <Text variant="bodyStrong" style={styles.triggerText}>Start a match</Text>
      {!compact ? <MaterialCommunityIcons name="arrow-right" size={20} color={colors.accentInk} /> : null}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.heading}>
            <View style={styles.flex}><Text variant="overline" tone="accent">LET’S PLAY</Text><Text variant="h1">Choose your sport</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close sport selection" onPress={() => setOpen(false)} style={styles.close}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <Text tone="muted">Pick a sport. Set up your players. You’re ready to score.</Text>
          <ScrollView contentContainerStyle={styles.options}>
            {RELEASED_SPORTSTAGE_SPORTS.map(sport => <Pressable key={sport.code} accessibilityRole="radio" accessibilityState={{ checked: selected === sport.code }} onPress={() => setSelected(sport.code)} style={[styles.option, selected === sport.code && styles.selected]}>
              <SportIcon code={sport.code} size={26} color={selected === sport.code ? colors.accent : colors.textMuted} />
              <Text variant="bodyStrong" style={styles.flex}>{sport.name}</Text>
              <MaterialCommunityIcons name={selected === sport.code ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected === sport.code ? colors.accent : colors.textDim} />
            </Pressable>)}
          </ScrollView>
          {selected && auth.session && !connected ? <Text variant="caption" tone="muted">Add this sport in your account to create a match.</Text> : null}
          <Button title={!auth.session ? 'Sign in to continue' : selected && !connected ? 'Manage my sports' : 'Continue to match setup'} disabled={!selected} onPress={start} fullWidth />
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  compact: { minHeight: 48, paddingHorizontal: 16 },
  triggerText: { color: colors.accentInk },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, padding: 24, gap: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceElevated },
  options: { gap: 8 },
  option: { minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  pressed: { opacity: 0.8 },
});
