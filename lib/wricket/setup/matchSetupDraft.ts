import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MatchFormat } from '@/lib/wricket/domain/types';
import type { TossState } from '@/lib/wricket/presentation/tossState';

const PREFIX = 'wricket:match-setup:v1';

export interface MatchSetupDraft {
  version: 1;
  requestId: string;
  cloudMatchId?: string;
  creationFingerprint?: string;
  step: 'teams' | 'players' | 'toss' | 'review';
  format: MatchFormat;
  teamAId: string | null;
  teamBId: string | null;
  oversInput: string;
  playingCountInput: string;
  selectedAIds: string[];
  selectedBIds: string[];
  matchCaptainAId?: string;
  matchCaptainBId?: string;
  venue: string;
  scheduledAt: string;
  toss: TossState;
}

export function matchSetupDraftKey(userId: string, context: string): string {
  return `${PREFIX}:${userId}:${encodeURIComponent(context)}`;
}

export async function loadMatchSetupDraft(key: string): Promise<MatchSetupDraft | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<MatchSetupDraft>;
    return value.version === 1 && typeof value.requestId === 'string' && typeof value.format === 'string'
      ? value as MatchSetupDraft
      : null;
  } catch {
    return null;
  }
}

export async function saveMatchSetupDraft(key: string, draft: MatchSetupDraft): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(draft));
}

export async function clearMatchSetupDraft(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
