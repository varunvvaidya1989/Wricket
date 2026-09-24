import { describe, expect, it } from 'vitest';
import { normalizeSponsor, sponsorsForPlacement, type SponsorInput, type TournamentSponsor } from './types';

const input: SponsorInput = { name: ' Apex ', label: ' Gold partner ', description: ' Local sports ', websiteUrl: 'apex.example', displayOrder: 10, isVisible: true, placements: ['tournament', 'match'] };
describe('sponsor details', () => {
  it('normalizes public details and adds HTTPS to bare domains', () => {
    expect(normalizeSponsor(input)).toMatchObject({ name: 'Apex', label: 'Gold partner', description: 'Local sports', websiteUrl: 'https://apex.example/' });
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://user:pass@example.com', 'https://example .com', 'https://'])('rejects unsafe or invalid website %s', websiteUrl => {
    expect(() => normalizeSponsor({ ...input, websiteUrl })).toThrow(/HTTPS/);
  });
  it.each([-1, 10000, 1.5, NaN])('rejects invalid display order %s', displayOrder => {
    expect(() => normalizeSponsor({ ...input, displayOrder })).toThrow(/whole number/);
  });
  it('requires a name, label and placement', () => {
    expect(() => normalizeSponsor({ ...input, name: ' ' })).toThrow(/name/);
    expect(() => normalizeSponsor({ ...input, label: '' })).toThrow(/label/);
    expect(() => normalizeSponsor({ ...input, placements: [] })).toThrow(/place/);
    expect(() => normalizeSponsor({ ...input, description: 'a'.repeat(601) })).toThrow(/description/);
  });
  it('filters hidden sponsors and placements, with stable ordering, without modifying the source', () => {
    const sponsor = (id: string, changes: Partial<TournamentSponsor> = {}): TournamentSponsor => ({ ...input, id, version: 1, ...changes });
    const source = [sponsor('second', { displayOrder: 20 }), sponsor('hidden', { isVisible: false }), sponsor('first'), sponsor('share-only', { placements: ['share'] })];
    expect(sponsorsForPlacement(source, 'match').map(s => s.id)).toEqual(['first', 'second']);
    expect(source[0].id).toBe('second');
    expect(sponsorsForPlacement([], 'tournament')).toEqual([]);
  });
});
