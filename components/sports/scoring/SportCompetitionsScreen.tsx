import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import type { Href } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAuth } from '@/components/providers/AuthProvider';
import { AppHeader } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SportStageLoader } from '@/components/ui/SportStageLoader';
import { Text } from '@/components/ui/Text';
import { useSportFeatureFlag } from '@/hooks/useSportFeatureFlag';
import { getGooglePlace, searchGooglePlaces, type GooglePlaceDetails, type GooglePlaceSuggestion } from '@/lib/maps/googlePlaces';
import { SPORT_CONFIGS, SPORT_PRESENTATION, defaultSportRules, type MatchOptions, type ScoringSportId } from '@/lib/sports/scoring';
import { sportCompetitionApi, type CloudCompetition, type CloudCompetitionInvitation, type CloudCompetitionKind } from '@/lib/supabase/sportCompetitionApi';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';
import { SportAvatarButton } from './SportProfileDrawer';
import { SportCloudCompetitionUnavailable } from './SportCloudCompetitionUnavailable';
import { SportMatchRulesEditor } from './SportMatchRulesEditor';

export function SportCompetitionsScreen({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const cloudCompetitions = useSportFeatureFlag(
    'cloud_competitions',
    presentation.catalogCode,
    auth.session?.user.id,
  );
  const [competitions, setCompetitions] = useState<readonly CloudCompetition[]>([]);
  const [invitations, setInvitations] = useState<readonly CloudCompetitionInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CloudCompetitionKind>('TOURNAMENT');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');
  const [rules, setRules] = useState<MatchOptions>(() => defaultSportRules(sportId));
  const [description, setDescription] = useState('');
  const [organizerPhone, setOrganizerPhone] = useState('');
  const [socialMediaUrl, setSocialMediaUrl] = useState('');
  const [plannedEntryCount, setPlannedEntryCount] = useState('8');
  const [venueQuery, setVenueQuery] = useState('');
  const [venueSuggestions, setVenueSuggestions] = useState<GooglePlaceSuggestion[]>([]);
  const [venuePlace, setVenuePlace] = useState<GooglePlaceDetails>();
  const [logoUri, setLogoUri] = useState<string>();
  const [bannerUri, setBannerUri] = useState<string>();
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    if (!cloudCompetitions.enabled) {
      setCompetitions([]);
      setInvitations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const [competitionResult, invitationResult] = await Promise.allSettled([
        sportCompetitionApi.list(presentation.catalogCode),
        sportCompetitionApi.listInvitations(presentation.catalogCode),
      ]);
      if (competitionResult.status === 'rejected') throw competitionResult.reason;
      setCompetitions(competitionResult.value);
      setInvitations(invitationResult.status === 'fulfilled' ? invitationResult.value : []);
    })()
      .catch((cause) => Alert.alert('Could not load competitions', message(cause)))
      .finally(() => setLoading(false));
  }, [cloudCompetitions.enabled, presentation.catalogCode]);
  useFocusEffect(reload);

  React.useEffect(() => {
    if (!createOpen || venuePlace || venueQuery.trim().length < 3) { setVenueSuggestions([]); return; }
    const timer = setTimeout(() => void searchGooglePlaces(venueQuery).then(setVenueSuggestions).catch(() => setVenueSuggestions([])), 350);
    return () => clearTimeout(timer);
  }, [createOpen, venuePlace, venueQuery]);

  const pickMedia = async (mediaKind: 'logo' | 'banner') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Photos permission needed', 'Allow photo access to select competition media.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: mediaKind === 'banner' ? [16, 9] : [1, 1], quality: 0.8 });
    if (!result.canceled) {
      if (mediaKind === 'logo') setLogoUri(result.assets[0]?.uri);
      else setBannerUri(result.assets[0]?.uri);
    }
  };

  const selectVenue = async (suggestion: GooglePlaceSuggestion) => {
    try {
      const place = await getGooglePlace(suggestion.placeId);
      setVenuePlace(place); setVenueQuery(place.address); setVenueSuggestions([]);
    } catch (cause) { Alert.alert('Could not select venue', message(cause)); }
  };

  const create = async () => {
    if (!name.trim() || saving) return;
    const creatorAccountId = auth.session?.user.id;
    if (!creatorAccountId) {
      Alert.alert('Sign in required', 'Sign in to create a competition.');
      return;
    }
    const planned = Number(plannedEntryCount);
    if (!Number.isInteger(planned) || planned < 2 || planned > 256) { Alert.alert('Invalid participant count', 'Choose between 2 and 256 participants.'); return; }
    if (organizerPhone.trim() && organizerPhone.replace(/\D/g, '').length < 7) { Alert.alert('Invalid organizer number', 'Enter a valid phone number.'); return; }
    if (socialMediaUrl.trim() && !/^https?:\/\/\S+$/i.test(socialMediaUrl.trim())) { Alert.alert('Invalid social link', 'Use a complete http:// or https:// link.'); return; }
    if (venueQuery.trim() && !venuePlace) { Alert.alert('Select the venue', 'Choose a venue from the Google Maps suggestions.'); return; }
    setSaving(true);
    try {
      const competitionId = await sportCompetitionApi.create({
        sportCode: presentation.catalogCode, name, kind,
        visibility, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        rules,
        description, organizerPhone, socialMediaUrl, plannedEntryCount: planned,
      });
      const setupWarnings: string[] = [];
      if (venuePlace) try {
        const venueId = await sportCompetitionApi.addVenue(competitionId, venuePlace.name, venuePlace.address);
        await sportCompetitionApi.setVenuePlace(venueId, venuePlace);
      } catch { setupWarnings.push('venue'); }
      for (const [mediaKind, localUri] of [['logo', logoUri], ['banner', bannerUri]] as const) {
        if (localUri) try {
          await sportCompetitionApi.uploadMedia({ competitionId, ownerId: creatorAccountId, localUri, kind: mediaKind });
        } catch { setupWarnings.push(mediaKind); }
      }
      setName('');
      setDescription(''); setOrganizerPhone(''); setSocialMediaUrl(''); setPlannedEntryCount('8');
      setVenueQuery(''); setVenuePlace(undefined); setVenueSuggestions([]); setLogoUri(undefined); setBannerUri(undefined);
      setCreateOpen(false);
      reload();
      router.push(`/${presentation.routeSegment}/competition/${competitionId}` as Href);
      if (setupWarnings.length) Alert.alert('Competition created', `The ${setupWarnings.join(' and ')} could not be attached. You can add it from competition settings.`);
    } catch (cause) {
      Alert.alert('Could not create competition', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const respondInvitation = (invitation: CloudCompetitionInvitation, accept: boolean) => {
    if (saving) return;
    setSaving(true);
    void sportCompetitionApi.respondOrganizer(invitation.accessId, accept)
      .then((competitionId) => { reload(); if (accept) router.push(`/${presentation.routeSegment}/competition/${competitionId}` as Href); })
      .catch((cause) => Alert.alert('Could not respond', message(cause)))
      .finally(() => setSaving(false));
  };

  if (cloudCompetitions.loading || !cloudCompetitions.enabled) {
    return <SportCloudCompetitionUnavailable loading={cloudCompetitions.loading} sportId={sportId} />;
  }

  return (
    <Screen scroll padded={false}>
      <AppHeader
        title="Competitions"
        eyebrow={config.name.toUpperCase()}
        right={<View style={styles.headerActions}><Pressable accessibilityLabel="Create competition" onPress={() => setCreateOpen(true)} style={[styles.headerAction, { borderColor: presentation.accent }]}><MaterialCommunityIcons name="plus" size={23} color={presentation.accent} /></Pressable><SportAvatarButton /></View>}
      />
      <View style={styles.content}>
        {invitations.length ? <View style={styles.invitationStack}><Text variant="overline" style={{ color: presentation.accent }}>ORGANIZER INVITATIONS · {invitations.length}</Text>{invitations.map((invitation) => <View key={invitation.accessId} style={styles.competition}><View style={styles.flex}><Text variant="bodyStrong">{invitation.competitionName}</Text><Text variant="caption" tone="muted">{invitation.kind} · ORGANIZER</Text></View><Pressable disabled={saving} onPress={() => respondInvitation(invitation, false)}><Text variant="overline" tone="danger">DECLINE</Text></Pressable><Pressable disabled={saving} onPress={() => respondInvitation(invitation, true)}><Text variant="overline" style={{ color: presentation.accent }}>ACCEPT</Text></Pressable></View>)}</View> : null}
        <View style={styles.summary}>
          <SummaryValue value={competitions.filter((item) => item.kind === 'TOURNAMENT').length} label="TOURNAMENTS" />
          <SummaryValue value={competitions.filter((item) => item.kind === 'LEAGUE').length} label="LEAGUES" />
          <SummaryValue value={competitions.filter((item) => item.lifecycle === 'LIVE').length} label="LIVE" />
        </View>
        <Button title="Create tournament or league" fullWidth onPress={() => setCreateOpen(true)} style={{ backgroundColor: presentation.accent }} />

        {loading ? <SportStageLoader variant="compact" message={`Loading ${config.name} competitions`} detail="" accent={presentation.accent} /> : competitions.length ? competitions.map((competition) => {
          const canManage = competition.ownerAccountId === auth.session?.user.id;
          return (
            <Pressable
              key={competition.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${competition.name}`}
              onPress={() => router.push(`/${presentation.routeSegment}/competition/${competition.id}` as Href)}
              style={({ pressed }) => [styles.competition, pressed && styles.pressed]}
            >
              <View style={[styles.kindIcon, { backgroundColor: `${presentation.accent}16` }]}>
                <MaterialCommunityIcons name={competition.kind === 'LEAGUE' ? 'table-large' : 'tournament'} size={23} color={presentation.accent} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>{competition.name}</Text>
                <Text variant="caption" tone="dim">{competition.kind} · {competition.lifecycle.replaceAll('_', ' ')}</Text>
                <Text variant="caption" tone="muted">{canManage ? 'OWNED BY YOU' : 'PARTICIPATING OR ORGANIZING'}</Text>
              </View>
              <View style={[styles.playButton, { backgroundColor: presentation.accent }]}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accentInk} />
              </View>
            </Pressable>
          );
        }) : (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="trophy-outline" size={32} color={colors.textDim} />
            <Text variant="bodyStrong">No competitions yet</Text>
            <Text variant="caption" tone="muted" style={styles.emptyCopy}>Create a tournament or league, add entrants, then schedule each match manually.</Text>
          </View>
        )}
      </View>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <View><Text variant="overline" tone="dim">{config.name}</Text><Text variant="h2">New competition</Text></View>
              <Pressable accessibilityLabel="Close" onPress={() => setCreateOpen(false)} style={styles.close}><MaterialCommunityIcons name="close" size={21} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.mediaRow}><MediaChoice label="LOGO" uri={logoUri} square onPress={() => void pickMedia('logo')} /><MediaChoice label="16:9 BANNER" uri={bannerUri} onPress={() => void pickMedia('banner')} /></View>
            <TextInput value={name} onChangeText={setName} autoFocus maxLength={60} placeholder="Competition name" placeholderTextColor={colors.textDim} style={styles.input} />
            <TextInput value={description} onChangeText={setDescription} multiline placeholder="Competition description" placeholderTextColor={colors.textDim} style={[styles.input, styles.multiline]} />
            <TextInput value={organizerPhone} onChangeText={setOrganizerPhone} keyboardType="phone-pad" placeholder="Organizer phone / WhatsApp" placeholderTextColor={colors.textDim} style={styles.input} />
            <TextInput value={plannedEntryCount} onChangeText={setPlannedEntryCount} keyboardType="number-pad" placeholder={kind === 'TOURNAMENT' ? 'Planned teams or clubs' : 'Planned players'} placeholderTextColor={colors.textDim} style={styles.input} />
            <View><TextInput value={venueQuery} onChangeText={(value) => { setVenueQuery(value); setVenuePlace(undefined); }} placeholder="Search primary venue on Google Maps" placeholderTextColor={colors.textDim} style={styles.input} />{venueSuggestions.map((suggestion) => <Pressable key={suggestion.placeId} onPress={() => void selectVenue(suggestion)} style={styles.venueSuggestion}><Text variant="caption">{suggestion.text}</Text></Pressable>)}{venuePlace ? <Text variant="caption" tone="accent">Google Maps venue selected</Text> : null}</View>
            <TextInput value={socialMediaUrl} onChangeText={setSocialMediaUrl} autoCapitalize="none" keyboardType="url" placeholder="Social media link (optional)" placeholderTextColor={colors.textDim} style={styles.input} />
            <View style={styles.kindSelector}>
              {(['TOURNAMENT', 'LEAGUE'] as const).map((value) => (
                <Pressable key={value} onPress={() => setKind(value)} style={[styles.kindOption, kind === value && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}16` }]}>
                  <Text variant="caption" style={kind === value ? { color: presentation.accent } : undefined}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.formatSection}><Text variant="overline" tone="dim">VISIBILITY</Text><View style={styles.kindSelector}>{(['PRIVATE', 'PUBLIC'] as const).map((value) => <Pressable key={value} onPress={() => setVisibility(value)} style={[styles.kindOption, visibility === value && { borderColor: presentation.accent, backgroundColor: `${presentation.accent}16` }]}><Text variant="caption" style={visibility === value ? { color: presentation.accent } : undefined}>{value}</Text></Pressable>)}</View></View>
            <View style={styles.participantNote}>
              <MaterialCommunityIcons name={kind === 'TOURNAMENT' ? 'account-group-outline' : 'account-outline'} size={20} color={presentation.accent} />
              <Text variant="caption" tone="muted" style={styles.flex}>
                {kind === 'TOURNAMENT'
                  ? 'Tournaments register teams. For every team tie, you choose how many singles and doubles matches will be played.'
                  : 'Leagues register individual players and use singles fixtures.'}
              </Text>
            </View>
            <SportMatchRulesEditor sportId={sportId} value={rules} onChange={setRules} accent={presentation.accent} />
            <Button title={`Create ${kind.toLowerCase()}`} loading={saving} disabled={!name.trim()} onPress={() => void create()} fullWidth style={{ backgroundColor: presentation.accent }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SummaryValue({ value, label }: { value: number; label: string }) {
  return <View style={styles.summaryValue}><Text variant="scoreMd">{value}</Text><Text variant="overline" tone="dim">{label}</Text></View>;
}

function MediaChoice({ label, uri, square, onPress }: { label: string; uri?: string; square?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.mediaChoice, square && styles.mediaSquare]}>{uri ? <Image source={{ uri }} style={styles.mediaImage} /> : <><MaterialCommunityIcons name="image-plus" size={24} color={colors.textDim} /><Text variant="overline" tone="dim">{label}</Text></>}</Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  invitationStack: { gap: spacing.sm },
  headerAction: { width: 40, height: 40, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summary: { paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' },
  summaryValue: { flex: 1, alignItems: 'center', gap: 3 },
  competition: { minHeight: 76, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: spacing.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  emptyCopy: { textAlign: 'center', lineHeight: 18 },
  overlay: { flex: 1, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center' },
  modalCard: { maxHeight: '92%', padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface, gap: spacing.md },
  modalContent: { gap: spacing.md, paddingBottom: spacing.xs },
  modalHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 38, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, color: colors.text, fontFamily: 'Inter_500Medium', fontSize: 16 },
  multiline: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: 'top' },
  mediaRow: { minHeight: 110, flexDirection: 'row', gap: spacing.sm },
  mediaChoice: { flex: 1, overflow: 'hidden', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  mediaSquare: { flex: 0, width: 110 },
  mediaImage: { width: '100%', height: '100%' },
  venueSuggestion: { padding: spacing.sm, borderWidth: 1, borderTopWidth: 0, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  kindSelector: { flexDirection: 'row', gap: spacing.sm },
  kindOption: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  formatSection: { gap: spacing.sm },
  participantNote: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.72 },
  flex: { flex: 1, minWidth: 0 },
});

function message(cause: unknown): string { return cause instanceof Error ? cause.message : 'Please try again.'; }
