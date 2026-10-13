import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/components/providers/AuthProvider';
import { OrganiserButton as Button } from '@/components/sports/platform/OrganiserButton';

import { colors, fonts } from '@/lib/wricket/presentation/design';
import { StageButton, StageField, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from '@/components/sports/platform/StageUI';
import { StageLegacyRecord } from '@/components/sports/platform/StageLegacyRecord';
import { StageSportPreferences } from '@/components/sports/platform/StageSportPreferences';
import { radius, spacing } from '@/lib/theme/spacing';
import { authErrorMessage } from '@/lib/supabase/authErrors';
import { SportOption, sportstageAccountApi } from '@/lib/supabase/sportstageAccountApi';
import { CricketRole, playerProfileApi } from '@/lib/supabase/playerProfileApi';
import { LegacyPlayerCandidate, legacyPlayerLinkApi } from '@/lib/supabase/legacyPlayerLinkApi';

import { normalizeE164Phone } from '@/lib/auth/phone';
import { safeAuthReturnTo } from '@/lib/auth/returnTo';
import { sportHome, stageSports } from '@/lib/sports/platform/connectedExperience';

const cricketRoles: { value: CricketRole; label: string }[] = [
  { value: 'BAT', label: 'Batter' },
  { value: 'BOWL', label: 'Bowler' },
  { value: 'AR', label: 'All-rounder' },
  { value: 'WK', label: 'Wicket-keeper' },
];

export default function AccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; section?: string }>();
  const returnTo = safeAuthReturnTo(params.returnTo);
  const requestedSport = stageSports.find(sport => returnTo === sportHome(sport.code) || returnTo === `${sportHome(sport.code)}/match/new`);
  const section = requestedSport ? 'sports' : params.section;
  const editor = ['identity', 'sports', 'cricket', 'playing', 'data', 'apps'].includes(section ?? '');
  const [accountError, setAccountError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
  const [avatarUrl, setAvatarUrl] = useState(auth.profile?.avatarUrl ?? undefined);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [linkCandidates, setLinkCandidates] = useState<LegacyPlayerCandidate[]>([]);
  const [claimPending, setClaimPending] = useState(false);
  const [skipLegacyLink, setSkipLegacyLink] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [destructiveAction, setDestructiveAction] = useState<'clear' | 'delete'>();
  const [dataReview, setDataReview] = useState<'clear' | 'delete'>();
  const [dataReceipt, setDataReceipt] = useState<string>();
  const destructiveBusy = useRef(false);
  const initializedAccount = useRef<string | undefined>(undefined);
  useEffect(() => {
    setDataReview(undefined);
    setDeleteConfirmation('');
    setDataReceipt(undefined);
  }, [auth.session?.user.id, section]);

  useEffect(() => {
    const id = auth.session?.user.id;
    if (!id || auth.profile?.id !== id || initializedAccount.current === id) return;
    initializedAccount.current = id;
    setDisplayName(auth.profile.displayName);
    setEmail(auth.session?.user.email ?? '');
    setMobileNumber(getInitialPhone(auth.session));
  }, [auth.profile, auth.session]);

  useEffect(() => {
    let active = true;
    setLoaded(false); setLoadFailed(false); setAccountError(undefined);
    void Promise.all([
      sportstageAccountApi.listSports(),
      auth.session ? playerProfileApi.getMine(auth.session.user.id) : Promise.resolve(undefined),
    ]).then(async ([sportOptions, existingPlayer]) => {
      if (!active) return;
      setSports(sportOptions);
      const connectedCodes = auth.profile?.connectedSports.filter(sport => sport.accessStatus !== 'SUSPENDED').map(sport => sport.code) ?? [];
      if (connectedCodes.length) setSelectedSportCodes(connectedCodes);
      if (auth.profile?.primarySport?.code) setPrimarySportCode(auth.profile.primarySport.code);
      let player = existingPlayer;
      if (!player && connectedCodes.includes('CRICKET')) {
        const resolution = await legacyPlayerLinkApi.resolve(auth.profile?.displayName ?? 'Player');
        if (!active) return;
        setLinkCandidates(resolution.candidates);
        if (resolution.status === 'LINKED' || resolution.status === 'AUTO_LINKED') {
          player = await playerProfileApi.getMine(auth.session!.user.id);
        }
      }
      if (!active) return;
      if (player) {
        setRole(player.role);
        setBattingHand(player.battingHand ?? '');
        setBowlingStyle(player.bowlingStyle ?? '');
      }
    }).catch(cause => {
      if (active) { setLoadFailed(true); setAccountError(cause instanceof Error ? cause.message : 'Could not load your account.'); }
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [auth.profile, auth.session, loadAttempt]);

  useEffect(() => {
    setAvatarUrl(auth.profile?.avatarUrl ?? undefined);
  }, [auth.profile?.avatarUrl]);

  const chooseAvatar = async () => {
    if (!auth.session || uploadingAvatar) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose your SportStage profile image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled) return;
    setUploadingAvatar(true);
    try {
      setAvatarUrl(await sportstageAccountApi.updateAvatar(auth.session.user.id, result.assets[0].uri));
      await auth.refreshProfile();
    } catch (cause) {
      Alert.alert('Could not update profile image', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

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
    if (!loaded || loadFailed) return;
    setAccountError(undefined);
    if (requestedSport && !selectedSportCodes.includes(requestedSport.code)) {
      return setAccountError(`Select ${requestedSport.name} to continue to your selected task.`);
    }
    if (displayName.trim().length < 2) return setAccountError('Enter a display name with at least two characters.');
    if (!email.trim()) return setAccountError('Enter your account email.');
    if (!selectedSportCodes.length || !selectedSportCodes.includes(primarySportCode)) {
      return setAccountError('Choose at least one sport and mark a selected sport as primary.');
    }
    const normalizedPhone = mobileNumber.trim() ? normalizeE164Phone(mobileNumber) : null;
    if (mobileNumber.trim() && !normalizedPhone) {
      setPhoneError('Include the country code, for example +91 98765 43210.');
      return;
    }
    if (selectedSportCodes.includes('CRICKET') && linkCandidates.length && !skipLegacyLink) {
      return setAccountError('Choose the matching AuctionYodha player or select “None of these” first.');
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
      const requestedSport = selectedSportCodes.find(code => {
        const home = sportHome(code);
        return home && (returnTo === home || returnTo === `${home}/match/new`);
      });
      if (returnTo && requestedSport) router.replace(returnTo as Href);
      else if (router.canGoBack()) router.back();
      else router.replace('/apps');
    } catch (cause) {
      setAccountError(authErrorMessage(cause, 'Could not update your account. Please try again.'));
    } finally { setSaving(false); }
  };

  const clearDeviceData = async () => {
    if (destructiveBusy.current) return;
    destructiveBusy.current = true;
    setDestructiveAction('clear');
    setAccountError(undefined);
    try {
      await auth.clearDeviceData();
      setDataReview(undefined);
      setDataReceipt('Device data cleared. Your account and cloud records are unchanged.');
    } catch (cause) { setAccountError(authErrorMessage(cause, 'Could not clear device data. Please try again.')); }
    finally { destructiveBusy.current = false; setDestructiveAction(undefined); }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE' || destructiveBusy.current) return;
    destructiveBusy.current = true;
    setAccountError(undefined);
    setDestructiveAction('delete');
    try {
      await auth.deleteAccount(deleteConfirmation);
      router.replace('/auth');
    } catch (cause) {
      setAccountError(authErrorMessage(cause, 'Could not delete account. Please try again.'));
    } finally { destructiveBusy.current = false; setDestructiveAction(undefined); }
  };

  if (section === 'data' && dataReview) return <StagePage focused title={dataReview === 'delete' ? 'Delete account' : 'Clear device data'} eyebrow="ACCOUNT" footer={<StageButton danger={dataReview === 'delete'} title={dataReview === 'delete' ? 'Permanently delete account' : 'Confirm clear device data'} loading={Boolean(destructiveAction)} disabled={saving || (dataReview === 'delete' && deleteConfirmation !== 'DELETE')} onPress={() => void (dataReview === 'delete' ? deleteAccount() : clearDeviceData())} />} onBack={() => { if (!destructiveBusy.current) { setDataReview(undefined); setAccountError(undefined); setDeleteConfirmation(''); } }}>
    <StageIntro eyebrow="REVIEW BEFORE CONTINUING" title={dataReview === 'delete' ? 'Delete your account?' : 'Clear this device?'} description={dataReview === 'delete' ? 'This permanently removes your login and account-owned records. It cannot be undone.' : 'This removes downloaded matches, tournaments and offline scoring data. Your account and cloud records are kept.'} />
    <StageNotice danger={dataReview === 'delete'}>{dataReview === 'delete' ? 'Review this carefully. Historical account-owned tournaments, matches and profiles will be removed.' : 'Sync queued scoring before clearing this device. Any remaining unsynced local data will be lost.'}</StageNotice>
    {accountError ? <StageNotice>{accountError}</StageNotice> : null}
    {dataReview === 'delete' ? <StageField label="Type DELETE to confirm" value={deleteConfirmation} onChangeText={setDeleteConfirmation} autoCapitalize="characters" autoCorrect={false} /> : null}

    <StageButton title="Keep my data" disabled={Boolean(destructiveAction)} onPress={() => { setDataReview(undefined); setAccountError(undefined); setDeleteConfirmation(''); }} />
  </StagePage>;

  if (!editor) return <StagePage focused title="Account & privacy">
    <StageIntro eyebrow="YOUR ACCOUNT" title="You’re in control." description="Keep your account details separate from your public playing record." />
    {accountError ? <StageNotice retry={() => setLoadAttempt(value => value + 1)}>{accountError}</StageNotice> : null}
    <StageList>
      <StageRow symbol={initials(auth.profile?.displayName ?? '')} title="Edit identity" detail="Display name and private contact details" onPress={() => router.push('/account?section=identity')} />
      <StageRow symbol="+" title="Connected sports" detail={auth.profile?.connectedSports.filter(sport => sport.accessStatus !== 'SUSPENDED').map(sport => sport.name).join(' · ') || 'Choose the sports you play'} onPress={() => router.push('/account?section=sports')} />
      <StageRow symbol="↗" title="Password & security" detail="Change your sign-in password" onPress={() => router.push('/change-password')} />
      <StageRow symbol="↗" title="Link a cricket record" detail="Review your historical player identity" onPress={() => router.push('/account?section=cricket')} />
      <StageRow symbol="↗" title="Connected apps" detail="AuctionYodha player connections" onPress={() => router.push('/account?section=apps')} />
      <StageRow symbol="≡" title="Account data" detail="Device storage and account deletion" onPress={() => router.push('/account?section=data')} />
    </StageList>
    <StageButton title="Sign out" loading={saving} onPress={() => { setSaving(true); void auth.signOutCurrentDevice().then(() => router.replace('/live')).catch(cause => setAccountError(authErrorMessage(cause, 'Could not sign out.'))).finally(() => setSaving(false)); }} />
  </StagePage>;

  return <StagePage focused title={section === 'identity' ? 'Edit identity' : section === 'sports' ? 'Your sports' : section === 'data' ? 'Account data' : section === 'apps' ? 'Connected apps' : section === 'playing' ? 'Cricket profile' : 'Link playing history'} footer={section !== 'data' && section !== 'apps' && section !== 'cricket' ? <StageButton primary title="Save changes" onPress={() => void save()} loading={saving} disabled={!loaded || loadFailed} /> : undefined}>
    {accountError ? <StageNotice retry={() => setLoadAttempt(value => value + 1)}>{accountError}</StageNotice> : null}
    {!loaded ? <StageNotice>Loading your account…</StageNotice> : null}
    {section === 'sports' ? <StageIntro eyebrow="MAKE IT YOURS" title="What do you play?" description="Choose your sports. You can change these from your profile anytime." /> : null}
    {section === 'apps' ? <><StageIntro eyebrow="CONNECTED APPS" title="Your player connections." description="AuctionYodha records are linked only after your identity is verified." /><StageList><StageRow symbol="AY" title="AuctionYodha" detail="Review your historical cricket player record" onPress={() => router.push('/account?section=cricket')} /></StageList><StageNotice>Linking a player record connects your identity. It does not enter you in an auction or send an invitation.</StageNotice></> : null}
    {requestedSport ? <View style={styles.section}><StageText variant="rowTitle">Connect {requestedSport.name} to continue</StageText><StageText variant="small" muted>Choose {requestedSport.name} below and save. You will return to your selected {returnTo?.endsWith('/match/new') ? 'match setup' : 'sport'}.</StageText></View> : null}
    {section === 'sports' && selectedSportCodes.includes('CRICKET') && (linkCandidates.length > 0 || claimPending) ? <View style={styles.section}>
      <StageText variant="eyebrow" muted>PREVIOUS PLAYER RECORD</StageText>
      {claimPending ? <View style={styles.linkNotice}>
        <MaterialCommunityIcons name="clock-check-outline" size={24} color={colors.accent} />
        <View style={{ flex: 1 }}><StageText variant="rowTitle">Verification pending</StageText><StageText variant="small" muted>Your SportStage account remains usable while support verifies the historical profile.</StageText></View>
      </View> : <>
        <StageText variant="small" muted>We found AuctionYodha players with the same name. Name alone is not enough to connect automatically.</StageText>
        {linkCandidates.map(candidate => <View key={candidate.playerId} style={styles.candidate}>
          <View style={{ flex: 1 }}><StageText variant="rowTitle">{candidate.displayName}</StageText><StageText variant="small" muted>AuctionYodha player</StageText></View>
          <Button title="This is me" variant="secondary" onPress={() => void requestLink(candidate)} disabled={saving} />
        </View>)}
        <Button title="None of these" variant="ghost" onPress={() => { setSkipLegacyLink(true); setLinkCandidates([]); }} disabled={saving} fullWidth />
      </>}
    </View> : null}
    {section === 'identity' ? <View style={styles.section}>
      <StageIntro eyebrow="PUBLIC & PRIVATE" title="Your identity." description="Your display name and photo identify you to players. Email and mobile are private account details." />
      <View style={styles.avatarRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? 'Change profile image' : 'Add profile image'}
          disabled={uploadingAvatar}
          onPress={() => void chooseAvatar()}
          style={styles.avatar}
        >
          {avatarUrl
            ? <Image accessible={false} source={{ uri: avatarUrl }} style={styles.avatarImage} />
            : <StageText variant="heading" >{initials(displayName)}</StageText>}
          <View style={styles.avatarEdit}>
            <MaterialCommunityIcons name={uploadingAvatar ? 'progress-clock' : 'camera'} size={16} color={colors.accentInk} />
          </View>
        </Pressable>
        <Button
          title={avatarUrl ? 'Change photo' : 'Add photo'}
          variant="secondary"
          onPress={() => void chooseAvatar()}
          loading={uploadingAvatar}
        />
      </View>
      <StageField label="Display name · public" accessibilityLabel="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Display name" />
      <StageField label="Email address · private" accessibilityLabel="Email address" value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <StageText variant="small" muted style={styles.mobileLabel}>Mobile number</StageText>
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
      <StageText variant="small" muted>Include the country code. This is contact information and is not used to sign in.</StageText>
      {phoneError ? <StageText variant="small" style={{ color: colors.danger }}>{phoneError}</StageText> : null}
      {selectedSportCodes.includes('CRICKET') ? <StageButton title="Cricket playing details" onPress={() => router.push('/account?section=playing')} /> : null}
    </View> : null}
    {section === 'playing' && selectedSportCodes.includes('CRICKET') ? <View style={styles.section}>
      <StageText variant="eyebrow" muted>CRICKET PROFILE</StageText>
      <StageText variant="small" muted>This is the profile teammates see and the identity used for your career statistics.</StageText>
      <View style={styles.optionGrid}>
        {cricketRoles.map(item => <Pressable key={item.value} onPress={() => setRole(item.value)} style={[styles.roleOption, role === item.value && styles.selected]}>
          <StageText variant="small" style={role === item.value ? styles.selectedText : undefined}>{item.label}</StageText>
        </Pressable>)}
      </View>
      <View style={styles.optionGrid}>
        {['Right-handed', 'Left-handed'].map(hand => <Pressable key={hand} onPress={() => setBattingHand(hand)} style={[styles.roleOption, battingHand === hand && styles.selected]}>
          <StageText variant="small" style={battingHand === hand ? styles.selectedText : undefined}>{hand}</StageText>
        </Pressable>)}
      </View>
      <TextInput value={bowlingStyle} onChangeText={setBowlingStyle} placeholder="Bowling style (optional)" placeholderTextColor={colors.textDim} style={styles.input} />
    </View> : null}
    {section === 'sports' ? <View style={styles.section}>
      <StageText variant="eyebrow" muted>YOUR SPORTS</StageText>
      <StageText variant="small" muted>Select every sport you follow or play. Your primary sport controls the default SportStage experience.</StageText>
      <StageSportPreferences sports={sports} selectedCodes={selectedSportCodes} primaryCode={primarySportCode} onToggle={code => toggleSport(code, selectedSportCodes, primarySportCode, setSelectedSportCodes, setPrimarySportCode)} onPrimary={setPrimarySportCode} />
    </View> : null}
    {section === 'cricket' && selectedSportCodes.includes('CRICKET') ? <StageLegacyRecord /> : null}
    {section === 'cricket' && !selectedSportCodes.includes('CRICKET') ? <StageNotice>Connect Cricket in Your sports before creating or linking a cricket record.</StageNotice> : null}
    {dataReceipt && section === 'data' ? <StageNotice>{dataReceipt}</StageNotice> : null}
    {section === 'data' ? <StageIntro eyebrow="ACCOUNT DATA" title="Take a moment to review." description="Account deletion is different from signing out." /> : null}
    {section === 'data' ? <View style={styles.dangerSection}>
      <StageText variant="eyebrow" style={styles.dangerText}>DATA & ACCOUNT</StageText>
      <StageText variant="rowTitle">Clear data on this device</StageText>
      <StageText variant="small" muted>Removes downloaded and offline data while keeping your account and cloud records.</StageText>
      <StageButton title="Clear device data" onPress={() => { setAccountError(undefined); setDataReview('clear'); }} disabled={!loaded || loadFailed || saving || Boolean(destructiveAction)} />
      <View style={styles.dangerDivider} />
      <StageText variant="rowTitle" style={styles.dangerText}>Permanently delete account</StageText>
      <StageText variant="small" muted>Deletes your SportStage login, owned tournaments, matches, live scores, profile links and account data. This cannot be undone.</StageText>
      <StageButton danger title="Review account deletion" onPress={() => { setAccountError(undefined); setDeleteConfirmation(''); setDataReview('delete'); }} disabled={!loaded || loadFailed || saving || Boolean(destructiveAction)} />
    </View> : null}
  </StagePage>;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.xl },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  avatar: { width: 70, height: 70, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted, borderWidth: 1, borderColor: colors.accent },
  avatarImage: { width: '100%', height: '100%', borderRadius: 39 },
  avatarEdit: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#111b13', color: colors.text, paddingHorizontal: 12, fontSize: 13, fontFamily: fonts.body },
  inputInvalid: { borderColor: colors.danger },
  mobileLabel: { marginTop: spacing.xs },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedText: { color: colors.accentInk },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roleOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
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

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'P';
}
