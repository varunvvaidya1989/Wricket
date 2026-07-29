import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export default function MeScreen() {
  return <ProfileContent />;
}

function ProfileContent() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [saving, setSaving] = useState(false);

  const submitAuth = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }
    setSaving(true);
    try {
      if (creatingAccount) {
        const signedIn = await auth.signUp(email, password);
        if (!signedIn) Alert.alert('Check your email', 'Confirm your email, then return here to sign in.');
      } else {
        await auth.signIn(email, password);
      }
    } catch (error) {
      Alert.alert('Authentication failed', messageFor(error));
    } finally {
      setSaving(false);
    }
  };

  const submitProfile = async () => {
    setSaving(true);
    try {
      await auth.saveProfile(displayName);
    } catch (error) {
      Alert.alert('Could not save profile', messageFor(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <View style={styles.header}>
        <Text variant="overline" tone="muted">Profile</Text>
        <Text variant="h1">Me</Text>
      </View>

      <View style={styles.content}>
        {auth.loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : auth.error && !auth.session ? (
          <Card>
            <Text variant="h3">Cloud unavailable</Text>
            <Text variant="caption" tone="muted" style={styles.helper}>{auth.error}</Text>
            <Text variant="caption" tone="muted">
              Local tournaments and scoring remain available on this device.
            </Text>
          </Card>
        ) : !auth.session ? (
          <Card>
            <Text variant="h3">{creatingAccount ? 'Create cloud account' : 'Cloud sign in'}</Text>
            <Text variant="caption" tone="muted" style={styles.helper}>
              Sync identity now; match data remains safely stored on this device until cloud sync is enabled.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              style={styles.input}
            />
            <Button
              title={creatingAccount ? 'Create account' : 'Sign in'}
              onPress={submitAuth}
              loading={saving}
              fullWidth
            />
            <Button
              title={creatingAccount ? 'I already have an account' : 'Create an account'}
              variant="ghost"
              onPress={() => setCreatingAccount(value => !value)}
              disabled={saving}
              fullWidth
            />
          </Card>
        ) : !auth.profile ? (
          <Card>
            <Text variant="h3">Finish your profile</Text>
            <Text variant="caption" tone="muted" style={styles.helper}>{auth.session.user.email}</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={colors.textDim}
              autoCapitalize="words"
              style={styles.input}
            />
            <Button title="Save profile" onPress={submitProfile} loading={saving} fullWidth />
            <Button title="Sign out" variant="ghost" onPress={() => auth.signOut()} fullWidth />
          </Card>
        ) : (
          <Card>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="account" size={28} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{auth.profile.displayName}</Text>
                <Text variant="caption" tone="muted">{auth.session.user.email}</Text>
                <Text variant="caption" style={{ color: colors.success }}>Cloud account connected</Text>
              </View>
            </View>
            <Button title="Sign out" variant="ghost" onPress={() => auth.signOut()} fullWidth />
          </Card>
        )}

        <MenuCard icon="cog-outline" label="Settings" />
        <MenuCard icon="apps" label="SportStage apps" accent onPress={() => router.push('/')} />
        <MenuCard icon="information-outline" label="About Wricket" />
      </View>
    </Screen>
  );
}

function MenuCard({ icon, label, accent, onPress }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  accent?: boolean;
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress}>
      <View style={styles.profileRow}>
        <View style={styles.iconBubble}>
          <MaterialCommunityIcons name={icon} size={22} color={accent ? colors.accent : colors.text} />
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{label}</Text>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textDim} />
      </View>
    </Card>
  );
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  helper: { marginTop: spacing.xs, marginBottom: spacing.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBubble: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
});
