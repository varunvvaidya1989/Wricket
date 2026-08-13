import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Text } from '@/components/ui/Text';
import { MyTeamsCard } from '@/components/wricket/teams/MyTeamsCard';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function MyTeamsSection() {
  const auth = useAuth();
  const router = useRouter();
  if (!auth.session) {
    return <View style={styles.center}>
      <MaterialCommunityIcons name="account-group-outline" size={34} color={colors.textMuted} />
      <Text variant="h3">Sign in to manage your teams</Text>
      <Text tone="muted" style={styles.centerText}>Create reusable teams and keep one roster across tournaments and friendly matches.</Text>
      <Pressable onPress={() => router.push('/account')} style={styles.primaryButton}><Text variant="bodyStrong" style={styles.primaryButtonText}>SIGN IN</Text></Pressable>
    </View>;
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <MyTeamsCard
        accountId={auth.session.user.id}
        onOpenTeam={id => router.push({ pathname: '/wricket/team/[id]', params: { id } })}
        showIntro={false}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: 'center' },
  primaryButton: { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.accent },
  primaryButtonText: { color: colors.accentInk },
});
