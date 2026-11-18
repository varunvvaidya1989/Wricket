import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { authErrorMessage } from '@/lib/supabase/authErrors';
import { StageSportPreferences } from '@/components/sports/platform/StageSportPreferences';
import { normalizePhoneParts } from '@/lib/auth/phone';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { StageButton, StageField, StageIntro, StageNotice, StagePage, StageStateArt, StageText } from '@/components/sports/platform/StageUI';
import { authReturnDescription } from '@/lib/auth/authExperience';
import { SignupField, validateSignup } from '@/lib/auth/signupValidation';
import { PhoneOtpSignIn } from '@/components/auth/PhoneOtpSignIn';
import { AuthLayout, AuthLink, AuthMethods, AuthPrimaryButton, authInputStyle } from '@/components/auth/AuthLayout';

export default function AuthScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeAuthReturnTo(params.returnTo);
  const [creating, setCreating] = useState(false);
  const [phoneSignIn, setPhoneSignIn] = useState(false);
  const [passwordSignIn, setPasswordSignIn] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  const submitting = useRef(false);

  const clearValidationField = (field: SignupField) => {
    setFieldErrors(current => current[field] ? { ...current, [field]: undefined } : current);
    setFormError(undefined);
  };

  useEffect(() => { void sportstageAccountApi.listSports().then(setSports).catch(() => undefined); }, []);

  const submit = async () => {
    if (submitting.current) return;
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
    submitting.current = true;
    setSaving(true);
    setFormError(undefined);
    try {
      if (creating) {
        const signedIn = await auth.signUp(email, password, { displayName, sportCodes: selectedSportCodes, primarySportCode, phoneE164: phoneE164! }, returnTo);
        if (!signedIn) {
          setAwaitingVerification(true);
          setPassword(''); setConfirmPassword('');
        }
      } else await auth.signIn(email, password);
    } catch (cause) {
      const message = authErrorMessage(cause, creating ? 'Could not create your account. Please try again.' : 'Could not sign in. Please try again.');
      setFormError(message);
      if (!creating && typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'email_not_confirmed') {
        setAwaitingVerification(true); setPassword(''); setConfirmPassword('');
      }
    } finally { submitting.current = false; setSaving(false); }
  };

  const resendVerification = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setFormError(undefined);
    try {
      await auth.resendSignupConfirmation(email, returnTo);
      setFormError('A new verification link was sent. Check your inbox and spam folder.');
    } catch (cause) {
      setFormError(authErrorMessage(cause, 'Wait a moment and try again.'));
    } finally { submitting.current = false; setSaving(false); }
  };

  const sendMagicLink = async () => {
    if (submitting.current) return;
    if (!email.trim()) { setFieldErrors({ email: 'Email is required.' }); return; }
    if (!isValidEmail(email)) { setFieldErrors({ email: 'Enter a valid email address.' }); return; }
    submitting.current = true;
    setSaving(true);
    setFormError(undefined);
    try {
      await auth.sendMagicLink(email, returnTo);
      setMagicLinkSent(true);
    } catch (cause) {
      const message = authErrorMessage(cause, 'Could not send a sign-in link. Please try again.');
      setFormError(message);

    } finally { submitting.current = false; setSaving(false); }
  };

  const task = authReturnDescription(returnTo);
  if (phoneSignIn) return <PhoneOtpSignIn task={task} onBack={() => setPhoneSignIn(false)} />;
  const submitButton = <AuthPrimaryButton title={creating ? 'Create account' : passwordSignIn ? 'Sign in' : 'Email me a sign-in link'} accessibilityLabel={creating ? 'Create account' : passwordSignIn ? 'Sign in' : 'Email me a sign-in link'} loading={saving} onPress={() => void (creating || passwordSignIn ? submit() : sendMagicLink())} />;

  if (magicLinkSent || awaitingVerification) return <StagePage focused title="Check email" footer={<StageButton primary title="Back to sign in" disabled={saving} onPress={() => { setMagicLinkSent(false); setAwaitingVerification(false); setCreating(false); setFormError(undefined); }} />}>
    <StageStateArt symbol="↗" />
    <StageIntro eyebrow={awaitingVerification ? 'VERIFY YOUR ACCOUNT' : 'ONE-TIME SIGN IN'} title={awaitingVerification ? 'Confirm your email.' : 'Check your inbox.'} description={awaitingVerification ? `Open the verification link sent to ${email.trim()} on this device to finish setup.` : 'If this email belongs to a SportStage account, we sent a one-time sign-in link. Open it on this device.'} />
    {returnTo ? <StageNotice>After sign-in → {task}</StageNotice> : null}
    {formError ? <StageNotice>{formError}</StageNotice> : null}
    <StageButton title={awaitingVerification ? 'Resend verification email' : 'Send another link'} loading={saving} onPress={() => void (awaitingVerification ? resendVerification() : sendMagicLink())} />
    <StageButton title="Use a different email" disabled={saving} onPress={() => { setMagicLinkSent(false); setAwaitingVerification(false); setFormError(undefined); }} />
  </StagePage>;

  return <AuthLayout title={creating ? 'Join the game.' : 'Welcome back.'} description={creating ? 'One account for your teams, tournaments and sports.' : !passwordSignIn ? 'We’ll email you a one-time link. No password needed.' : returnTo && returnTo !== '/account' ? `Sign in to continue to ${task.toLowerCase()}.` : 'Your teams. Your tournaments. Your SportStage.'}>
    {!creating ? <AuthMethods onEmail={() => undefined} onPhone={() => { setFormError(undefined); setPhoneSignIn(true); }} disabled={saving} /> : null}
    {creating ? <StageField editable={!saving} label="Display name" value={displayName} onChangeText={value => { setDisplayName(value); clearValidationField('displayName'); }} placeholder="Your player name" error={fieldErrors.displayName} /> : null}
    <StageField style={authInputStyle} editable={!saving} label="Email address" value={email} onChangeText={value => { setEmail(value); clearValidationField('email'); }} placeholder="you@example.com" keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} error={fieldErrors.email} />
    {creating ? <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ width: 80 }}><StageField editable={!saving} label="Country code" value={countryCode} onChangeText={value => { setCountryCode(value); clearValidationField('phone'); }} keyboardType="phone-pad" maxLength={5} /></View><View style={{ flex: 1 }}><StageField editable={!saving} label="Phone number" value={phoneNumber} onChangeText={value => { setPhoneNumber(value); clearValidationField('phone'); }} placeholder="Mobile number" keyboardType="phone-pad" maxLength={18} error={fieldErrors.phone} /></View></View> : null}
    {creating || passwordSignIn ? <View style={{ position: 'relative' }}>
      <StageField style={{ ...authInputStyle, paddingRight: 52 }} editable={!saving} label="Password" value={password} onChangeText={value => { setPassword(value); clearValidationField('password'); }} placeholder="Password" secureTextEntry={!showPassword} autoCapitalize="none" autoComplete={creating ? 'new-password' : 'current-password'} error={fieldErrors.password} onSubmitEditing={() => { if (!creating) void submit(); }} returnKeyType={creating ? 'next' : 'go'} />
      {!creating ? <View style={{ position: 'absolute', right: 0, top: -12 }}><AuthLink title="Forgot password?" disabled={saving} onPress={() => router.push({ pathname: '/forgot-password', params: returnTo ? { returnTo } : {} })} /></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => setShowPassword(value => !value)} style={{ position: 'absolute', right: 4, top: 33, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#a8b5aa" /></Pressable>
    </View> : null}
    {creating ? <StageField editable={!saving} label="Confirm password" value={confirmPassword} onChangeText={value => { setConfirmPassword(value); clearValidationField('confirmPassword'); }} placeholder="Confirm password" secureTextEntry autoCapitalize="none" autoComplete="new-password" error={fieldErrors.confirmPassword} /> : null}
    {creating ? <View style={{ gap: 10 }}><StageText variant="eyebrow" muted>YOUR SPORTS</StageText><StageText muted>Choose your sports and a primary sport. You can change these from your account.</StageText><StageSportPreferences disabled={saving} sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />{fieldErrors.sports ? <StageNotice>{fieldErrors.sports}</StageNotice> : null}</View> : null}
    {formError ? <StageNotice>{formError}</StageNotice> : null}
    {submitButton}
    {!creating ? <AuthLink title={passwordSignIn ? 'Use one-time email link' : 'Sign in with password'} muted disabled={saving} onPress={() => { setPasswordSignIn(value => !value); setFormError(undefined); setFieldErrors({}); }} /> : null}
    <View style={{ borderTopWidth: 1, borderTopColor: '#29392d', paddingTop: 16, gap: 2, alignItems: 'center' }}>
      <StageText muted style={{ fontSize: 13 }}>{creating ? 'Already part of SportStage?' : 'New to SportStage?'}</StageText>
      <AuthLink title={creating ? 'I already have an account' : 'Create a SportStage account'} disabled={saving} onPress={() => { setCreating(value => !value); setPasswordSignIn(true); setShowPassword(false); setFormError(undefined); setFieldErrors({}); }} />
    </View>
  </AuthLayout>;
}

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
