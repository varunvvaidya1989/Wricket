import { useAuth } from '@/components/providers/AuthProvider';
import { DesignIcon } from './DesignIcon';
import { type Href, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/wricket/ui/Text';
import { fonts } from '@/lib/wricket/presentation/design';
import { spacing } from '@/lib/theme/spacing';

export function WricketHeader({ title, backTo, onBack, children }: { title: string; backTo?: Href; onBack?: () => void; children?: React.ReactNode }) {
  const router = useRouter();
  const auth = useAuth();
  const initials = (auth.profile?.displayName ?? 'My account').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <View style={styles.header}>
    {backTo ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.action}
      onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace(backTo))}>
      <DesignIcon name="back" />
    </Pressable> : null}
    {title === 'Wricket' ? <Text style={styles.wordmark}>wricket<Text style={styles.wordmark} tone="accent"> /</Text></Text>
      : <Text variant="h3" style={styles.title}>{title}</Text>}
    {children}
    {!backTo ? <Pressable accessibilityRole="button" accessibilityLabel="Switch sport" onPress={() => router.push({ pathname: '/switch-sport', params: { current: 'CRICKET' } })} style={styles.action}>
      <DesignIcon name="grid" />
    </Pressable>
    : null}
    {!backTo ? <Pressable accessibilityRole="button" accessibilityLabel="Open account" onPress={() => router.push('/account')} style={styles.action}>
      <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
    </Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  header: { minHeight: 64, paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  wordmark: { fontFamily: fonts.display, fontSize: 29, lineHeight: 36, letterSpacing: -1.7, flex: 1 },
  avatar: { width: 33, height: 33, borderRadius: 17, borderWidth: 1, borderColor: '#65755d', backgroundColor: '#34472f', alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.mono, fontSize: 10, color: '#daf8c2' },
  title: { flex: 1, flexShrink: 1, paddingVertical: spacing.sm },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
