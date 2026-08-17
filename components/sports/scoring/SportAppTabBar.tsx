import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Href } from 'expo-router';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { colors } from '@/lib/theme/colors';

export function SportAppTabBar({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const pathname = usePathname();
  const presentation = SPORT_PRESENTATION[sportId];
  const base = `/${presentation.routeSegment}`;
  const tabs = [
    {
      key: 'home',
      label: 'Home',
      route: base,
      icon: 'home-variant-outline' as const,
      active: pathname === base,
    },
    {
      key: 'my-sport',
      label: `My ${SPORT_CONFIGS[sportId].name}`,
      route: `${base}/my-sport`,
      icon: 'account-outline' as const,
      active: pathname === `${base}/my-sport`
        || pathname.startsWith(`${base}/matches`)
        || pathname.startsWith(`${base}/competitions`)
        || pathname.startsWith(`${base}/competition`)
        || pathname.startsWith(`${base}/match`)
        || pathname.startsWith(`${base}/stats`),
    },
    {
      key: 'search',
      label: 'Search',
      route: `${base}/search`,
      icon: 'magnify' as const,
      active: pathname === `${base}/search`,
    },
  ];

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.bar}>
        {tabs.map((tab) => {
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab.active }}
              accessibilityLabel={tab.label}
              onPress={() => router.replace(tab.route as Href)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={tab.icon}
                size={21}
                color={tab.active ? presentation.accent : colors.textDim}
              />
              <Text variant="overline" style={[styles.label, { color: tab.active ? presentation.accent : colors.textDim }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.surface },
  bar: { minHeight: 58, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row' },
  tab: { flex: 1, minWidth: 0, paddingTop: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 9.5, letterSpacing: 0.2 },
  pressed: { opacity: 0.65 },
});
