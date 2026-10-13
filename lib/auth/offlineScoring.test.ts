import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ account: 'scorer',grant: true,status: 'IN_PROGRESS',exists: true }));
vi.mock('@react-native-async-storage/async-storage',() => ({ default: { getItem: async (key: string) => state.grant && key.includes(`:${state.account}:`) ? '1' : null } }));
vi.mock('@/lib/wricket/db/repo',() => ({ getMatch: async () => state.exists ? { status: state.status } : null }));
import { canResumeOfflineScoring } from './offlineScoring';
const request = { platform: 'android',segments: ['wricket','match','12345678-1234-1234-1234-123456789012','score'],accountId: 'scorer',profileError: 'TypeError: Network request failed' };
beforeEach(() => { state.account = 'scorer'; state.grant = true; state.status = 'IN_PROGRESS'; state.exists = true; });
describe('native offline scoring route boundary',() => {
  it.each(['IN_PROGRESS','INNINGS_BREAK','FOLLOW_ON_DECISION'])('restores the authorised account and locally saved %s match during a profile outage',async status => { state.status = status; expect(await canResumeOfflineScoring(request)).toBe(true); });
  it('rejects another account, missing session and a missing grant',async () => {
    expect(await canResumeOfflineScoring({ ...request,accountId: 'spectator' })).toBe(false);
    expect(await canResumeOfflineScoring({ ...request,accountId: undefined })).toBe(false);
    state.grant = false; expect(await canResumeOfflineScoring(request)).toBe(false);
  });
  it('never substitutes a cached grant for a server denial or missing profile',async () => {
    for (const profileError of ['Permission denied','Profile suspended',null]) expect(await canResumeOfflineScoring({ ...request,profileError })).toBe(false);
  });
  it('does not permit web, other routes or forged route identifiers',async () => {
    expect(await canResumeOfflineScoring({ ...request,platform: 'web' })).toBe(false);
    for (const segments of [['wricket'],['tennis','match',request.segments[2],'score'],['wricket','match','not-a-match','score'],['wricket','match',request.segments[2],'live']]) expect(await canResumeOfflineScoring({ ...request,segments })).toBe(false);
  });
  it('requires the actual local match and refuses terminal scoring',async () => {
    state.exists = false; expect(await canResumeOfflineScoring(request)).toBe(false);
    state.exists = true; state.status = 'COMPLETED'; expect(await canResumeOfflineScoring(request)).toBe(false);
  });
});
