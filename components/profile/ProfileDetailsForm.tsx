import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageSportPreferences } from '@/components/sports/platform/StageSportPreferences';
import { StageButton, StageField, StageIntro, StageNotice, StagePage, StageText } from '@/components/sports/platform/StageUI';
import { LocationChoiceField } from '@/components/profile/LocationChoiceField';
import { changeLocation, validateOnboardingDetails, type OnboardingDetails, type OnboardingErrors } from '@/lib/auth/onboardingDetails';
import { normalizeE164Phone } from '@/lib/auth/phone';
import { profileCities, profileCountries, profileStates, type LocationChoice } from '@/lib/profile/locations';
import { isSportReleased } from '@/lib/sports/platform/sportRelease';
import { accountDetailsApi } from '@/lib/supabase/accountDetailsApi';
import { saveCloudProfile } from '@/lib/supabase/profiles';
import { sportstageAccountApi, type SportOption } from '@/lib/supabase/sportstageAccountApi';

export function ProfileDetailsForm({ editing = false }: { editing?: boolean }) {
  const auth = useAuth();
  const router = useRouter();
  const metadata = auth.session?.user.user_metadata ?? {};
  const initialCode = String(auth.profile?.primarySport?.code ?? metadata.primary_sport_code ?? 'CRICKET');
  const primary = isSportReleased(initialCode) ? initialCode : 'CRICKET';
  const initialSports = Array.isArray(metadata.sport_codes) ? metadata.sport_codes.filter((code): code is string => typeof code === 'string' && isSportReleased(code)) : [];
  const [form, setForm] = useState<OnboardingDetails>({
    name: String(auth.profile?.displayName ?? metadata.display_name ?? ''),
    email: auth.session?.user.email ?? '',
    phone: auth.session?.user.phone ? `+${auth.session.user.phone.replace(/^\+/, '')}` : String(metadata.mobile_e164 ?? ''),
    age: '', country: '', state: '', city: '', sports: auth.profile?.connectedSports.length ? auth.profile.connectedSports.map(sport => sport.code) : initialSports.length ? initialSports : [primary], primarySport: primary,
  });
  const [sports, setSports] = useState<SportOption[]>([]);
  const [cities, setCities] = useState<LocationChoice[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [photo, setPhoto] = useState<string>();
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const pending = useRef(false);
  const uploadedPhoto = useRef<string | undefined>(undefined);
  const countries = useMemo(profileCountries, []);
  const states = useMemo(() => form.country ? profileStates(form.country) : [], [form.country]);

  useEffect(() => {
    let active = true;
    const accountId = auth.session?.user.id;
    if (!accountId) return;
    setLoading(true);
    void Promise.all([sportstageAccountApi.listSports(), accountDetailsApi.getMine(accountId)])
      .then(([options, details]) => {
        if (!active) return;
        setSports(options);
        setForm(current => ({ ...current,
          name: current.name || auth.profile?.displayName || String(metadata.display_name ?? ''),
          email: current.email || auth.session?.user.email || '',
          phone: current.phone || (auth.session?.user.phone ? `+${auth.session.user.phone.replace(/^\+/, '')}` : String(metadata.mobile_e164 ?? '')),
        }));
        if (details) setForm(current => ({ ...current, email: details.contact_email ?? current.email,
          phone: details.contact_phone ?? current.phone, age: details.age === null ? '' : String(details.age),
          country: details.country_code ?? '', state: details.state_name ?? '', city: details.city ?? '',
        }));
      }).catch(() => { if (active) setError('Could not load profile setup. Check your connection and reopen this page.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Prefill once per signed-in account without resetting edits on token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session?.user.id]);

  useEffect(() => {
    let active = true;
    setCities([]); setLocationError(undefined);
    if (!form.country || !form.state) { setCitiesLoading(false); return; }
    setCitiesLoading(true);
    void profileCities(form.country, form.state).then(rows => { if (active) setCities(rows); })
      .catch(() => { if (active) setLocationError('Could not load cities. Retry or leave the optional city blank.'); })
      .finally(() => { if (active) setCitiesLoading(false); });
    return () => { active = false; };
  }, [form.country, form.state, locationAttempt]);

  const patch = <K extends keyof OnboardingDetails>(key: K, value: OnboardingDetails[K]) => {
    setForm(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined })); setError(undefined);
  };
  const choosePhoto = async () => {
    if (choosingPhoto || pending.current) return;
    setChoosingPhoto(true); setError(undefined);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    } catch { setError('Could not choose a profile photo. You can continue without one.'); }
    finally { setChoosingPhoto(false); }
  };
  const complete = async () => {
    if (pending.current || !auth.session || loading) return;
    const validation = validateOnboardingDetails(form);
    if (form.country && !countries.some(item => item.value === form.country)) validation.country = 'Select a listed country.';
    if (form.state && !states.some(item => item.value === form.state)) validation.state = 'Select a state in your country.';
    if (form.city && !cities.some(item => item.value === form.city)) validation.city = 'Select a city in your state.';
    if (form.sports.some(code => !sports.some(sport => sport.code === code))) validation.sports = 'Select available sports.';
    setErrors(validation);
    if (Object.keys(validation).length) { setError('Check the highlighted fields.'); return; }
    pending.current = true; setSaving(true); setError(undefined);
    try {
      // Finish the optional upload before setting the atomic completion marker.
      if (photo && uploadedPhoto.current !== photo) {
        await saveCloudProfile(auth.session.user, form.name);
        await sportstageAccountApi.updateAvatar(auth.session.user.id, photo);
        uploadedPhoto.current = photo;
      }
      await accountDetailsApi.complete({ ...form, phone: normalizeE164Phone(form.phone)! });
      await auth.refreshProfile();
      if (editing) router.replace('/account');
    } catch { setError('Could not save your profile. Your details are still here; check your connection and try again.'); }
    finally { pending.current = false; setSaving(false); }
  };

  return <StagePage focused title={editing ? 'Personal details' : 'Complete your profile'} footer={<StageButton primary title={editing ? 'Save profile details' : 'Save & start playing'} loading={saving} disabled={loading || choosingPhoto || !sports.length || citiesLoading} onPress={() => void complete()} />}>
    <StageIntro eyebrow={editing ? 'YOUR PROFILE' : 'ONE-TIME SETUP'} title="Make SportStage yours." description={editing ? 'Update your details and sports. Contact details, age and location stay private.' : 'Complete your details, choose a primary sport and add any other sports you play. We will take you to your primary sport after saving.'} />
    <StageNotice>Name, phone, email and sport selection are required. Age, location and photo are optional.</StageNotice>
    <StageField label="Name · required" accessibilityLabel="Name" value={form.name} onChangeText={value => patch('name', value)} editable={!saving} maxLength={100} autoComplete="name" error={errors.name} />
    <StageField label="Contact phone · required" accessibilityLabel="Contact phone" value={form.phone} onChangeText={value => patch('phone', value)} editable={!saving} keyboardType="phone-pad" autoComplete="tel" placeholder="+91 98765 43210" maxLength={24} error={errors.phone} />
    <StageField label="Contact email · required" accessibilityLabel="Contact email" value={form.email} onChangeText={value => patch('email', value)} editable={!saving} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={254} error={errors.email} />
    <StageText variant="small" muted>Contact details are private. Saving them does not change your verified sign-in email or phone.</StageText>
    <StageField label="Age · optional" accessibilityLabel="Age" value={form.age} onChangeText={value => patch('age', value)} editable={!saving} keyboardType="number-pad" maxLength={3} error={errors.age} />
    <StageText variant="eyebrow" muted>YOUR LOCATION · OPTIONAL</StageText>
    <LocationChoiceField label="Country" value={form.country} choices={countries} disabled={saving} onChange={value => { setForm(current => ({ ...current, ...changeLocation(current, 'country', value) })); setErrors(current => ({ ...current, country: undefined, state: undefined, city: undefined })); }} />
    <LocationChoiceField label="State" value={form.state} choices={states} disabled={saving || !form.country || !states.length} hint={!form.country ? 'Choose a country first' : !states.length ? 'No states listed' : undefined} onChange={value => { setForm(current => ({ ...current, ...changeLocation(current, 'state', value) })); setErrors(current => ({ ...current, state: undefined, city: undefined })); }} />
    <LocationChoiceField label="City" value={form.city} choices={cities} disabled={saving || !form.state || citiesLoading || !cities.length} hint={citiesLoading ? 'Loading cities…' : !form.state ? 'Choose a state first' : !cities.length ? 'No cities listed' : undefined} onChange={value => patch('city', value)} />
    {errors.country || errors.state || errors.city ? <StageNotice danger>{errors.country ?? errors.state ?? errors.city}</StageNotice> : null}
    {locationError ? <StageNotice retry={() => setLocationAttempt(value => value + 1)}>{locationError}</StageNotice> : null}
    <StageText variant="eyebrow" muted>YOUR SPORTS · REQUIRED</StageText>
    {loading ? <StageNotice>Loading your profile…</StageNotice> : null}
    <StageSportPreferences disabled={saving} sports={sports} selectedCodes={form.sports} primaryCode={form.primarySport} onToggle={code => {
      const selected = form.sports.includes(code) ? form.sports.filter(item => item !== code) : [...form.sports, code];
      setForm(current => ({ ...current, sports: selected, primarySport: selected.includes(current.primarySport) ? current.primarySport : selected[0] ?? '' }));
      setErrors(current => ({ ...current, sports: undefined }));
    }} onPrimary={value => patch('primarySport', value)} />
    {errors.sports ? <StageNotice danger>{errors.sports}</StageNotice> : null}
    <View style={{ gap: 12 }}><StageText variant="eyebrow" muted>PROFILE PHOTO · OPTIONAL</StageText>
      {photo || auth.profile?.avatarUrl ? <Image accessibilityLabel="Profile photo preview" source={{ uri: photo ?? auth.profile!.avatarUrl! }} style={{ width: 88, height: 88, borderRadius: 44 }} /> : null}
      <StageButton title={photo ? 'Change profile photo' : 'Choose profile photo'} loading={choosingPhoto} disabled={saving} onPress={() => void choosePhoto()} />
      {photo && uploadedPhoto.current !== photo ? <StageButton title="Remove selected photo" disabled={saving} onPress={() => setPhoto(undefined)} /> : null}
    </View>
    {error ? <StageNotice danger>{error}</StageNotice> : null}
    <StageButton title="Sign out" disabled={saving || choosingPhoto} onPress={() => void auth.signOutCurrentDevice().catch(() => setError('Could not sign out. Try again.'))} />
  </StagePage>;
}
