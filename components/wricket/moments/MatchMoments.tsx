import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import {
  MatchMoment,
  matchMomentsApi,
  MomentImageInput,
  MomentMatchOption,
  MomentReactionType,
} from '@/lib/supabase/matchMomentsApi';
import { colors, palette } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

export function MatchMoments({
  cloudTournamentId,
  profileId,
  canModerate,
}: {
  cloudTournamentId?: string;
  profileId?: string;
  canModerate: boolean;
}) {
  const [moments, setMoments] = useState<MatchMoment[]>([]);
  const [matches, setMatches] = useState<MomentMatchOption[]>([]);
  const [caption, setCaption] = useState('');
  const [image, setImage] = useState<MomentImageInput>();
  const [selectedMatchId, setSelectedMatchId] = useState<string>();
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState<Set<string>>(new Set());
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(Boolean(cloudTournamentId));
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!cloudTournamentId) return;
    try {
      const [nextMoments, nextMatches] = await Promise.all([
        matchMomentsApi.list(cloudTournamentId, profileId),
        matchMomentsApi.listMatchOptions(cloudTournamentId),
      ]);
      setMoments(nextMoments);
      setMatches(nextMatches);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Match Moments.');
    } finally {
      setLoading(false);
    }
  }, [cloudTournamentId, profileId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => cloudTournamentId
    ? matchMomentsApi.subscribe(cloudTournamentId, () => { void load(); })
    : undefined, [cloudTournamentId, load]);

  const selectedMatch = useMemo(
    () => matches.find(match => match.id === selectedMatchId),
    [matches, selectedMatchId],
  );

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to capture a match moment.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      Alert.alert('Photo too large', 'Choose a photo smaller than 8 MB.');
      return;
    }
    setImage({
      uri: asset.uri,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
    });
  };

  const publish = async () => {
    if (!cloudTournamentId || !profileId) {
      Alert.alert('Sign in required', 'Sign in to share a Match Moment.');
      return;
    }
    setPosting(true);
    try {
      await matchMomentsApi.create({
        tournamentId: cloudTournamentId,
        matchId: selectedMatchId,
        authorId: profileId,
        caption,
        image,
      });
      setCaption('');
      setImage(undefined);
      setSelectedMatchId(undefined);
      await load();
    } catch (cause) {
      Alert.alert('Could not publish moment', messageOf(cause));
    } finally {
      setPosting(false);
    }
  };

  const react = async (moment: MatchMoment, reaction: MomentReactionType) => {
    if (!profileId) return Alert.alert('Sign in required', 'Sign in to react to a moment.');
    const active = moment.myReactions.includes(reaction);
    setMoments(current => current.map(item => item.id !== moment.id ? item : ({
      ...item,
      reactions: { ...item.reactions, [reaction]: Math.max(0, item.reactions[reaction] + (active ? -1 : 1)) },
      myReactions: active
        ? item.myReactions.filter(value => value !== reaction)
        : [...item.myReactions, reaction],
    })));
    try {
      await matchMomentsApi.toggleReaction({
        tournamentId: moment.tournamentId,
        momentId: moment.id,
        profileId,
        reaction,
        active,
      });
    } catch (cause) {
      await load();
      Alert.alert('Could not update reaction', messageOf(cause));
    }
  };

  const addComment = async (moment: MatchMoment) => {
    if (!profileId) return Alert.alert('Sign in required', 'Sign in to join the discussion.');
    const body = commentDrafts[moment.id]?.trim();
    if (!body) return;
    try {
      await matchMomentsApi.addComment({
        tournamentId: moment.tournamentId,
        momentId: moment.id,
        authorId: profileId,
        body,
      });
      setCommentDrafts(current => ({ ...current, [moment.id]: '' }));
      await load();
    } catch (cause) {
      Alert.alert('Could not add comment', messageOf(cause));
    }
  };

  const remove = (moment: MatchMoment) => {
    Alert.alert('Remove this moment?', 'Its discussion will no longer be visible.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => matchMomentsApi.remove(moment.id).then(load)
          .catch(cause => Alert.alert('Could not remove moment', messageOf(cause))),
      },
    ]);
  };

  const report = (moment: MatchMoment) => {
    if (!profileId) return Alert.alert('Sign in required', 'Sign in to report content.');
    Alert.alert('Report this moment?', 'Tournament moderators will be able to review it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => matchMomentsApi.report(moment.id, profileId, 'Reported from tournament timeline')
          .then(() => Alert.alert('Report received', 'Thank you.'))
          .catch(cause => Alert.alert('Could not report moment', messageOf(cause))),
      },
    ]);
  };

  if (!cloudTournamentId) return null;

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text variant="h2">Match Moments</Text>
          <Text variant="caption" tone="muted">
            Photos and conversations that preserve the story of this tournament.
          </Text>
        </View>
        <MaterialCommunityIcons name="image-multiple-outline" size={26} color={colors.accent} />
      </View>

      {profileId ? (
        <Card style={styles.composer}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="What happened? Capture the moment…"
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={1000}
            style={styles.captionInput}
          />
          {image && (
            <View>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <Pressable style={styles.removePhoto} onPress={() => setImage(undefined)}>
                <MaterialCommunityIcons name="close-circle" size={28} color={palette.white} />
              </Pressable>
            </View>
          )}
          <View style={styles.composerActions}>
            <Pressable style={styles.iconAction} onPress={() => void pickPhoto()}>
              <MaterialCommunityIcons name="camera-plus-outline" size={20} color={colors.accent} />
              <Text variant="caption" tone="accent">{image ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
            <Pressable style={styles.iconAction} onPress={() => setMatchPickerOpen(true)}>
              <MaterialCommunityIcons name="cricket" size={20} color={colors.accent} />
              <Text variant="caption" tone="accent">{selectedMatch?.label ?? 'Link match'}</Text>
            </Pressable>
          </View>
          <Button
            title="Share moment"
            size="sm"
            loading={posting}
            disabled={!caption.trim()}
            onPress={() => void publish()}
            fullWidth
          />
        </Card>
      ) : (
        <Card><Text tone="muted">Sign in to share photos, react, and join match discussions.</Text></Card>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <Text variant="bodyStrong">Could not load Match Moments</Text>
          <Text variant="caption" tone="muted">{error}</Text>
          <Button title="Try again" size="sm" variant="secondary" onPress={() => void load()} />
        </Card>
      )}
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
      ) : !moments.length && !error ? (
        <Card style={styles.emptyCard}>
          <MaterialCommunityIcons name="camera-outline" size={30} color={colors.textDim} />
          <Text variant="bodyStrong">No moments yet</Text>
          <Text variant="caption" tone="muted">Be the first to preserve a memory from this tournament.</Text>
        </Card>
      ) : moments.map(moment => {
        const expanded = commentsOpen.has(moment.id);
        const visibleComments = expanded ? moment.comments : moment.comments.slice(-2);
        const canRemove = canModerate || moment.authorId === profileId;
        return (
          <Card key={moment.id} style={styles.momentCard}>
            {moment.systemType && <TournamentResultBanner moment={moment} />}
            <View style={styles.momentHeader}>
              <View style={styles.avatar}>
                <Text variant="bodyStrong">{moment.authorName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{moment.authorName}</Text>
                <Text variant="caption" tone="dim">
                  {moment.matchLabel ?? 'Tournament moment'} · {relativeTime(moment.createdAt)}
                </Text>
              </View>
              {moment.pinned && <MaterialCommunityIcons name="pin" size={18} color={colors.accent} />}
              <Pressable onPress={() => canRemove ? remove(moment) : report(moment)}>
                <MaterialCommunityIcons
                  name={canRemove ? 'trash-can-outline' : 'flag-outline'}
                  size={20}
                  color={canRemove ? colors.danger : colors.textMuted}
                />
              </Pressable>
            </View>
            {!moment.systemType && <Text variant="body" style={{ marginTop: spacing.md }}>{moment.caption}</Text>}
            {moment.imageUrl && (isPlaceholderImage(moment.imageUrl)
              ? <MomentPhotoPlaceholder author={moment.authorName} />
              : <Image source={{ uri: moment.imageUrl }} style={styles.momentImage} />)}
            <View style={styles.reactions}>
              <ReactionButton icon="heart-outline" label="Like" count={moment.reactions.LIKE}
                active={moment.myReactions.includes('LIKE')} onPress={() => void react(moment, 'LIKE')} />
              <ReactionButton icon="fire" label="Fire" count={moment.reactions.FIRE}
                active={moment.myReactions.includes('FIRE')} onPress={() => void react(moment, 'FIRE')} />
              <ReactionButton icon="hand-clap" label="Clap" count={moment.reactions.CLAP}
                active={moment.myReactions.includes('CLAP')} onPress={() => void react(moment, 'CLAP')} />
              <Pressable
                style={styles.reactionButton}
                onPress={() => setCommentsOpen(current => toggleSet(current, moment.id))}
              >
                <MaterialCommunityIcons name="comment-outline" size={17} color={colors.textMuted} />
                <Text variant="caption" tone="muted">{moment.comments.length}</Text>
              </Pressable>
            </View>
            {(visibleComments.length > 0 || expanded) && (
              <View style={styles.comments}>
                {visibleComments.map(comment => (
                  <View key={comment.id} style={styles.comment}>
                    <Text variant="caption">
                      <Text variant="bodyStrong">{comment.authorName} </Text>{comment.body}
                    </Text>
                  </View>
                ))}
                {moment.comments.length > 2 && (
                  <Pressable onPress={() => setCommentsOpen(current => toggleSet(current, moment.id))}>
                    <Text variant="caption" tone="accent">
                      {expanded ? 'Show fewer comments' : `View all ${moment.comments.length} comments`}
                    </Text>
                  </Pressable>
                )}
                {expanded && profileId && (
                  <View style={styles.commentComposer}>
                    <TextInput
                      value={commentDrafts[moment.id] ?? ''}
                      onChangeText={value => setCommentDrafts(current => ({ ...current, [moment.id]: value }))}
                      placeholder="Add a comment…"
                      placeholderTextColor={colors.textDim}
                      maxLength={500}
                      style={styles.commentInput}
                      onSubmitEditing={() => void addComment(moment)}
                    />
                    <Pressable onPress={() => void addComment(moment)}>
                      <MaterialCommunityIcons name="send" size={22} color={colors.accent} />
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </Card>
        );
      })}

      <Modal visible={matchPickerOpen} transparent animationType="fade" onRequestClose={() => setMatchPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMatchPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <Text variant="h3">Link this moment</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <PickerOption
                label="General tournament moment"
                selected={!selectedMatchId}
                onPress={() => { setSelectedMatchId(undefined); setMatchPickerOpen(false); }}
              />
              {matches.map(match => (
                <PickerOption key={match.id} label={match.label} selected={selectedMatchId === match.id}
                  onPress={() => { setSelectedMatchId(match.id); setMatchPickerOpen(false); }} />
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ReactionButton({
  icon, label, count, active, onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.reactionButton, active && styles.reactionActive]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={17} color={active ? colors.accent : colors.textMuted} />
      <Text variant="caption" tone={active ? 'accent' : 'muted'}>{count || label}</Text>
    </Pressable>
  );
}

function TournamentResultBanner({ moment }: { moment: MatchMoment }) {
  const champion = moment.systemType === 'TOURNAMENT_CHAMPION';
  return (
    <View style={[styles.resultBanner, champion ? styles.championBanner : styles.runnerUpBanner]}>
      <View style={styles.resultGlow} />
      {moment.featuredTeamLogoUrl ? (
        <Image source={{ uri: moment.featuredTeamLogoUrl }} style={styles.resultLogo} />
      ) : (
        <View style={styles.resultLogoFallback}>
          <MaterialCommunityIcons name={champion ? 'trophy' : 'medal-outline'} size={34} color={palette.white} />
        </View>
      )}
      <Text variant="caption" style={styles.resultEyebrow}>
        {champion ? 'TOURNAMENT CHAMPIONS' : 'TOURNAMENT RUNNERS-UP'}
      </Text>
      <Text variant="h2" style={styles.resultTeam}>{moment.featuredTeamName}</Text>
      <Text variant="caption" style={styles.resultCaption}>{moment.caption}</Text>
    </View>
  );
}

function PickerOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.pickerOption} onPress={onPress}>
      <Text variant="bodyStrong" style={{ flex: 1 }}>{label}</Text>
      {selected && <MaterialCommunityIcons name="check" size={20} color={colors.accent} />}
    </Pressable>
  );
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString();
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Please try again.';
}

function isPlaceholderImage(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes('creativehatti') || normalized.includes('watermark') || normalized.includes('stock-placeholder');
}

function MomentPhotoPlaceholder({ author }: { author: string }) {
  return <View style={styles.photoPlaceholder}>
    <View style={styles.photoPitchLine} />
    <View style={styles.photoSeam} />
    <Text variant="caption" tone="muted" style={styles.photoCaption}>Photo attached by {author}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, marginTop: spacing.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  composer: { gap: spacing.md },
  captionInput: {
    minHeight: 72,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  composerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  previewImage: { width: '100%', height: 180, borderRadius: radius.md },
  removePhoto: { position: 'absolute', right: spacing.sm, top: spacing.sm },
  momentCard: { gap: spacing.xs },
  resultBanner: {
    minHeight: 220,
    marginBottom: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  championBanner: { backgroundColor: '#8A5B08' },
  runnerUpBanner: { backgroundColor: '#485563' },
  resultGlow: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.10)', top: -130,
  },
  resultLogo: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.white },
  resultLogoFallback: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  resultEyebrow: { color: palette.white, letterSpacing: 1.8 },
  resultTeam: { color: palette.white, textAlign: 'center' },
  resultCaption: { color: 'rgba(255,255,255,0.82)', textAlign: 'center' },
  momentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceElevated,
  },
  photoPlaceholder: { height: 190, marginTop: spacing.md, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'flex-end' },
  photoPitchLine: { position: 'absolute', top: 0, bottom: 0, left: '32%', right: '32%', borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(95, 227, 138, 0.16)' },
  photoSeam: { position: 'absolute', width: 3, height: 110, top: 30, alignSelf: 'center', backgroundColor: 'rgba(232, 196, 104, 0.42)', transform: [{ rotate: '-18deg' }] },
  photoCaption: { padding: spacing.md, backgroundColor: 'rgba(8, 11, 9, 0.78)' },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reactionButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  reactionActive: { borderWidth: 1, borderColor: colors.accent },
  comments: { gap: spacing.sm, marginTop: spacing.sm },
  comment: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  commentInput: { flex: 1, minHeight: 42, color: colors.text },
  emptyCard: { alignItems: 'center', gap: spacing.sm },
  errorCard: { gap: spacing.sm, borderColor: colors.danger },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 520,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.bg,
    gap: spacing.md,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
