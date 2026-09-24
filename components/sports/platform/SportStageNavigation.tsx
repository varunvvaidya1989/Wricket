import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type Href, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/providers/AuthProvider';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';

export function SportStageNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const tabs = [
    { label: 'Live', route: '/live', icon: 'access-point' as const },
    { label: 'My sports', route: '/apps', icon: 'view-grid-outline' as const },
    { label: 'Following', route: '/feed', icon: 'heart-outline' as const },
    { label: 'Profile', route: '/profile', icon: 'account-circle-outline' as const },
  ];
  return <SafeAreaView edges={['bottom']} style={styles.safe}>
    <View style={styles.bar}>{tabs.map(tab => {
      const active = pathname === tab.route;
      return <Pressable key={tab.route} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => {
        if (!auth.session && tab.route !== '/live') router.push({ pathname: '/auth', params: { returnTo: tab.route } });
        else router.replace(tab.route as Href);
      }} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
        <View style={[styles.icon, active && styles.active]}><MaterialCommunityIcons name={tab.icon} size={23} color={active ? colors.accent : colors.textMuted} /></View>
        <Text style={[styles.label, active && { color: colors.accent }]}>{tab.label}</Text>
      </Pressable>;
    })}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { width: '100%', maxWidth: 1000, alignSelf: 'center', flexDirection: 'row', paddingVertical: 8 },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  icon: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: 12 },
  active: { backgroundColor: colors.accentMuted },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textMuted },
});
