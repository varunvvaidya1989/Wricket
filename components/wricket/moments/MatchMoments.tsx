import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { SportStageLoader } from '@/components/ui/SportStageLoader';

import { Button } from '@/components/wricket/ui/Button';
import { Card } from '@/components/wricket/ui/Card';
import { Text } from '@/components/wricket/ui/Text';
import {
  MatchMoment,
  matchMomentsApi,
  MomentImageInput,
  MomentMatchOption,
  MomentReactionType,
} from '@/lib/supabase/matchMomentsApi';
import { colors, fonts, palette } from '@/lib/wricket/presentation/design';
import { radius, spacing } from '@/lib/theme/spacing';

export function MatchMoments({
  cloudTournamentId,
  profileId,
  canModerate,
  refreshKey,
}: {
  cloudTournamentId?: string;
  profileId?: string;
  canModerate: boolean;
  refreshKey?: number;
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
  const [notice, setNotice] = useState<string>();
  const [confirmation, setConfirmation] = useState<{ kind: 'remove' | 'report'; moment: MatchMoment }>();
  const [acting, setActing] = useState(false);
  const postingGuard = useRef(false);

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

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => cloudTournamentId
    ? matchMomentsApi.subscribe(cloudTournamentId, () => { void load(); })
    : undefined, [cloudTournamentId, load]);

  const selectedMatch = useMemo(
    () => matches.find(match => match.id === selectedMatchId),
    [matches, selectedMatchId],
  );

  useEffect(() => () => {
    if (Platform.OS === 'web' && image?.uri.startsWith('blob:')) URL.revokeObjectURL(image.uri);
  }, [image?.uri]);

  const selectWebPhoto = (file?: File) => {
    if (!file) return;
    setNotice(undefined);
    if (file.size > 8 * 1024 * 1024) return setNotice('Photo too large. Choose a photo smaller than 8 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setNotice('Choose a JPEG, PNG or WebP photo.');
    setImage({ uri: URL.createObjectURL(file), mimeType: file.type, fileSize: file.size });
  };

  const pickPhoto = async () => {
    setNotice(undefined);
    try {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice('Photos permission needed. Allow photo access to capture a match moment.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.75,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      setNotice('Photo too large. Choose a photo smaller than 8 MB.');
      return;
    }
    setImage({
      uri: asset.uri,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
    });
    } catch (cause) { setNotice(`Could not open photos. ${messageOf(cause)}`); }
  };

  const publish = async () => {
    if (!cloudTournamentId || !profileId) {
      setNotice('Sign in to share a Match Moment.');
      return;
    }
    if (postingGuard.current) return;
    postingGuard.current = true;
    setPosting(true); setNotice(undefined);
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
      setNotice(`Could not publish moment. ${messageOf(cause)}`);
    } finally {
      setPosting(false); postingGuard.current = false;
    }
  };

  const react = async (moment: MatchMoment, reaction: MomentReactionType) => {
    if (!profileId) return setNotice('Sign in to react to a moment.');
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
      setNotice(`Could not update reaction. ${messageOf(cause)}`);
    }
  };

  const addComment = async (moment: MatchMoment) => {
    if (!profileId) return setNotice('Sign in to join the discussion.');
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
      setNotice(`Could not add comment. ${messageOf(cause)}`);
    }
  };

  const remove = (moment: MatchMoment) => { setNotice(undefined); setConfirmation({ kind: 'remove', moment }); };
  const report = (moment: MatchMoment) => {
    if (!profileId) return setNotice('Sign in to report content.');
    setNotice(undefined); setConfirmation({ kind: 'report', moment });
  };
  const confirmAction = async () => {
    if (!confirmation || acting) return;
    setActing(true);
    try {
      if (confirmation.kind === 'remove') await matchMomentsApi.remove(confirmation.moment.id);
      else if (profileId) await matchMomentsApi.report(confirmation.moment.id, profileId, 'Reported from tournament timeline');
      setNotice(confirmation.kind === 'report' ? 'Report received. Tournament moderators can review it.' : 'Moment removed.');
      setConfirmation(undefined); await load();
    } catch (cause) { setNotice(messageOf(cause)); } finally { setActing(false); }
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

      {notice && !confirmation ? <Text accessibilityRole="alert" tone="muted">{notice}</Text> : null}
      <MomentHighlights moments={moments} />
      {profileId ? (
        <Card style={styles.composer}>
          <TextInput
            accessibilityLabel="Moment caption"
            value={caption}
            onChangeText={setCaption}
            placeholder="What happened? Capture the moment..."
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={1000}
            style={styles.captionInput}
          />
          {image && (
            <View>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <Pressable accessibilityRole="button" accessibilityLabel="Remove attached photo" style={styles.removePhoto} onPress={() => setImage(undefined)}>
                <MaterialCommunityIcons name="close-circle" size={28} color={palette.white} />
              </Pressable>
            </View>
          )}
          <View style={styles.composerActions}>
            {Platform.OS === 'web' ? <View style={[styles.iconAction, { position: 'relative' }]}>
              <MaterialCommunityIcons name="camera-plus-outline" size={20} color={colors.accent} />
              <Text variant="caption" tone="accent">{image ? 'Change photo' : 'Add photo'}</Text>
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={image ? 'Change photo' : 'Add photo'} disabled={posting}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                onChange={event => { selectWebPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
            </View> : <Pressable accessibilityRole="button" style={styles.iconAction} onPress={() => void pickPhoto()}>
              <MaterialCommunityIcons name="camera-plus-outline" size={20} color={colors.accent} />
              <Text variant="caption" tone="accent">{image ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>}
            <Pressable accessibilityRole="button" style={styles.iconAction} onPress={() => setMatchPickerOpen(true)}>
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
        <SportStageLoader variant="compact" message="Loading match moments" detail="" />
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
              <Pressable accessibilityRole="button" accessibilityLabel={`${canRemove ? 'Remove' : 'Report'} moment by ${moment.authorName}`} style={styles.iconTarget} onPress={() => canRemove ? remove(moment) : report(moment)}>
                <MaterialCommunityIcons
                  name={canRemove ? 'trash-can-outline' : 'flag-outline'}
                  size={20}
                  color={canRemove ? colors.danger : colors.textMuted}
                />
              </Pressable>
            </View>
            {!moment.systemType && <Text variant="body" style={{ marginTop: spacing.md }}>{moment.caption}</Text>}
            {moment.imageUrl ? <MomentImage url={moment.imageUrl} author={moment.authorName} /> : null}
            <View style={styles.reactions}>
              <ReactionButton icon="heart-outline" label="Like" count={moment.reactions.LIKE}
                active={moment.myReactions.includes('LIKE')} onPress={() => void react(moment, 'LIKE')} />
              <ReactionButton icon="fire" label="Fire" count={moment.reactions.FIRE}
                active={moment.myReactions.includes('FIRE')} onPress={() => void react(moment, 'FIRE')} />
              <ReactionButton icon="hand-clap" label="Clap" count={moment.reactions.CLAP}
                active={moment.myReactions.includes('CLAP')} onPress={() => void react(moment, 'CLAP')} />
              <Pressable accessibilityRole="button" accessibilityLabel={`View comments on moment by ${moment.authorName}`}
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
                  <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => setCommentsOpen(current => toggleSet(current, moment.id))}>
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
                      accessibilityLabel={`Comment on moment by ${moment.authorName}`}
                      placeholder="Add a comment…"
                      placeholderTextColor={colors.textDim}
                      maxLength={500}
                      style={styles.commentInput}
                      onSubmitEditing={() => void addComment(moment)}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Send comment on moment by ${moment.authorName}`} style={styles.iconTarget} onPress={() => void addComment(moment)}>
                      <MaterialCommunityIcons name="send" size={22} color={colors.accent} />
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </Card>
        );
      })}

      <Modal visible={Boolean(confirmation)} transparent animationType="fade" onRequestClose={() => !acting && setConfirmation(undefined)}>
        <View style={styles.modalBackdrop}><View style={styles.pickerCard}>
          <Text variant="h3">{confirmation?.kind === 'remove' ? 'Remove this moment?' : 'Report this moment?'}</Text>
          <Text tone="muted">{confirmation?.kind === 'remove' ? 'Its discussion will no longer be visible.' : 'Tournament moderators will be able to review it.'}</Text>
          {notice && confirmation ? <Text accessibilityRole="alert">{notice}</Text> : null}
          <Button title={confirmation?.kind === 'remove' ? 'Remove moment' : 'Report moment'} variant="danger" loading={acting} onPress={() => void confirmAction()} />
          <Button title="Cancel" variant="secondary" disabled={acting} onPress={() => setConfirmation(undefined)} />
        </View></View>
      </Modal>
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
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} moment`} accessibilityState={{ selected: active }} style={[styles.reactionButton, active && styles.reactionActive]} onPress={onPress}>
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

function MomentImage({ url, author }: { url: string; author: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return failed || isPlaceholderImage(url) ? <MomentPhotoPlaceholder author={author} /> : <Image accessibilityLabel={`Match photo shared by ${author}`} source={{ uri: url }} style={styles.momentImage} onError={() => setFailed(true)} />;
}

function MomentHighlights({ moments }: { moments: MatchMoment[] }) {
  const highlights = moments.filter(moment => moment.pinned || moment.systemType || moment.imageUrl).slice(0, 12);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const selected = Math.min(index, Math.max(0, highlights.length - 1));
  useEffect(() => { setIndex(0); scroll.current?.scrollTo({ x: 0, animated: false }); }, [highlights.length]);
  if (!highlights.length) return null;
  const move = (next: number) => { setIndex(next); scroll.current?.scrollTo({ x: next * width, animated: true }); };
  return <View style={{ gap: 10 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text variant="overline" tone="muted">TOURNAMENT HIGHLIGHTS</Text><Text variant="caption" tone="muted">{selected + 1} / {highlights.length}</Text></View>
    <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => { if (width) setIndex(Math.round(event.nativeEvent.contentOffset.x / width)); }}>
      {highlights.map(moment => <View key={moment.id} style={{ width, paddingHorizontal: 1 }}><Card><Text variant="bodyStrong">{moment.authorName}</Text>{moment.systemType ? <TournamentResultBanner moment={moment} /> : moment.imageUrl ? <MomentImage url={moment.imageUrl} author={moment.authorName} /> : null}{!moment.systemType ? <Text>{moment.caption}</Text> : null}</Card></View>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', gap: 10 }}><Button title="Previous highlight" variant="secondary" disabled={selected === 0} onPress={() => move(selected - 1)} style={{ flex: 1 }} /><Button title="Next highlight" variant="secondary" disabled={selected === highlights.length - 1} onPress={() => move(selected + 1)} style={{ flex: 1 }} /></View>
  </View>;
}

function PickerOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.pickerOption} onPress={onPress}>
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
  return cause instanceof Error ? cause.message : typeof cause === 'object' && cause !== null && 'message' in cause ? String(cause.message) : 'Please try again.';
}

function isPlaceholderImage(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.includes('creativehatti') || normalized.includes('watermark') || normalized.includes('stock-placeholder');
}

function MomentPhotoPlaceholder({ author }: { author: string }) {
  return <View style={styles.photoPlaceholder}>
    <View style={styles.photoPitchLine} />
    <View style={styles.photoSeam} />
    <Text variant="bodyStrong" tone="muted" style={styles.photoCaption}>Photo unavailable</Text>
    <Text variant="caption" tone="muted">Shared by {author}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, marginTop: spacing.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  composer: { gap: spacing.md },
  captionInput: {
    minHeight: 72,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  composerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  previewImage: { width: '100%', height: 180, borderRadius: radius.md },
  iconTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removePhoto: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', position: 'absolute', right: spacing.sm, top: spacing.sm },
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
    minHeight: 44,
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
  commentInput: { flex: 1, minHeight: 44, color: colors.text, fontFamily: fonts.body, fontSize: 13 },
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
