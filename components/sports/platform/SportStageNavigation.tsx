import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type Href, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/providers/AuthProvider';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';
import { StageText, stageColors as colors } from './StageUI';

export function SportStageNavigation({ sportId }: { sportId?: ScoringSportId }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const sport = sportId ? SPORT_PRESENTATION[sportId] : undefined;
  const tabs = sport ? [{ label: 'Now', route: `/${sport.routeSegment}` }, { label: 'My game', route: `/${sport.routeSegment}/my-sport` }, { label: 'Stats', route: `/${sport.routeSegment}/stats` }, { label: 'Explore', route: `/${sport.routeSegment}/search` }] : [{ label: 'Now', route: '/live' }, { label: 'My sports', route: '/apps' }, { label: 'Explore', route: '/explore' }];
  const openPrivate = (route: string) => auth.session ? router.push(route as Href) : router.push({ pathname: '/auth', params: { returnTo: route } });
  return <SafeAreaView role="navigation" accessibilityLabel={sportId ? `${SPORT_CONFIGS[sportId].name} navigation` : 'SportStage navigation'} edges={['top']} style={styles.safe}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Switch sport" onPress={() => router.push('/switch-sport')} style={styles.context}>
        <StageText variant="eyebrow" muted style={styles.contextLabel}>SPORTSTAGE / {sport ? 'YOUR SPORT' : 'ALL YOUR SPORTS'}</StageText>
        <View style={styles.name}><StageText variant="heading">{sportId ? SPORT_CONFIGS[sportId].name : 'SportStage'}</StageText><MaterialCommunityIcons name="chevron-down" size={20} color={colors.accent} /></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => openPrivate('/notifications')} style={styles.icon}>
        <MaterialCommunityIcons name="bell-outline" size={21} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={auth.session ? 'Your profile' : 'Sign in'} onPress={() => openPrivate('/profile')} style={styles.avatar}>
        {auth.profile?.avatarUrl ? <Image accessible={false} source={{ uri: auth.profile.avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatarFallback}><StageText variant="eyebrow" style={{ color: colors.accent, letterSpacing: 0 }}>{auth.profile?.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SS'}</StageText></View>}
      </Pressable>
    </View>
    <View style={styles.bar}>{tabs.map(tab => <Pressable key={tab.route} accessibilityRole="button" accessibilityLabel={`${tab.label}${pathname === tab.route ? ', current page' : ''}`} onPress={() => {
      if (!auth.session && tab.route === '/apps') openPrivate(tab.route);
      else router.navigate(tab.route as Href);
    }} style={[styles.tab, pathname === tab.route && styles.active]}><StageText style={pathname === tab.route ? { color: colors.accent } : { color: colors.textMuted }}>{tab.label}</StageText></Pressable>)}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.bg },
  header: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10 },
  context: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 3 },
  contextLabel: { fontSize: 9, lineHeight: 13.5 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  icon: { width: 44, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 39, height: 39, borderRadius: 20 },
  avatarFallback: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, borderColor: '#65755d', backgroundColor: '#34472f', alignItems: 'center', justifyContent: 'center' },
  bar: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  active: { borderBottomColor: colors.accent },
});
