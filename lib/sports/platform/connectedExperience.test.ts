import { describe, expect, it } from 'vitest';
import type { CloudSport } from '@/lib/supabase/profiles';
import { connectedStageSports, exploreCategory, filterExplore, sportEntry, sportHome, type ExploreItem } from './connectedExperience';

const badminton: CloudSport = { id: 'badminton', code: 'BADMINTON', name: 'Badminton', status: 'AVAILABLE', accessStatus: 'ACTIVE', isPrimary: false };
describe('connected experience destinations', () => {
  it('keeps selected setup through sign-in and sport connection', () => {
    expect(sportEntry('BADMINTON', false, [], true)).toBe('/auth?returnTo=%2Fbadminton%2Fmatch%2Fnew');
    expect(sportEntry('BADMINTON', true, [], true)).toBe('/account?returnTo=%2Fbadminton%2Fmatch%2Fnew');
    expect(sportEntry('BADMINTON', true, [badminton], true)).toBe('/badminton/match/new');
  });
  it('does not treat suspended or coming-soon sports as connected', () => {
    expect(connectedStageSports([{ ...badminton, accessStatus: 'SUSPENDED' }])).toEqual([]);
    expect(connectedStageSports([{ ...badminton, status: 'COMING_SOON' }])).toEqual([]);
    expect(sportEntry('BADMINTON', true, [{ ...badminton, accessStatus: 'SUSPENDED' }])).toContain('/account?');
  });
  it('rejects unknown sports and preserves the cricket route family', () => {
    expect(sportHome('CRICKET')).toBe('/wricket');
    expect(sportHome('TABLE_TENNIS')).toBe('/table-tennis');
    expect(sportEntry('../account', true, [], true)).toBeUndefined();
  });
});
describe('Explore categories and deduplication', () => {
  const match: ExploreItem = { key: 'match:1', kind: 'Matches', title: 'Northstar vs Southside', detail: 'Cricket', sportCode: 'CRICKET', route: '/match?id=1' };
  const team: ExploreItem = { key: 'team:1', kind: 'Teams', title: 'Northstar', detail: 'Cricket team', sportCode: 'CRICKET', route: '/wricket/team/1' };
  it('deduplicates cross-source results and combines category and case-insensitive search', () => {
    expect(filterExplore([match, match, team], ' NORTHSTAR ', 'All')).toHaveLength(2);
    expect(filterExplore([match, team], 'northstar', 'Teams')).toEqual([team]);
    expect(filterExplore([match], 'unknown', 'All')).toEqual([]);
  });
  it('normalizes unknown or repeated URL categories to All', () => {
    expect(exploreCategory('Teams')).toBe('Teams');
    expect(exploreCategory('OWNER')).toBe('All');
    expect(exploreCategory(['Matches', 'Teams'])).toBe('All');
  });
});
