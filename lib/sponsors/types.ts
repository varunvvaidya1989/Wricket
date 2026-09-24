export type SponsorParent = { kind: 'cricket' | 'sport'; id: string };
export const SPONSOR_PLACEMENTS = ['tournament', 'match', 'share'] as const;
export type SponsorPlacement = typeof SPONSOR_PLACEMENTS[number];
export interface SponsorInput {
  name: string;
  label: string;
  description: string;
  websiteUrl: string;
  displayOrder: number;
  isVisible: boolean;
  placements: SponsorPlacement[];
}
export interface TournamentSponsor extends SponsorInput {
  id: string;
  version: number;
  logoPath?: string;
  logoUrl?: string;
}

export function normalizeSponsor(input: SponsorInput): SponsorInput {
  const name = input.name.trim();
  const label = input.label.trim();
  const description = input.description.trim();
  let websiteUrl = input.websiteUrl.trim();
  if (!name || name.length > 120) throw new Error('Enter a sponsor name (up to 120 characters).');
  if (!label || label.length > 60) throw new Error('Enter a sponsor label (up to 60 characters).');
  if (description.length > 600) throw new Error('Keep the description under 600 characters.');
  if (websiteUrl) {
    if (!/^[a-z][a-z\d+.-]*:/i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;
    let url: URL;
    try { url = new URL(websiteUrl); } catch { throw new Error('Enter a valid HTTPS website.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /\s/.test(websiteUrl) || websiteUrl.length > 2048) {
      throw new Error('Enter a valid HTTPS website without spaces or login credentials.');
    }
    websiteUrl = url.href;
  }
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0 || input.displayOrder > 9999) {
    throw new Error('Display order must be a whole number from 0 to 9999.');
  }
  const placements = [...new Set(input.placements)];
  if (!placements.length || placements.some(value => !SPONSOR_PLACEMENTS.includes(value))) {
    throw new Error('Choose at least one place to show the sponsor.');
  }
  return { ...input, name, label, description, websiteUrl, placements };
}

export function sponsorsForPlacement(sponsors: readonly TournamentSponsor[], placement: SponsorPlacement) {
  return sponsors.filter(sponsor => sponsor.isVisible && sponsor.placements.includes(placement))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
