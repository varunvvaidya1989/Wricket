import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/wricket/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/wricket/ui/Text';
import { createOnlineTournament } from '@/lib/wricket/data/cloudFirst';
import {
  getGooglePlace,
  GooglePlaceSuggestion,
  searchGooglePlaces,
} from '@/lib/maps/googlePlaces';
import {
  DEFAULT_RULES,
  FORMAT_LABEL,
  MatchFormat,
} from '@/lib/wricket/domain/types';
import { colors, fonts } from '@/lib/wricket/presentation/design';
import { WricketHeader } from '@/components/wricket/ui/WricketHeader';
import { Card } from '@/components/wricket/ui/Card';
import { DesignIcon } from '@/components/wricket/ui/DesignIcon';
import { StateNotice } from '@/components/wricket/ui/StateNotice';
import { TournamentEntryModePicker } from '@/components/wricket/tournament/TournamentEntryModePicker';
import type { TournamentEntryMode } from '@/lib/supabase/tournamentRegistrationApi';

const FORMATS: MatchFormat[] = ['BOX', 'TURF', 'TURF_TEST', 'T20', 'T10', 'ODI'];

export default function NewTournamentScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<MatchFormat>('TURF');
  const [entryMode, setEntryMode] = useState<TournamentEntryMode>('EXISTING_TEAMS');
  const [startAt, setStartAt] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setMinutes(0, 0, 0);
    return value;
  });
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [teamCount, setTeamCount] = useState('8');
  const [playersPerTeam, setPlayersPerTeam] = useState('11');
  const [oversPerMatch, setOversPerMatch] = useState('10');
  const [description, setDescription] = useState('');
  const [socialMediaUrl, setSocialMediaUrl] = useState('');
  const [organizerPhone, setOrganizerPhone] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState<number>();
  const [longitude, setLongitude] = useState<number>();
  const [googlePlaceId, setGooglePlaceId] = useState<string>();
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string>();
  const [placeSuggestions, setPlaceSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [bannerUri, setBannerUri] = useState<string>();
  const [logoUri, setLogoUri] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string>();
  const formRef = useRef<ScrollView>(null);
  const [showFormats, setShowFormats] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const oversLabel = format === 'TURF_TEST' ? 'Overs per innings' : 'Overs per match';
  useEffect(() => { if (error) formRef.current?.scrollToEnd({ animated: false }); }, [error]);

  const selectFormat = (nextFormat: MatchFormat) => {
    setError(undefined);
    setFormat(nextFormat);
    setPlayersPerTeam(String(DEFAULT_RULES[nextFormat].playersPerSide));
    setOversPerMatch(String(DEFAULT_RULES[nextFormat].oversPerInnings));
  };

  const pickImage = async (kind: 'banner' | 'logo') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to select tournament media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'banner' ? [16, 9] : [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      const uri = result.assets[0]?.uri;
      if (kind === 'banner') setBannerUri(uri);
      else setLogoUri(uri);
    }
  };

  const onDateTimeChange = (event: DateTimePickerEvent, value?: Date) => {
    setPickerMode(null);
    if (event.type === 'dismissed' || !value) return;
    setError(undefined);
    setStartAt(current => {
      const next = new Date(current);
      if (pickerMode === 'date') {
        next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      } else {
        next.setHours(value.getHours(), value.getMinutes(), 0, 0);
      }
      return next;
    });
  };

  useEffect(() => {
    if (googlePlaceId || location.trim().length < 3) {
      setPlaceSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearchingPlaces(true);
      searchGooglePlaces(location)
        .then(setPlaceSuggestions)
        .catch(() => setPlaceSuggestions([]))
        .finally(() => setSearchingPlaces(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [googlePlaceId, location]);

  const selectPlace = async (suggestion: GooglePlaceSuggestion) => {
    setSearchingPlaces(true);
    try {
      const place = await getGooglePlace(suggestion.placeId);
      setLocation(place.address);
      setLatitude(place.latitude);
      setLongitude(place.longitude);
      setGooglePlaceId(place.placeId);
      setGoogleMapsUrl(place.googleMapsUrl);
      setPlaceSuggestions([]);
    } catch (cause) {
      Alert.alert('Could not select location', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSearchingPlaces(false);
    }
  };

  const onCreate = async () => {
    if (savingRef.current) return;
    setError(undefined);
    if (!auth.session) {
      setError('Sign in before creating a tournament so you can become its organiser.');
      return;
    }
    const teams = Number(teamCount);
    const players = Number(playersPerTeam);
    const overs = Number(oversPerMatch);
    const link = socialMediaUrl.trim();
    if (name.trim().length < 2) {
      setError('Give your tournament a name.');
      return;
    }
    if (!Number.isInteger(teams) || teams < 2 || teams > 64) {
      setError('Choose between 2 and 64 teams.');
      return;
    }
    if (!Number.isInteger(players) || players < 2 || players > 25) {
      setError('Choose between 2 and 25 players per team.');
      return;
    }
    if (!Number.isInteger(overs) || overs < 1 || overs > 100) {
      setError(`Choose between 1 and 100 ${oversLabel.toLowerCase()}.`);
      return;
    }
    if (organizerPhone.replace(/\D/g, '').length < 7) {
      setError('Enter a valid organiser contact number.');
      return;
    }
    if (location.trim() && !googlePlaceId) {
      setError('Choose a location from the Google Maps suggestions.');
      return;
    }
    if (link && !/^https?:\/\/\S+$/i.test(link)) {
      setError('Enter a full link beginning with http:// or https://.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const tournament = await createOnlineTournament({
        name: name.trim(),
        format,
        entryMode,
        startDate: startAt.getTime(),
        organizerPhone: organizerPhone.trim(),
        location: location.trim() || undefined,
        latitude,
        longitude,
        googlePlaceId,
        googleMapsUrl,
        plannedTeamCount: teams,
        playersPerTeam: players,
        oversPerMatch: overs,
        description: description.trim() || undefined,
        socialMediaUrl: link || undefined,
        bannerLocalUri: bannerUri,
        logoLocalUri: logoUri,
      }, auth.session.user.id);
      router.replace({
        pathname: '/wricket/tournament/[id]',
        params: { id: tournament.id },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create tournament. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <Screen padded={false} edges={['left', 'right', 'bottom']}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WricketHeader title="New tournament" backTo="/wricket/my-wricket" />
      <ScrollView ref={formRef} testID="new-tournament-form" onContentSizeChange={() => { if (error) formRef.current?.scrollToEnd({ animated: false }); }} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View><Text variant="overline" tone="muted">BRING YOUR TEAMS TOGETHER</Text><Text variant="h1" style={{ marginTop: 8 }}>Set the stage.</Text></View>
        <Field onEdit={() => setError(undefined)} label="Tournament name" value={name} onChangeText={setName} editable={!saving} placeholder="Sunday League 2026" />
        <TournamentEntryModePicker value={entryMode} disabled={saving} onChange={mode => { setEntryMode(mode); setError(undefined); }} />
        <View style={styles.row}>
          <View style={styles.flexField}><Label>Format</Label><Pressable accessibilityRole="button" accessibilityLabel="Choose tournament format" accessibilityState={{ expanded: showFormats, disabled: saving }} disabled={saving} onPress={() => setShowFormats(true)} style={styles.select}><Text style={styles.fieldText}>{FORMAT_LABEL[format]}</Text><View style={{ transform: [{ rotate: '90deg' }] }}><DesignIcon name="arrow" size={15} /></View></Pressable></View>
          <View style={styles.flexField}><Label>Starts on</Label><ScheduleField mode="date" value={startAt} disabled={saving} onChange={value => { setError(undefined); setStartAt(value); }} onPress={() => setPickerMode('date')} /></View>
        </View>
        <View style={styles.row}>
          <Field onEdit={() => setError(undefined)} label="Planned teams" value={teamCount} onChangeText={setTeamCount} editable={!saving} keyboardType="number-pad" containerStyle={styles.flexField} />
          <Field onEdit={() => setError(undefined)} label="Squad size" value={playersPerTeam} onChangeText={setPlayersPerTeam} editable={!saving} keyboardType="number-pad" containerStyle={styles.flexField} />
        </View>
        <View style={styles.row}>
          <Field onEdit={() => setError(undefined)} label={oversLabel} value={oversPerMatch} onChangeText={setOversPerMatch} editable={!saving} keyboardType="number-pad" containerStyle={styles.flexField} />
          <View style={styles.flexField}><Label>Start time</Label><ScheduleField mode="time" value={startAt} disabled={saving} onChange={value => { setError(undefined); setStartAt(value); }} onPress={() => setPickerMode('time')} /></View>
        </View>
        {pickerMode && Platform.OS !== 'web' ? <DateTimePicker value={startAt} mode={pickerMode} minimumDate={pickerMode === 'date' ? new Date() : undefined} onChange={onDateTimeChange} /> : null}
        <Card style={styles.contactCard}><View style={styles.contactHeading}><DesignIcon name="lock" size={18} /><View style={styles.flexField}><Text variant="bodyStrong">Organiser contact</Text><Text variant="caption" tone="muted" style={{ fontSize: 10, marginTop: 4 }}>Used for tournament operations</Text></View><View style={styles.privateBadge}><Text variant="overline" tone="accent" style={{ fontSize: 8, letterSpacing: 0 }}>PRIVATE</Text></View></View>
          <TextInput accessibilityLabel="Organiser phone number" editable={!saving} value={organizerPhone} onChangeText={value => { setError(undefined); setOrganizerPhone(value); }} keyboardType="phone-pad" placeholder="Enter your contact number" placeholderTextColor={colors.textDim} style={styles.input} />
          <Text variant="caption" tone="muted" style={{ fontSize: 10 }}>Never shown on spectator pages or share images.</Text>
        </Card>
        <Pressable accessibilityRole="button" accessibilityLabel={showDetails ? 'Hide venue, artwork & details' : 'Add venue, artwork & details'} accessibilityState={{ expanded: showDetails, disabled: saving }} disabled={saving} onPress={() => setShowDetails(value => !value)} style={styles.detailsButton}><DesignIcon name={showDetails ? 'close' : 'plus'} size={17} /><Text variant="bodyStrong">{showDetails ? 'Hide venue, artwork & details' : 'Add venue, artwork & details'}</Text></Pressable>
        {showDetails ? <View style={styles.details}>
          <Text variant="overline" tone="muted">OPTIONAL DETAILS</Text>
          <View><Field onEdit={() => setError(undefined)} label="Location" value={location} editable={!saving} onChangeText={value => { setLocation(value); setGooglePlaceId(undefined); setGoogleMapsUrl(undefined); setLatitude(undefined); setLongitude(undefined); }} placeholder="Search Google Maps, e.g. NM Turf" />
            {searchingPlaces ? <Text variant="caption" tone="muted" style={styles.coordinates}>Searching Google Maps…</Text> : null}
            {placeSuggestions.length ? <View style={styles.suggestions}>{placeSuggestions.map(suggestion => <Pressable key={suggestion.placeId} accessibilityRole="button" disabled={saving} style={styles.suggestion} onPress={() => void selectPlace(suggestion)}><Text variant="bodyStrong">{suggestion.text}</Text></Pressable>)}</View> : null}
            {googlePlaceId && latitude != null && longitude != null ? <Text variant="caption" tone="muted" style={styles.coordinates}>Google Maps location selected</Text> : null}
          </View>
          <View><Label>Tournament artwork</Label><View style={styles.mediaRow}><MediaPicker title="Choose logo" uri={logoUri} kind="logo" disabled={saving} onPress={() => void pickImage('logo')} /><MediaPicker title="Choose 16:9 banner" uri={bannerUri} kind="banner" disabled={saving} onPress={() => void pickImage('banner')} /></View></View>
          <Field onEdit={() => setError(undefined)} label="Description" value={description} editable={!saving} onChangeText={setDescription} placeholder="Tell players about the tournament…" multiline />
          <Field onEdit={() => setError(undefined)} label="Social media link" value={socialMediaUrl} editable={!saving} onChangeText={setSocialMediaUrl} keyboardType="url" autoCapitalize="none" placeholder="https://instagram.com/…" />
        </View> : null}
        {error ? <StateNotice error title="Check your tournament details" detail={error} /> : null}
        {!auth.session ? <Text variant="caption" tone="danger">Sign in from your profile before creating this tournament.</Text> : null}
      </ScrollView>
      <View style={styles.footer}><Button title="Create tournament" loading={saving} onPress={() => void onCreate()} fullWidth /></View>
    </KeyboardAvoidingView>
    <Modal visible={showFormats} transparent animationType="fade" onRequestClose={() => setShowFormats(false)}>
      <View style={styles.overlay}><View accessibilityViewIsModal style={styles.formatSheet}><ScrollView contentContainerStyle={{ gap: 12 }}>
        <Text variant="overline" tone="muted">MATCH FORMAT</Text><Text variant="h2">Choose a format</Text>
        {FORMATS.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={FORMAT_LABEL[item]} aria-checked={format === item} accessibilityState={{ checked: format === item }} onPress={() => { selectFormat(item); setShowFormats(false); }} style={[styles.formatOption, format === item && styles.selectedOption]}><Text variant="bodyStrong" tone={format === item ? 'accent' : 'default'}>{FORMAT_LABEL[item]}</Text>{format === item ? <DesignIcon name="check" color={colors.accent} size={18} /> : null}</Pressable>)}
        <Button title="Keep current format" variant="ghost" onPress={() => setShowFormats(false)} />
      </ScrollView></View></View>
    </Modal>
  </Screen>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text variant="caption" tone="muted" style={styles.label}>{children}</Text>;
}
function Field({ label, containerStyle, multiline, onChangeText, onEdit, ...props }: React.ComponentProps<typeof TextInput> & { label: string; containerStyle?: object; onEdit: () => void }) {
  return <View style={containerStyle}><Label>{label}</Label><TextInput {...props} accessibilityLabel={label} onChangeText={value => { onEdit(); onChangeText?.(value); }} multiline={multiline} placeholderTextColor={colors.textDim} style={[styles.input, multiline && styles.multiline]} /></View>;
}
function ScheduleField({ mode, value, disabled, onChange, onPress }: { mode: 'date' | 'time'; value: Date; disabled: boolean; onChange: (value: Date) => void; onPress: () => void }) {
  const pad = (number: number) => String(number).padStart(2, '0');
  const dateValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (Platform.OS === 'web') return React.createElement('input', {
    type: mode, 'aria-label': mode === 'date' ? 'Starts on' : 'Start time',
    value: mode === 'date' ? dateValue(value) : `${pad(value.getHours())}:${pad(value.getMinutes())}`,
    min: mode === 'date' ? dateValue(new Date()) : undefined, disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const parts = event.target.value.split(mode === 'date' ? '-' : ':').map(Number);
      if (!event.target.value || parts.some(number => !Number.isFinite(number))) return;
      const next = new Date(value);
      if (mode === 'date') next.setFullYear(parts[0], parts[1] - 1, parts[2]);
      else next.setHours(parts[0], parts[1], 0, 0);
      if (!Number.isNaN(next.getTime())) onChange(next);
    },
    style: { width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box', background: '#101710', border: '1px solid #3a4a3b', borderRadius: 9, padding: '12px 11px', color: colors.text, fontFamily: fonts.body, fontSize: 12, colorScheme: 'dark' },
  });
  return <Pressable accessibilityRole="button" accessibilityLabel={mode === 'date' ? 'Starts on' : 'Start time'} disabled={disabled} onPress={onPress} style={styles.select}><Text style={[styles.fieldText, { flex: 1 }]}>{mode === 'date' ? value.toLocaleDateString() : value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text><DesignIcon name={mode === 'date' ? 'calendar' : 'clock'} size={16} /></Pressable>;
}
function MediaPicker({ title, uri, kind, disabled, onPress }: { title: string; uri?: string; kind: 'banner' | 'logo'; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[styles.mediaPicker, kind === 'logo' && styles.logoPicker]}>{uri ? <Image source={{ uri }} style={styles.mediaImage} /> : <><DesignIcon name="image" size={20} color={colors.textMuted} /><Text variant="caption" tone="muted">{title}</Text></>}</Pressable>;
}
const styles = StyleSheet.create({
  form: { gap: 18, paddingHorizontal: 18, paddingTop: 19, paddingBottom: 24 },
  label: { fontSize: 10, lineHeight: 14, marginBottom: 8 },
  input: { minHeight: 44, backgroundColor: '#101710', borderColor: '#3a4a3b', borderWidth: 1, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 11, color: colors.text, fontFamily: fonts.body, fontSize: 12 },
  fieldText: { fontFamily: fonts.body, fontSize: 12, flexShrink: 1 },
  select: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: '#3a4a3b', backgroundColor: '#101710' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  flexField: { flex: 1, minWidth: 0 },
  contactCard: { gap: 12, backgroundColor: colors.bg },
  contactHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  privateBadge: { borderWidth: 1, borderColor: '#465e38', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  detailsButton: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#3a4a3b', borderRadius: 9, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  details: { gap: 18 },
  coordinates: { marginTop: 8 },
  suggestions: { marginTop: 5, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface },
  suggestion: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border },
  mediaRow: { flexDirection: 'row', gap: 12 },
  mediaPicker: { flexGrow: 1, flexBasis: 0, minHeight: 80, overflow: 'hidden', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  logoPicker: { flexGrow: 0, flexShrink: 0, flexBasis: 90, width: 90 },
  mediaImage: { width: '100%', height: 80, resizeMode: 'cover' },
  footer: { borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16 },
  overlay: { flex: 1, backgroundColor: '#000000aa', padding: 18, alignItems: 'center', justifyContent: 'center' },
  formatSheet: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, maxWidth: 420, maxHeight: '85%', width: '100%' },
  formatOption: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedOption: { borderColor: '#465e38', backgroundColor: colors.accentMuted },
});
