import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { authErrorMessage } from '@/lib/supabase/authErrors';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { CricketRole, playerProfileApi } from '@/lib/supabase/playerProfileApi';
import { LegacyPlayerCandidate, legacyPlayerLinkApi } from '@/lib/supabase/legacyPlayerLinkApi';
import { SportMultiSelect } from '@/components/sports/SportMultiSelect';
import { normalizeE164Phone } from '@/lib/auth/phone';

const cricketRoles: { value: CricketRole; label: string }[] = [
  { value: 'BAT', label: 'Batter' },
  { value: 'BOWL', label: 'Bowler' },
  { value: 'AR', label: 'All-rounder' },
  { value: 'WK', label: 'Wicket-keeper' },
];

export default function AccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(auth.profile?.displayName ?? '');
  const [email, setEmail] = useState(auth.session?.user.email ?? '');
  const [mobileNumber, setMobileNumber] = useState(getInitialPhone(auth.session));
  const [phoneError, setPhoneError] = useState<string>();
  const [primarySportCode, setPrimarySportCode] = useState(auth.profile?.primarySport?.code ?? 'CRICKET');
  const [selectedSportCodes, setSelectedSportCodes] = useState<string[]>([auth.profile?.primarySport?.code ?? 'CRICKET']);
  const [sports, setSports] = useState<SportOption[]>([]);
  const [role, setRole] = useState<CricketRole>('AR');
  const [battingHand, setBattingHand] = useState('');
  const [bowlingStyle, setBowlingStyle] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkCandidates, setLinkCandidates] = useState<LegacyPlayerCandidate[]>([]);
  const [claimPending, setClaimPending] = useState(false);
  const [skipLegacyLink, setSkipLegacyLink] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [destructiveAction, setDestructiveAction] = useState<'clear' | 'delete'>();

  useEffect(() => {
    void Promise.all([
      sportstageAccountApi.listSports(),
      auth.session ? playerProfileApi.getMine(auth.session.user.id) : Promise.resolve(undefined),
    ]).then(async ([sportOptions, existingPlayer]) => {
      setSports(sportOptions);
      const connectedCodes = auth.profile?.connectedSports.filter(sport => sport.accessStatus !== 'SUSPENDED').map(sport => sport.code) ?? [];
      if (connectedCodes.length) setSelectedSportCodes(connectedCodes);
      if (auth.profile?.primarySport?.code) setPrimarySportCode(auth.profile.primarySport.code);
      let player = existingPlayer;
      if (!player && connectedCodes.includes('CRICKET')) {
        const resolution = await legacyPlayerLinkApi.resolve(auth.profile?.displayName ?? 'Player');
        setLinkCandidates(resolution.candidates);
        if (resolution.status === 'LINKED' || resolution.status === 'AUTO_LINKED') {
          player = await playerProfileApi.getMine(auth.session!.user.id);
        }
      }
      if (player) {
        setRole(player.role);
        setBattingHand(player.battingHand ?? '');
        setBowlingStyle(player.bowlingStyle ?? '');
      }
    }).catch(cause => {
      Alert.alert('Could not load sports', cause instanceof Error ? cause.message : 'Please try again.');
    });
  }, [auth.profile, auth.session]);

  const requestLink = async (candidate: LegacyPlayerCandidate) => {
    setSaving(true);
    try {
      await legacyPlayerLinkApi.request(candidate.playerId);
      setClaimPending(true);
      setLinkCandidates([]);
      Alert.alert('Profile claim submitted', 'SportStage support will verify this one-time AuctionYodha profile connection.');
    } catch (cause) {
      Alert.alert('Could not request profile link', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setSaving(false); }
  };

  const save = async () => {
    if (displayName.trim().length < 2) return Alert.alert('Display name required', 'Enter at least two characters.');
    if (!email.trim()) return Alert.alert('Email required', 'Enter your account email.');
    if (!selectedSportCodes.length || !selectedSportCodes.includes(primarySportCode)) {
      return Alert.alert('Select your sports', 'Choose at least one sport and mark a selected sport as primary.');
    }
    const normalizedPhone = mobileNumber.trim() ? normalizeE164Phone(mobileNumber) : null;
    if (mobileNumber.trim() && !normalizedPhone) {
      setPhoneError('Include the country code, for example +91 98765 43210.');
      return;
    }
    if (selectedSportCodes.includes('CRICKET') && linkCandidates.length && !skipLegacyLink) {
      return Alert.alert('Review your previous profile', 'Choose the matching AuctionYodha player or select “None of these” first.');
    }
    setSaving(true);
    try {
      await sportstageAccountApi.saveSports(displayName, selectedSportCodes, primarySportCode);
      if (selectedSportCodes.includes('CRICKET') && auth.session && !claimPending) {
        await playerProfileApi.saveMine(auth.session.user.id, { displayName, role, battingHand, bowlingStyle });
      }
      if (email.trim().toLowerCase() !== auth.session?.user.email?.toLowerCase()) {
        await auth.updateEmail(email);
        Alert.alert('Confirm your email', 'Check your inbox to finish changing your email address.');
      }
      await auth.refreshProfile();
      const currentPhone = normalizeE164Phone(getInitialPhone(auth.session));
      if (normalizedPhone !== currentPhone) {
        await auth.updateMobile(normalizedPhone);
      }
      router.back();
    } catch (cause) {
      Alert.alert('Could not update account', authErrorMessage(cause, 'Could not update your account. Please try again.'));
    } finally { setSaving(false); }
  };

  const clearDeviceData = () => Alert.alert(
    'Clear data on this device?',
    'This clears downloaded tournaments, matches and offline scoring cache. Your SportStage account and cloud data are kept.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear data', style: 'destructive', onPress: () => {
        setDestructiveAction('clear');
        void auth.clearDeviceData().then(() => {
          Alert.alert('Device data cleared', 'Your account and cloud data are unchanged.');
          router.replace('/');
        }).catch(cause => Alert.alert('Could not clear data', cause instanceof Error ? cause.message : 'Please try again.'))
          .finally(() => setDestructiveAction(undefined));
      } },
    ],
  );

  const deleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    setDestructiveAction('delete');
    try {
      await auth.deleteAccount(deleteConfirmation);
      router.replace('/auth');
    } catch (cause) {
      Alert.alert('Could not delete account', cause instanceof Error ? cause.message : 'Please try again.');
    } finally { setDestructiveAction(undefined); }
  };

  return <Screen scroll>
    <View style={styles.headerRow}>
      <Pressable onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={23} color={colors.text} /></Pressable>
      <View><Text variant="overline" tone="muted">SPORTSTAGE</Text><Text variant="h2">Account settings</Text></View>
    </View>
    {selectedSportCodes.includes('CRICKET') && (linkCandidates.length > 0 || claimPending) ? <View style={styles.section}>
      <Text variant="overline" tone="muted">PREVIOUS PLAYER RECORD</Text>
      {claimPending ? <View style={styles.linkNotice}>
        <MaterialCommunityIcons name="clock-check-outline" size={24} color={colors.accent} />
        <View style={{ flex: 1 }}><Text variant="bodyStrong">Verification pending</Text><Text variant="caption" tone="muted">Your SportStage account remains usable while support verifies the historical profile.</Text></View>
      </View> : <>
        <Text variant="caption" tone="muted">We found AuctionYodha players with the same name. Name alone is not enough to connect automatically.</Text>
        {linkCandidates.map(candidate => <View key={candidate.playerId} style={styles.candidate}>
          <View style={{ flex: 1 }}><Text variant="bodyStrong">{candidate.displayName}</Text><Text variant="caption" tone="dim">AuctionYodha player</Text></View>
          <Button title="This is me" variant="secondary" onPress={() => void requestLink(candidate)} disabled={saving} />
        </View>)}
        <Button title="None of these" variant="ghost" onPress={() => { setSkipLegacyLink(true); setLinkCandidates([]); }} disabled={saving} fullWidth />
      </>}
    </View> : null}
    <View style={styles.section}>
      <Text variant="overline" tone="muted">PROFILE</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={colors.textDim} style={styles.input} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <Text variant="caption" tone="muted" style={styles.mobileLabel}>Mobile number</Text>
      <TextInput
        value={mobileNumber}
        onChangeText={value => { setMobileNumber(value); setPhoneError(undefined); }}
        placeholder="+91 98765 43210"
        placeholderTextColor={colors.textDim}
        keyboardType="phone-pad"
        autoCorrect={false}
        maxLength={20}
        accessibilityLabel="Mobile number with country code"
        style={[styles.input, phoneError ? styles.inputInvalid : undefined]}
      />
      <Text variant="caption" tone="dim">Include the country code. This is contact information and is not used to sign in.</Text>
      {phoneError ? <Text variant="caption" tone="danger">{phoneError}</Text> : null}
    </View>
    {selectedSportCodes.includes('CRICKET') ? <View style={styles.section}>
      <Text variant="overline" tone="muted">CRICKET PROFILE</Text>
      <Text variant="caption" tone="muted">This is the profile teammates see and the identity used for your career statistics.</Text>
      <View style={styles.optionGrid}>
        {cricketRoles.map(item => <Pressable key={item.value} onPress={() => setRole(item.value)} style={[styles.roleOption, role === item.value && styles.selected]}>
          <Text variant="caption" style={role === item.value ? styles.selectedText : undefined}>{item.label}</Text>
        </Pressable>)}
      </View>
      <View style={styles.optionGrid}>
        {['Right-handed', 'Left-handed'].map(hand => <Pressable key={hand} onPress={() => setBattingHand(hand)} style={[styles.roleOption, battingHand === hand && styles.selected]}>
          <Text variant="caption" style={battingHand === hand ? styles.selectedText : undefined}>{hand}</Text>
        </Pressable>)}
      </View>
      <TextInput value={bowlingStyle} onChangeText={setBowlingStyle} placeholder="Bowling style (optional)" placeholderTextColor={colors.textDim} style={styles.input} />
    </View> : null}
    <View style={styles.section}>
      <Text variant="overline" tone="muted">YOUR SPORTS</Text>
      <Text variant="caption" tone="muted">Select every sport you follow or play. Your primary sport controls the default SportStage experience.</Text>
      <SportMultiSelect sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />
    </View>
    <Button title="Save changes" onPress={() => void save()} loading={saving} fullWidth />
    <Button title="Change password" variant="secondary" onPress={() => router.push('/change-password')} disabled={saving} fullWidth />
    <View style={styles.dangerSection}>
      <Text variant="overline" style={styles.dangerText}>DATA & ACCOUNT</Text>
      <Text variant="bodyStrong">Clear data on this device</Text>
      <Text variant="caption" tone="muted">Removes downloaded and offline data while keeping your account and cloud records.</Text>
      <Button title="Clear device data" variant="secondary" onPress={clearDeviceData} loading={destructiveAction === 'clear'} disabled={saving || Boolean(destructiveAction)} fullWidth />
      <View style={styles.dangerDivider} />
      <Text variant="bodyStrong" style={styles.dangerText}>Permanently delete account</Text>
      <Text variant="caption" tone="muted">Deletes your SportStage login, owned tournaments, matches, live scores, profile links and account data. This cannot be undone.</Text>
      <TextInput value={deleteConfirmation} onChangeText={setDeleteConfirmation} placeholder="Type DELETE to confirm" placeholderTextColor={colors.textDim} autoCapitalize="characters" autoCorrect={false} style={[styles.input, styles.dangerInput]} />
      <Button title="Delete my account" variant="ghost" onPress={() => void deleteAccount()} loading={destructiveAction === 'delete'} disabled={deleteConfirmation !== 'DELETE' || saving || Boolean(destructiveAction)} fullWidth />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.xl },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: 16 },
  inputInvalid: { borderColor: colors.danger },
  mobileLabel: { marginTop: spacing.xs },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedText: { color: colors.accentInk },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roleOption: { minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  candidate: { minHeight: 64, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkNotice: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentMuted, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dangerSection: { gap: spacing.sm, marginTop: spacing.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md },
  dangerText: { color: colors.danger },
  dangerDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  dangerInput: { borderColor: colors.danger },
});

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

function getInitialPhone(session: ReturnType<typeof useAuth>['session']): string {
  const mobile = session?.user.user_metadata?.mobile_e164;
  if (typeof mobile === 'string') return mobile;
  const pendingPhone = session?.user.user_metadata?.pending_phone_e164;
  return typeof pendingPhone === 'string' ? pendingPhone : '';
}
