import { isSportReleased } from './sportRelease';

export interface SportStageSportContent {
  readonly code: string;
  readonly name: string;
  readonly guestDetailLabel: string;
  readonly timelineLabel: string;
}

export const SPORTSTAGE_SPORTS: readonly SportStageSportContent[] = Object.freeze([
  Object.freeze({ code: 'CRICKET', name: 'Cricket', guestDetailLabel: 'Ball-by-ball commentary', timelineLabel: 'Ball-by-ball commentary' }),
  Object.freeze({ code: 'TENNIS', name: 'Tennis', guestDetailLabel: 'Point-by-point match feed', timelineLabel: 'Point-by-point timeline' }),
  Object.freeze({ code: 'BADMINTON', name: 'Badminton', guestDetailLabel: 'Rally-by-rally match feed', timelineLabel: 'Rally-by-rally timeline' }),
  Object.freeze({ code: 'PADEL', name: 'Padel', guestDetailLabel: 'Point-by-point match feed', timelineLabel: 'Point-by-point timeline' }),
  Object.freeze({ code: 'TABLE_TENNIS', name: 'Table Tennis', guestDetailLabel: 'Point-by-point match feed', timelineLabel: 'Point-by-point timeline' }),
  Object.freeze({ code: 'PICKLEBALL', name: 'Pickleball', guestDetailLabel: 'Rally-by-rally match feed', timelineLabel: 'Rally-by-rally timeline' }),
]);

export const RELEASED_SPORTSTAGE_SPORTS: readonly SportStageSportContent[] = Object.freeze(
  SPORTSTAGE_SPORTS.filter((sport) => isSportReleased(sport.code)),
);

const contentByCode = new Map(SPORTSTAGE_SPORTS.map((sport) => [sport.code, sport]));

export function sportStageContent(code: string): SportStageSportContent {
  return contentByCode.get(code) ?? {
    code,
    name: code.replaceAll('_', ' '),
    guestDetailLabel: 'Detailed match timeline',
    timelineLabel: 'Match timeline',
  };
}
