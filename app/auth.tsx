import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { SportStageLogo } from '@/components/branding/SportStageLogo';
import { authErrorMessage } from '@/lib/supabase/authErrors';
import { SportMultiSelect } from '@/components/sports/SportMultiSelect';
import { normalizePhoneParts } from '@/lib/auth/phone';
import { SignupField, validateSignup } from '@/lib/auth/signupValidation';

export default function AuthScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [passwordSignIn, setPasswordSignIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sports, setSports] = useState<SportOption[]>([]);
  const [primarySportCode, setPrimarySportCode] = useState('CRICKET');
  const [selectedSportCodes, setSelectedSportCodes] = useState<string[]>(['CRICKET']);
  const [saving, setSaving] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupField, string>>>({});

  const clearValidationField = (field: SignupField) => {
    setFieldErrors(current => current[field] ? { ...current, [field]: undefined } : current);
    setFormError(undefined);
  };

  useEffect(() => { void sportstageAccountApi.listSports().then(setSports).catch(() => undefined); }, []);

  const submit = async () => {
    const phoneE164 = normalizePhoneParts(countryCode, phoneNumber);
    const validationErrors: Partial<Record<SignupField, string>> = creating
      ? validateSignup({ displayName, email, phoneE164, password, confirmPassword, selectedSportCodes, primarySportCode })
      : {
          ...(!email.trim() ? { email: 'Email is required.' } : !isValidEmail(email) ? { email: 'Enter a valid email address.' } : {}),
          ...(!password ? { password: 'Password is required.' } : {}),
        };
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) {
      setFormError('Check the highlighted fields and try again.');
      return;
    }
    setSaving(true);
    setFormError(undefined);
    try {
      if (creating) {
        const signedIn = await auth.signUp(email, password, { displayName, sportCodes: selectedSportCodes, primarySportCode, phoneE164: phoneE164! });
        if (!signedIn) {
          setAwaitingVerification(true);
          Alert.alert('Verify your email', 'We sent a verification link. Confirm your email to finish setup.');
        }
      } else await auth.signIn(email, password);
    } catch (cause) {
      const message = authErrorMessage(cause, creating ? 'Could not create your account. Please try again.' : 'Could not sign in. Please try again.');
      setFormError(message);
      Alert.alert(creating ? 'Could not create account' : 'Could not sign in', message);
    } finally { setSaving(false); }
  };

  const resendVerification = async () => {
    setSaving(true);
    try {
      await auth.resendSignupConfirmation(email);
      Alert.alert('Verification sent', 'Check your inbox and spam folder for a new confirmation link.');
    } catch (cause) {
      Alert.alert('Could not resend email', authErrorMessage(cause, 'Wait a moment and try again.'));
    } finally { setSaving(false); }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) return Alert.alert('Email required', 'Enter your SportStage account email.');
    if (!isValidEmail(email)) return Alert.alert('Invalid email', 'Enter a valid email address, for example name@example.com.');
    setSaving(true);
    setFormError(undefined);
    try {
      await auth.sendMagicLink(email);
      setMagicLinkSent(true);
    } catch (cause) {
      const message = authErrorMessage(cause, 'Could not send a sign-in link. Please try again.');
      setFormError(message);
      Alert.alert('Could not send sign-in link', message);
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

      {creating ? <View style={styles.field}><TextInput value={displayName} onChangeText={value => { setDisplayName(value); clearValidationField('displayName'); }} placeholder="Display name" placeholderTextColor={colors.textDim} style={[styles.input, fieldErrors.displayName && styles.inputInvalid]} accessibilityLabel="Display name" />{fieldErrors.displayName ? <Text variant="caption" tone="danger">{fieldErrors.displayName}</Text> : null}</View> : null}
      <View style={styles.field}><TextInput value={email} onChangeText={value => { setEmail(value); clearValidationField('email'); }} placeholder="Email" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={[styles.input, fieldErrors.email && styles.inputInvalid]} />{fieldErrors.email ? <Text variant="caption" tone="danger">{fieldErrors.email}</Text> : null}</View>
      {creating ? <View style={styles.phoneRow}>
        <TextInput value={countryCode} onChangeText={value => { setCountryCode(value); clearValidationField('phone'); }} placeholder="+91" placeholderTextColor={colors.textDim} keyboardType="phone-pad" style={[styles.input, styles.countryCode, fieldErrors.phone && styles.inputInvalid]} maxLength={5} accessibilityLabel="Country code" />
        <View style={styles.phoneNumber}><TextInput value={phoneNumber} onChangeText={value => { setPhoneNumber(value); clearValidationField('phone'); }} placeholder="Mobile number" placeholderTextColor={colors.textDim} keyboardType="phone-pad" style={[styles.input, fieldErrors.phone && styles.inputInvalid]} maxLength={18} accessibilityLabel="Phone number" />{fieldErrors.phone ? <Text variant="caption" tone="danger">{fieldErrors.phone}</Text> : null}</View>
      </View> : null}
      {creating || passwordSignIn ? <View style={styles.field}><TextInput value={password} onChangeText={value => { setPassword(value); clearValidationField('password'); }} placeholder="Password" placeholderTextColor={colors.textDim} secureTextEntry style={[styles.input, fieldErrors.password && styles.inputInvalid]} />{fieldErrors.password ? <Text variant="caption" tone="danger">{fieldErrors.password}</Text> : null}</View> : null}
      {creating ? <View style={styles.field}><TextInput value={confirmPassword} onChangeText={value => { setConfirmPassword(value); clearValidationField('confirmPassword'); }} placeholder="Confirm password" placeholderTextColor={colors.textDim} secureTextEntry style={[styles.input, fieldErrors.confirmPassword && styles.inputInvalid]} />{fieldErrors.confirmPassword ? <Text variant="caption" tone="danger">{fieldErrors.confirmPassword}</Text> : null}</View> : null}

      {creating ? <View style={styles.sports}>
        <Text variant="overline" tone="muted">SELECT YOUR SPORTS</Text>
        <Text variant="caption" tone="muted">Choose one or more. Your primary sport controls the default SportStage experience.</Text>
        <SportMultiSelect compact sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />
        {fieldErrors.sports ? <Text variant="caption" tone="danger">{fieldErrors.sports}</Text> : null}
      </View> : null}

      <Button
        title={creating ? 'Create account' : passwordSignIn ? 'Sign in' : 'Email me a sign-in link'}
        onPress={() => void (creating || passwordSignIn ? submit() : sendMagicLink())}
        loading={saving}
        fullWidth
      />
      {formError ? <View style={styles.errorBox} accessibilityRole="alert"><MaterialCommunityIcons name="alert-circle-outline" size={19} color={colors.danger} /><Text variant="caption" tone="danger" style={{ flex: 1 }}>{formError}</Text></View> : null}
      {!creating ? <Button title={passwordSignIn ? 'Use one-time email link' : 'Sign in with password'} variant="secondary" onPress={() => setPasswordSignIn(value => !value)} disabled={saving} fullWidth /> : null}
      {!creating && passwordSignIn ? <Button title="Forgot password?" variant="ghost" onPress={() => router.push('/forgot-password')} disabled={saving} fullWidth /> : null}
      <Button
        title={creating ? 'I already have an account' : 'Create a SportStage account'}
        variant="ghost"
        onPress={() => {
          setCreating(value => !value);
          setPasswordSignIn(false);
          setFormError(undefined);
        }}
        disabled={saving}
        fullWidth
      />
      <Button title="Back to live scores" variant="secondary" onPress={() => router.replace('/live')} disabled={saving} fullWidth />
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
  inputInvalid: { borderColor: colors.danger },
  field: { gap: spacing.xs },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  countryCode: { width: 88 },
  phoneNumber: { flex: 1 },
  sports: { gap: spacing.sm },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
});

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function toggleSport(code: string, selected: string[], primary: string, setSelected: (codes: string[]) => void, setPrimary: (code: string) => void) {
  if (selected.includes(code)) {
    const next = selected.filter(item => item !== code);
    setSelected(next);
    if (primary === code) setPrimary(next[0] ?? '');
  } else {
    setSelected([...selected, code]);
    if (!primary) setPrimary(code);
  }
}
