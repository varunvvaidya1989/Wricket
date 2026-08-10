import { getSupabaseClient } from './client';
import { newUuid } from '@/lib/wricket/db/client';

const MOMENTS_BUCKET = 'match-moments';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type MomentReactionType = 'LIKE' | 'FIRE' | 'CLAP';
export type SystemMomentType = 'TOURNAMENT_CHAMPION' | 'TOURNAMENT_RUNNER_UP';

export interface MomentComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface MatchMoment {
  id: string;
  tournamentId: string;
  matchId?: string;
  matchLabel?: string;
  authorId: string;
  authorName: string;
  caption: string;
  imageUrl?: string;
  createdAt: string;
  pinned: boolean;
  systemType?: SystemMomentType;
  featuredTeamName?: string;
  featuredTeamLogoUrl?: string;
  reactions: Record<MomentReactionType, number>;
  myReactions: MomentReactionType[];
  comments: MomentComment[];
}

export interface MomentMatchOption {
  id: string;
  label: string;
}

export interface MomentImageInput {
  uri: string;
  mimeType?: string | null;
  width?: number;
  height?: number;
  fileSize?: number | null;
}

export const matchMomentsApi = {
  async list(tournamentId: string, profileId?: string, limit = 30): Promise<MatchMoment[]> {
    const client = getSupabaseClient();
    const { data: moments, error } = await client.from('match_moments')
      .select(`
        id, tournament_id, match_id, author_id, caption, pinned_at, created_at, system_type,
        author:profiles!match_moments_author_id_fkey(display_name),
        featured_team:teams!match_moments_featured_team_id_fkey(name, logo_url),
        media:moment_media(id, storage_path, processing_status)
      `)
      .eq('tournament_id', tournamentId)
      .eq('status', 'PUBLISHED')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (!moments.length) return [];

    const momentIds = moments.map(moment => moment.id);
    const matchIds = [...new Set(moments.flatMap(moment => moment.match_id ? [moment.match_id] : []))];
    const [{ data: reactions, error: reactionError }, { data: comments, error: commentError }, matchResult] =
      await Promise.all([
        client.from('moment_reactions')
          .select('moment_id, profile_id, reaction_type')
          .in('moment_id', momentIds),
        client.from('moment_comments')
          .select('id, moment_id, author_id, body, created_at, author:profiles!moment_comments_author_id_fkey(display_name)')
          .in('moment_id', momentIds)
          .eq('status', 'PUBLISHED')
          .order('created_at'),
        matchIds.length
          ? client.from('matches')
              .select('id, team_a:teams!matches_team_a_id_fkey(short_name), team_b:teams!matches_team_b_id_fkey(short_name)')
              .in('id', matchIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (reactionError) throw reactionError;
    if (commentError) throw commentError;
    if (matchResult.error) throw matchResult.error;

    const matchLabels = new Map((matchResult.data ?? []).map((match: any) => [
      match.id,
      `${match.team_a?.short_name ?? 'Team A'} vs ${match.team_b?.short_name ?? 'Team B'}`,
    ]));
    const commentsByMoment = new Map<string, MomentComment[]>();
    for (const comment of comments ?? []) {
      const current = commentsByMoment.get(comment.moment_id) ?? [];
      current.push({
        id: comment.id,
        authorId: comment.author_id,
        authorName: relationOne(comment.author)?.display_name ?? 'Wricket user',
        body: comment.body,
        createdAt: comment.created_at,
      });
      commentsByMoment.set(comment.moment_id, current);
    }
    const reactionsByMoment = new Map<string, {
      counts: Record<MomentReactionType, number>;
      mine: MomentReactionType[];
    }>();
    for (const reaction of reactions ?? []) {
      const current = reactionsByMoment.get(reaction.moment_id) ?? {
        counts: { LIKE: 0, FIRE: 0, CLAP: 0 },
        mine: [],
      };
      const type = reaction.reaction_type as MomentReactionType;
      current.counts[type] += 1;
      if (reaction.profile_id === profileId) current.mine.push(type);
      reactionsByMoment.set(reaction.moment_id, current);
    }

    return Promise.all(moments.map(async moment => {
      const media = relationMany(moment.media)
        .find(item => item.processing_status === 'READY');
      let imageUrl: string | undefined;
      if (media?.storage_path) {
        const { data } = await client.storage.from(MOMENTS_BUCKET)
          .createSignedUrl(media.storage_path, 60 * 60);
        imageUrl = data?.signedUrl;
      }
      const reaction = reactionsByMoment.get(moment.id) ?? {
        counts: { LIKE: 0, FIRE: 0, CLAP: 0 },
        mine: [],
      };
      return {
        id: moment.id,
        tournamentId: moment.tournament_id,
        matchId: moment.match_id ?? undefined,
        matchLabel: moment.match_id ? matchLabels.get(moment.match_id) : undefined,
        authorId: moment.author_id,
        authorName: relationOne(moment.author)?.display_name ?? 'Wricket user',
        caption: moment.caption,
        imageUrl,
        createdAt: moment.created_at,
        pinned: Boolean(moment.pinned_at),
        systemType: moment.system_type ?? undefined,
        featuredTeamName: relationOne(moment.featured_team)?.name,
        featuredTeamLogoUrl: relationOne(moment.featured_team)?.logo_url ?? undefined,
        reactions: reaction.counts,
        myReactions: reaction.mine,
        comments: commentsByMoment.get(moment.id) ?? [],
      };
    }));
  },

  async listMatchOptions(tournamentId: string): Promise<MomentMatchOption[]> {
    const { data, error } = await getSupabaseClient().from('matches')
      .select('id, team_a:teams!matches_team_a_id_fkey(short_name), team_b:teams!matches_team_b_id_fkey(short_name)')
      .eq('tournament_id', tournamentId)
      .order('scheduled_at', { ascending: false });
    if (error) throw error;
    return data.map((match: any) => ({
      id: match.id,
      label: `${match.team_a?.short_name ?? 'Team A'} vs ${match.team_b?.short_name ?? 'Team B'}`,
    }));
  },

  async create(input: {
    tournamentId: string;
    matchId?: string;
    authorId: string;
    caption: string;
    image?: MomentImageInput;
  }): Promise<string> {
    const caption = input.caption.trim();
    if (!caption) throw new Error('Write something about this moment.');
    const client = getSupabaseClient();
    const momentId = newUuid();
    const { error: momentError } = await client.from('match_moments').insert({
      id: momentId,
      tournament_id: input.tournamentId,
      match_id: input.matchId ?? null,
      author_id: input.authorId,
      caption,
    });
    if (momentError) throw momentError;
    if (!input.image) return momentId;

    try {
      const response = await fetch(input.image.uri);
      if (!response.ok) throw new Error('Could not read the selected photo.');
      const body = await response.arrayBuffer();
      if (body.byteLength > MAX_IMAGE_BYTES) throw new Error('The photo must be smaller than 8 MB.');
      const mimeType = supportedMimeType(input.image.mimeType, input.image.uri);
      const mediaId = newUuid();
      const path = `${input.authorId}/${input.tournamentId}/${momentId}/${mediaId}.${extensionFor(mimeType)}`;
      const { error: uploadError } = await client.storage.from(MOMENTS_BUCKET)
        .upload(path, body, { contentType: mimeType, cacheControl: '31536000', upsert: false });
      if (uploadError) throw uploadError;
      const { error: mediaError } = await client.from('moment_media').insert({
        id: mediaId,
        moment_id: momentId,
        storage_path: path,
        mime_type: mimeType,
        byte_size: body.byteLength,
        width: input.image.width ?? null,
        height: input.image.height ?? null,
      });
      if (mediaError) {
        await client.storage.from(MOMENTS_BUCKET).remove([path]);
        throw mediaError;
      }
      return momentId;
    } catch (cause) {
      await client.from('match_moments').update({ status: 'REMOVED' }).eq('id', momentId);
      throw cause;
    }
  },

  async addComment(input: {
    tournamentId: string;
    momentId: string;
    authorId: string;
    body: string;
  }): Promise<void> {
    const body = input.body.trim();
    if (!body) throw new Error('Write a comment first.');
    const { error } = await getSupabaseClient().from('moment_comments').insert({
      tournament_id: input.tournamentId,
      moment_id: input.momentId,
      author_id: input.authorId,
      body,
    });
    if (error) throw error;
  },

  async toggleReaction(input: {
    tournamentId: string;
    momentId: string;
    profileId: string;
    reaction: MomentReactionType;
    active: boolean;
  }): Promise<void> {
    const client = getSupabaseClient();
    if (input.active) {
      const { error } = await client.from('moment_reactions').delete()
        .eq('moment_id', input.momentId)
        .eq('profile_id', input.profileId)
        .eq('reaction_type', input.reaction);
      if (error) throw error;
    } else {
      const { error } = await client.from('moment_reactions').insert({
        tournament_id: input.tournamentId,
        moment_id: input.momentId,
        profile_id: input.profileId,
        reaction_type: input.reaction,
      });
      if (error) throw error;
    }
  },

  async remove(momentId: string): Promise<void> {
    const { error } = await getSupabaseClient().from('match_moments')
      .update({ status: 'REMOVED' }).eq('id', momentId);
    if (error) throw error;
  },

  async report(momentId: string, reporterId: string, reason: string): Promise<void> {
    const { error } = await getSupabaseClient().from('moment_reports').insert({
      moment_id: momentId,
      reporter_id: reporterId,
      reason,
    });
    if (error) throw error;
  },

  subscribe(tournamentId: string, onChange: () => void): () => void {
    const client = getSupabaseClient();
    const channel = client.channel(`match-moments:${tournamentId}:${newUuid()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'match_moments',
        filter: `tournament_id=eq.${tournamentId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'moment_comments',
        filter: `tournament_id=eq.${tournamentId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'moment_reactions',
        filter: `tournament_id=eq.${tournamentId}`,
      }, onChange)
      .subscribe();
    return () => { void client.removeChannel(channel); };
  },
};

function relationOne<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function relationMany<T>(value: T | T[] | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function supportedMimeType(value: string | null | undefined, uri: string) {
  if (value === 'image/png' || value === 'image/webp' || value === 'image/jpeg') return value;
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extensionFor(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
