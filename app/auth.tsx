import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { authErrorMessage } from '@/lib/supabase/authErrors';
import { StageSportPreferences } from '@/components/sports/platform/StageSportPreferences';
import { normalizePhoneParts } from '@/lib/auth/phone';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { StageButton, StageField, StageIntro, StageNotice, StagePage, StageStateArt, StageText } from '@/components/sports/platform/StageUI';
import { authReturnDescription } from '@/lib/auth/authExperience';
import { SignupField, validateSignup } from '@/lib/auth/signupValidation';

export default function AuthScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = safeAuthReturnTo(params.returnTo);
  const [creating, setCreating] = useState(false);
  const [passwordSignIn, setPasswordSignIn] = useState(true);
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
        const signedIn = await auth.signUp(email, password, { displayName, sportCodes: selectedSportCodes, primarySportCode, phoneE164: phoneE164! }, returnTo);
        if (!signedIn) {
          setAwaitingVerification(true);

        }
      } else await auth.signIn(email, password);
    } catch (cause) {
      const message = authErrorMessage(cause, creating ? 'Could not create your account. Please try again.' : 'Could not sign in. Please try again.');
      setFormError(message);

    } finally { setSaving(false); }
  };

  const resendVerification = async () => {
    setSaving(true);
    try {
      await auth.resendSignupConfirmation(email, returnTo);
      setFormError('A new verification link was sent. Check your inbox and spam folder.');
    } catch (cause) {
      setFormError(authErrorMessage(cause, 'Wait a moment and try again.'));
    } finally { setSaving(false); }
  };

  const sendMagicLink = async () => {
    if (!email.trim()) { setFieldErrors({ email: 'Email is required.' }); return; }
    if (!isValidEmail(email)) { setFieldErrors({ email: 'Enter a valid email address.' }); return; }
    setSaving(true);
    setFormError(undefined);
    try {
      await auth.sendMagicLink(email, returnTo);
      setMagicLinkSent(true);
    } catch (cause) {
      const message = authErrorMessage(cause, 'Could not send a sign-in link. Please try again.');
      setFormError(message);

    } finally { setSaving(false); }
  };

  const task = authReturnDescription(returnTo);
  const submitButton = <StageButton primary title={creating ? 'Create account' : passwordSignIn ? 'Sign in & continue' : 'Email me a sign-in link'} accessibilityLabel={creating ? 'Create account' : passwordSignIn ? 'Sign in' : 'Email me a sign-in link'} loading={saving} onPress={() => void (creating || passwordSignIn ? submit() : sendMagicLink())} />;

  if (magicLinkSent || awaitingVerification) return <StagePage focused title="Check email" footer={<StageButton primary title="Back to sign in" disabled={saving} onPress={() => { setMagicLinkSent(false); setAwaitingVerification(false); setCreating(false); setFormError(undefined); }} />}>
    <StageStateArt symbol="↗" />
    <StageIntro eyebrow={awaitingVerification ? 'VERIFY YOUR ACCOUNT' : 'ONE-TIME SIGN IN'} title={awaitingVerification ? 'Confirm your email.' : 'Check your inbox.'} description={awaitingVerification ? `Open the verification link sent to ${email.trim()} on this device to finish setup.` : 'If this email belongs to a SportStage account, we sent a one-time sign-in link. Open it on this device.'} />
    {returnTo ? <StageNotice>After sign-in → {task}</StageNotice> : null}
    {formError ? <StageNotice>{formError}</StageNotice> : null}
    <StageButton title={awaitingVerification ? 'Resend verification email' : 'Send another link'} loading={saving} onPress={() => void (awaitingVerification ? resendVerification() : sendMagicLink())} />
    <StageButton title="Use a different email" disabled={saving} onPress={() => { setMagicLinkSent(false); setAwaitingVerification(false); setFormError(undefined); }} />
  </StagePage>;

  return <StagePage focused title={creating ? 'Create account' : 'Sign in'} footer={submitButton}>
    <StageIntro eyebrow={creating ? 'FIRST, YOUR ACCOUNT' : 'YOUR SPORTSTAGE ACCOUNT'} title={creating ? 'Let’s get you in.' : 'Welcome back.'} description={creating ? 'Your display name appears on your player profile.' : passwordSignIn ? `Sign in to ${task.toLowerCase()}.` : 'Enter your account email for a one-time sign-in link.'} />
    {returnTo ? <StageNotice>After sign-in → {task}</StageNotice> : null}
    {creating ? <StageField label="Display name" value={displayName} onChangeText={value => { setDisplayName(value); clearValidationField('displayName'); }} placeholder="Your player name" error={fieldErrors.displayName} /> : null}
    <StageField label="Email address" value={email} onChangeText={value => { setEmail(value); clearValidationField('email'); }} placeholder="Email" keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} error={fieldErrors.email} />
    {creating ? <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ width: 80 }}><StageField label="Country code" value={countryCode} onChangeText={value => { setCountryCode(value); clearValidationField('phone'); }} keyboardType="phone-pad" maxLength={5} /></View><View style={{ flex: 1 }}><StageField label="Phone number" value={phoneNumber} onChangeText={value => { setPhoneNumber(value); clearValidationField('phone'); }} placeholder="Mobile number" keyboardType="phone-pad" maxLength={18} error={fieldErrors.phone} /></View></View> : null}
    {creating || passwordSignIn ? <StageField label="Password" value={password} onChangeText={value => { setPassword(value); clearValidationField('password'); }} placeholder="Password" secureTextEntry autoCapitalize="none" autoComplete={creating ? 'new-password' : 'current-password'} error={fieldErrors.password} /> : null}
    {creating ? <StageField label="Confirm password" value={confirmPassword} onChangeText={value => { setConfirmPassword(value); clearValidationField('confirmPassword'); }} placeholder="Confirm password" secureTextEntry autoCapitalize="none" autoComplete="new-password" error={fieldErrors.confirmPassword} /> : null}
    {creating ? <View style={{ gap: 10 }}><StageText variant="eyebrow" muted>YOUR SPORTS</StageText><StageText muted>Choose your sports and a primary sport. You can change these from your account.</StageText><StageSportPreferences sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />{fieldErrors.sports ? <StageNotice>{fieldErrors.sports}</StageNotice> : null}</View> : null}
    {formError ? <StageNotice>{formError}</StageNotice> : null}
    {!creating && passwordSignIn ? <StageButton title="Forgot password?" disabled={saving} onPress={() => router.push({ pathname: '/forgot-password', params: returnTo ? { returnTo } : {} })} /> : null}
    <StageButton title={creating ? 'I already have an account' : 'Create a SportStage account'} disabled={saving} onPress={() => { setCreating(value => !value); setPasswordSignIn(true); setFormError(undefined); setFieldErrors({}); }} />
    {!creating ? <StageButton title={passwordSignIn ? 'Use one-time email link' : 'Sign in with password'} disabled={saving} onPress={() => { setPasswordSignIn(value => !value); setFormError(undefined); setFieldErrors({}); }} /> : null}
    <StageButton title="Back to live scores" disabled={saving} onPress={() => router.replace('/live')} />
  </StagePage>;
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
