import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { SportStageLogo } from '@/components/branding/SportStageLogo';

export default function AuthScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [passwordSignIn, setPasswordSignIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sports, setSports] = useState<SportOption[]>([]);
  const [sportCode, setSportCode] = useState('CRICKET');
  const [saving, setSaving] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  useEffect(() => { void sportstageAccountApi.listSports().then(setSports).catch(() => undefined); }, []);

  const submit = async () => {
    if (!email.trim() || !password) return Alert.alert('Missing details', 'Enter your email and password.');
    if (creating && displayName.trim().length < 2) return Alert.alert('Display name required', 'Enter at least two characters.');
    if (creating && password !== confirmPassword) return Alert.alert('Passwords do not match', 'Re-enter the same password.');
    setSaving(true);
    try {
      if (creating) {
        const signedIn = await auth.signUp(email, password, { displayName, sportCode });
        if (!signedIn) {
          setAwaitingVerification(true);
          Alert.alert('Verify your email', 'We sent a verification link. Confirm your email to finish setup.');
        }
      } else await auth.signIn(email, password);
    } catch (cause) {
      Alert.alert(creating ? 'Could not create account' : 'Could not sign in', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  const resendVerification = async () => {
    setSaving(true);
    try {
      await auth.resendSignupConfirmation(email);
      Alert.alert('Verification sent', 'Check your inbox and spam folder for a new confirmation link.');
    } catch (cause) {
      Alert.alert('Could not resend email', cause instanceof Error ? cause.message : 'Wait a moment and try again.');
    } finally { setSaving(false); }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) return Alert.alert('Email required', 'Enter your SportStage account email.');
    setSaving(true);
    try {
      await auth.sendMagicLink(email);
      setMagicLinkSent(true);
    } catch (cause) {
      Alert.alert('Could not send sign-in link', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  if (magicLinkSent) return <View style={styles.verificationPage}>
    <View style={styles.brand}><MaterialCommunityIcons name="email-fast-outline" size={32} color={colors.accentInk} /></View>
    <Text variant="overline" tone="accent">ONE-TIME SIGN IN</Text>
    <Text variant="h1">Check your email</Text>
    <Text variant="body" tone="muted" style={styles.intro}>If {email.trim()} belongs to a SportStage account, we sent a secure one-time sign-in link. Open it on this device.</Text>
    <Button title="Send another link" onPress={() => void sendMagicLink()} loading={saving} fullWidth />
    <Button title="Back to sign in" variant="ghost" onPress={() => setMagicLinkSent(false)} disabled={saving} fullWidth />
  </View>;

  if (awaitingVerification) return <View style={styles.verificationPage}>
    <View style={styles.brand}><MaterialCommunityIcons name="email-check-outline" size={32} color={colors.accentInk} /></View>
    <Text variant="overline" tone="accent">CHECK YOUR INBOX</Text>
    <Text variant="h1">Confirm your email</Text>
    <Text variant="body" tone="muted" style={styles.intro}>We sent a SportStage verification link to {email.trim()}. Open it on this device to continue.</Text>
    <Button title="Resend verification email" onPress={() => void resendVerification()} loading={saving} fullWidth />
    <Button title="Use a different email" variant="ghost" onPress={() => setAwaitingVerification(false)} disabled={saving} fullWidth />
  </View>;

  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SportStageLogo size={64} />
      <Text variant="overline" tone="accent">SPORTSTAGE</Text>
      <Text variant="h1">{creating ? 'Create your account' : 'Welcome back'}</Text>
      <Text variant="body" tone="muted" style={styles.intro}>{creating ? 'One account for every role you earn across sport.' : passwordSignIn ? 'Enter your password to continue.' : 'Enter your email and we’ll send a secure one-time sign-in link.'}</Text>

      {creating ? <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={colors.textDim} style={styles.input} /> : null}
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
      {creating || passwordSignIn ? <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textDim} secureTextEntry style={styles.input} /> : null}
      {creating ? <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" placeholderTextColor={colors.textDim} secureTextEntry style={styles.input} /> : null}

      {creating ? <View style={styles.sports}>
        <Text variant="overline" tone="muted">SELECT YOUR SPORT</Text>
        <View style={styles.sportGrid}>{sports.map(sport => <Pressable key={sport.id} onPress={() => setSportCode(sport.code)} style={[styles.sport, sportCode === sport.code && styles.sportSelected]}>
          <MaterialCommunityIcons name={sport.code === 'CRICKET' ? 'cricket' : 'trophy-outline'} size={20} color={sportCode === sport.code ? colors.accentInk : colors.textMuted} />
          <Text variant="caption" style={sportCode === sport.code ? { color: colors.accentInk } : undefined}>{sport.name}</Text>
          {sport.status === 'COMING_SOON' ? <Text variant="overline" tone={sportCode === sport.code ? 'default' : 'dim'}>SOON</Text> : null}
        </Pressable>)}</View>
      </View> : null}

      <Button
        title={creating ? 'Create account' : passwordSignIn ? 'Sign in' : 'Email me a sign-in link'}
        onPress={() => void (creating || passwordSignIn ? submit() : sendMagicLink())}
        loading={saving}
        fullWidth
      />
      {!creating ? <Button title={passwordSignIn ? 'Use one-time email link' : 'Sign in with password'} variant="secondary" onPress={() => setPasswordSignIn(value => !value)} disabled={saving} fullWidth /> : null}
      {!creating && passwordSignIn ? <Button title="Forgot password?" variant="ghost" onPress={() => router.push('/forgot-password')} disabled={saving} fullWidth /> : null}
      <Button
        title={creating ? 'I already have an account' : 'Create a SportStage account'}
        variant="ghost"
        onPress={() => {
          setCreating(value => !value);
          setPasswordSignIn(false);
        }}
        disabled={saving}
        fullWidth
      />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  verificationPage: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  brand: { width: 60, height: 60, borderRadius: radius.lg, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  intro: { marginBottom: spacing.sm, lineHeight: 22 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
  sports: { gap: spacing.sm },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sport: { minWidth: '47%', flex: 1, minHeight: 72, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', gap: 3 },
  sportSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
});
