import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Href, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const tabs: {
  label: string;
  route: Href;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  isActive: (pathname: string) => boolean;
}[] = [
  { label: 'Home', route: '/wricket/live', icon: 'home-variant-outline', isActive: path => path === '/wricket/live' },
  {
    label: 'My Wricket',
    route: '/wricket/my-wricket',
    icon: 'account-outline',
    isActive: path => path === '/wricket/my-wricket'
      || path === '/wricket'
      || path === '/wricket/stats'
      || path.startsWith('/wricket/player')
      || path.startsWith('/wricket/tournament')
      || path.startsWith('/wricket/team')
      || path.startsWith('/wricket/match'),
  },
  { label: 'Search', route: '/wricket/search', icon: 'magnify', isActive: path => path === '/wricket/search' || path.startsWith('/wricket/user') },
];

export function WricketTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map(tab => {
        const active = tab.isActive(pathname);
        return (
          <Pressable
            key={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => router.replace(tab.route)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={tab.icon} size={23} color={active ? colors.accent : colors.textDim} />
            <Text variant="caption" style={[styles.label, { color: active ? colors.accent : colors.textDim }]}>{tab.label}</Text>
            {active ? <View style={styles.indicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    minHeight: 56,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, position: 'relative' },
  label: { fontSize: 10 },
  indicator: { position: 'absolute', top: -spacing.sm, width: 28, height: 2, backgroundColor: colors.accent, borderRadius: 1 },
  pressed: { opacity: 0.72 },
});
