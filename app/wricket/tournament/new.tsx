import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
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
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const FORMATS: MatchFormat[] = ['BOX', 'TURF', 'TURF_TEST', 'T20', 'T10', 'ODI'];

export default function NewTournamentScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<MatchFormat>('TURF');
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

  const selectFormat = (nextFormat: MatchFormat) => {
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
    if (!auth.session) {
      Alert.alert('Sign in required', 'Sign in before creating a tournament so you can become its organiser.');
      return;
    }
    const teams = Number(teamCount);
    const players = Number(playersPerTeam);
    const overs = Number(oversPerMatch);
    const link = socialMediaUrl.trim();
    if (name.trim().length < 2) {
      Alert.alert('Name needed', 'Give your tournament a name.');
      return;
    }
    if (!Number.isInteger(teams) || teams < 2 || teams > 64) {
      Alert.alert('Invalid team count', 'Choose between 2 and 64 teams.');
      return;
    }
    if (!Number.isInteger(players) || players < 2 || players > 25) {
      Alert.alert('Invalid squad size', 'Choose between 2 and 25 players per team.');
      return;
    }
    if (!Number.isInteger(overs) || overs < 1 || overs > 100) {
      Alert.alert('Invalid overs', 'Choose between 1 and 100 overs per match.');
      return;
    }
    if (organizerPhone.replace(/\D/g, '').length < 7) {
      Alert.alert('Contact number needed', 'Enter a valid organiser contact number.');
      return;
    }
    if (location.trim() && !googlePlaceId) {
      Alert.alert('Select the venue', 'Choose a location from the Google Maps suggestions.');
      return;
    }
    if (link && !/^https?:\/\/\S+$/i.test(link)) {
      Alert.alert('Invalid social link', 'Enter a full link beginning with http:// or https://.');
      return;
    }

    setSaving(true);
    try {
      const tournament = await createOnlineTournament({
        name: name.trim(),
        format,
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
      Alert.alert('Could not create tournament', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.form}>
        <View>
          <Text variant="overline" tone="muted">ORGANISER SETUP</Text>
          <Text variant="h1" style={{ marginTop: spacing.xs }}>Create tournament</Text>
        </View>

        <View>
          <Label>TOURNAMENT MEDIA (OPTIONAL)</Label>
          <View style={styles.mediaRow}>
            <MediaPicker title="Choose logo" uri={logoUri} kind="logo" onPress={() => pickImage('logo')} />
            <MediaPicker title="Choose 16:9 banner" uri={bannerUri} kind="banner" onPress={() => pickImage('banner')} />
          </View>
        </View>

        <Field label="TOURNAMENT NAME" value={name} onChangeText={setName} placeholder="Sunday League 2026" />
        <View>
          <Field
            label="LOCATION"
            value={location}
            onChangeText={value => {
              setLocation(value);
              setGooglePlaceId(undefined);
              setGoogleMapsUrl(undefined);
              setLatitude(undefined);
              setLongitude(undefined);
            }}
            placeholder="Search Google Maps, e.g. NM Turf"
          />
          {searchingPlaces && <Text variant="caption" tone="muted" style={styles.coordinates}>Searching Google Maps…</Text>}
          {placeSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              {placeSuggestions.map(suggestion => (
                <Pressable
                  key={suggestion.placeId}
                  style={styles.suggestion}
                  onPress={() => void selectPlace(suggestion)}
                >
                  <Text variant="bodyStrong">{suggestion.text}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {googlePlaceId && latitude != null && longitude != null && (
            <Text variant="caption" tone="muted" style={styles.coordinates}>
              Google Maps location selected
            </Text>
          )}
        </View>

        <View>
          <Label>SCHEDULE</Label>
          <View style={styles.row}>
            <View style={styles.flexField}>
              <Label>DATE</Label>
              <Button title={startAt.toLocaleDateString()} variant="secondary" onPress={() => setPickerMode('date')} fullWidth />
            </View>
            <View style={styles.flexField}>
              <Label>START TIME</Label>
              <Button title={startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} variant="secondary" onPress={() => setPickerMode('time')} fullWidth />
            </View>
          </View>
          {pickerMode && (
            <DateTimePicker
              value={startAt}
              mode={pickerMode}
              minimumDate={pickerMode === 'date' ? new Date() : undefined}
              onChange={onDateTimeChange}
            />
          )}
        </View>

        <View>
          <Label>FORMAT</Label>
          <View style={styles.formatGrid}>
            {FORMATS.map(item => (
              <Pressable
                key={item}
                onPress={() => selectFormat(item)}
                style={[styles.formatTile, format === item && styles.formatTileActive]}
              >
                <Text
                  variant="bodyStrong"
                  style={[styles.formatText, format === item && styles.activeText]}
                >
                  {FORMAT_LABEL[item]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Field label="NUMBER OF TEAMS" value={teamCount} onChangeText={setTeamCount} keyboardType="number-pad" containerStyle={styles.flexField} />
          <Field label="PLAYERS PER TEAM" value={playersPerTeam} onChangeText={setPlayersPerTeam} keyboardType="number-pad" containerStyle={styles.flexField} />
        </View>
        <Field label="OVERS PER MATCH" value={oversPerMatch} onChangeText={setOversPerMatch} keyboardType="number-pad" />

        <Field label="ORGANISER NUMBER" value={organizerPhone} onChangeText={setOrganizerPhone} keyboardType="phone-pad" placeholder="+91 98765 43210" />
        <Field label="DESCRIPTION" value={description} onChangeText={setDescription} placeholder="Tell players about the tournament…" multiline />
        <Field label="SOCIAL MEDIA LINK (OPTIONAL)" value={socialMediaUrl} onChangeText={setSocialMediaUrl} keyboardType="url" autoCapitalize="none" placeholder="https://instagram.com/…" />

        {!auth.session && (
          <Text variant="caption" style={{ color: colors.danger }}>
            Sign in from your profile before creating this tournament.
          </Text>
        )}
        <Button title="Create tournament" loading={saving} onPress={onCreate} fullWidth size="lg" />
      </View>
    </Screen>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text variant="caption" tone="muted" style={styles.label}>{children}</Text>;
}

function Field({
  label,
  containerStyle,
  multiline,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; containerStyle?: object }) {
  return (
    <View style={containerStyle}>
      <Label>{label}</Label>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.textDim}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function MediaPicker({
  title,
  uri,
  kind,
  onPress,
}: {
  title: string;
  uri?: string;
  kind: 'banner' | 'logo';
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.mediaPicker, kind === 'logo' && styles.logoPicker]}>
      {uri ? <Image source={{ uri }} style={styles.mediaImage} /> : <Text variant="bodyStrong" tone="muted">{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  label: { marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 16,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.md },
  flexField: { flex: 1 },
  coordinates: { marginTop: spacing.sm },
  suggestions: {
    marginTop: spacing.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  suggestion: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  formatTile: {
    width: '31%',
    minHeight: 72,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatTileActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  formatText: { textAlign: 'center', fontSize: 14 },
  activeText: { color: colors.accentInk },
  mediaRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  mediaPicker: {
    flex: 1,
    height: 110,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPicker: { flex: 0, width: 110, height: 110 },
  mediaImage: { width: '100%', height: '100%', resizeMode: 'cover' },
});
