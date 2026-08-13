import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { MatchesSection } from '@/components/wricket/my-wricket/MatchesSection';
import { MyTeamsSection } from '@/components/wricket/my-wricket/MyTeamsSection';
import { WricketAvatarButton } from '@/components/wricket/navigation/WricketProfileDrawer';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import TournamentsScreen from './index';
import StatsScreen from './stats';

type MyWricketSection = 'matches' | 'tournaments' | 'teams' | 'performance';

const SECTIONS: { id: MyWricketSection; label: string }[] = [
  { id: 'matches', label: 'Matches' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'teams', label: 'My Teams' },
  { id: 'performance', label: 'Performance' },
];

export default function MyWricketScreen() {
  const router = useRouter();
  const { section: linkedSection } = useLocalSearchParams<{ section?: MyWricketSection }>();
  const section = linkedSection && SECTIONS.some(item => item.id === linkedSection) ? linkedSection : 'matches';

  const selectSection = (next: MyWricketSection) => {
    router.setParams({ section: next });
  };

  return (
    <Screen padded={false}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><MaterialCommunityIcons name="cricket" size={20} color={colors.accentInk} /></View>
          <Text variant="h3">My Wricket</Text>
        </View>
        <WricketAvatarButton />
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {SECTIONS.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item.id }}
            onPress={() => selectSection(item.id)}
            style={[styles.tab, section === item.id && styles.tabActive]}
          >
            <Text variant="caption" tone={section === item.id ? 'accent' : 'muted'} style={styles.tabLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.section}>
        {section === 'matches' ? <MatchesSection /> : null}
        {section === 'tournaments' ? <TournamentsScreen embedded /> : null}
        {section === 'teams' ? <MyTeamsSection /> : null}
        {section === 'performance' ? <StatsScreen embedded /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { minHeight: 58, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  tabs: { marginHorizontal: spacing.lg, marginBottom: spacing.xs, flexDirection: 'row', paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  tab: { flex: 1, minWidth: 0, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabLabel: { fontSize: 9.5, textAlign: 'center' },
  section: { flex: 1 },
});
