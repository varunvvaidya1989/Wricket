import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export function SportStageSignOutActions() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOutCurrentDevice();
    } catch (cause) {
      Alert.alert('Could not sign out', cause instanceof Error ? cause.message : 'Please try again.');
      setSigningOut(false);
    }
  };

  return <View style={styles.root}>
    <View style={styles.heading}><MaterialCommunityIcons name="logout-variant" size={19} color={colors.textMuted} /><View style={styles.copy}><Text variant="overline" tone="muted">SPORTSTAGE SESSION</Text><Text variant="caption" tone="dim">One account across every SportStage sport app.</Text></View></View>
    <Button title="Sign out of SportStage" variant="secondary" onPress={() => void signOut()} loading={signingOut} fullWidth />
    <Text variant="caption" tone="dim" style={styles.detail}>Signs out every SportStage sport app on this device. Other devices stay signed in.</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  copy: { flex: 1, gap: 3 },
  detail: { textAlign: 'center', marginTop: -4 },
});
