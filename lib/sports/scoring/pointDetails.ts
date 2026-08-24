import type { ScoringSportId } from './presentation';
import type { Side } from './types';

export type PointDetail =
  | 'RALLY_WINNER'
  | 'ACE'
  | 'WINNER'
  | 'SMASH_WINNER'
  | 'SERVICE_WINNER'
  | 'UNFORCED_ERROR'
  | 'FORCED_ERROR'
  | 'DOUBLE_FAULT'
  | 'SERVICE_FAULT'
  | 'FAULT';

export interface PointDetailOption {
  value: PointDetail;
  label: string;
}

const COMMON = Object.freeze([
  { value: 'RALLY_WINNER', label: 'Rally winner' },
] as const);

export function pointDetailOptions(sportId: ScoringSportId): readonly PointDetailOption[] {
  if (sportId === 'tennis' || sportId === 'padel') return Object.freeze([
    ...COMMON,
    { value: 'ACE', label: 'Ace' },
    { value: 'SERVICE_WINNER', label: 'Service winner' },
    { value: 'WINNER', label: 'Winner' },
    { value: 'UNFORCED_ERROR', label: 'Unforced error' },
    { value: 'DOUBLE_FAULT', label: 'Double fault' },
  ]);
  if (sportId === 'badminton') return Object.freeze([
    ...COMMON,
    { value: 'SMASH_WINNER', label: 'Smash winner' },
    { value: 'FORCED_ERROR', label: 'Forced error' },
    { value: 'SERVICE_FAULT', label: 'Service fault' },
  ]);
  if (sportId === 'table_tennis') return Object.freeze([
    ...COMMON,
    { value: 'SERVICE_WINNER', label: 'Service winner' },
    { value: 'WINNER', label: 'Winner' },
    { value: 'UNFORCED_ERROR', label: 'Unforced error' },
  ]);
  return Object.freeze([
    ...COMMON,
    { value: 'WINNER', label: 'Winner' },
    { value: 'FORCED_ERROR', label: 'Forced error' },
    { value: 'FAULT', label: 'Fault' },
  ]);
}

export function pointDetailLabel(value: unknown): string {
  return ({
    RALLY_WINNER: 'Point won',
    ACE: 'Ace',
    WINNER: 'Winner',
    SMASH_WINNER: 'Smash winner',
    SERVICE_WINNER: 'Service winner',
    UNFORCED_ERROR: 'Unforced error',
    FORCED_ERROR: 'Forced error',
    DOUBLE_FAULT: 'Double fault',
    SERVICE_FAULT: 'Service fault',
    FAULT: 'Fault',
  } as Record<string, string>)[String(value)] ?? 'Rally winner';
}

export function describePointDetail(
  value: unknown,
  winner: Side,
  sideNames: readonly [string, string],
): string {
  const winnerName = sideNames[winner];
  const loserName = sideNames[winner === 0 ? 1 : 0];
  return ({
    ACE: `Ace by ${winnerName}`,
    WINNER: `Winner by ${winnerName}`,
    SMASH_WINNER: `Smash winner by ${winnerName}`,
    SERVICE_WINNER: `Service winner by ${winnerName}`,
    UNFORCED_ERROR: `${loserName} made an unforced error`,
    FORCED_ERROR: `${winnerName} forced the error`,
    DOUBLE_FAULT: `${loserName} double-faulted`,
    SERVICE_FAULT: `${loserName} committed a service fault`,
    FAULT: `${loserName} committed a fault`,
    RALLY_WINNER: `Rally won by ${winnerName}`,
  } as Record<string, string>)[String(value)] ?? `Rally won by ${winnerName}`;
}

export function pointDetailChoiceLabel(
  value: PointDetail,
  winner: Side,
  sideNames: readonly [string, string],
): string {
  const winnerName = sideNames[winner];
  const loserName = sideNames[winner === 0 ? 1 : 0];
  return ({
    RALLY_WINNER: `Rally won by ${winnerName}`,
    ACE: `Ace by ${winnerName}`,
    WINNER: `Winner by ${winnerName}`,
    SMASH_WINNER: `Smash winner by ${winnerName}`,
    SERVICE_WINNER: `Service winner by ${winnerName}`,
    UNFORCED_ERROR: `Unforced error by ${loserName}`,
    FORCED_ERROR: `Forced error by ${loserName}`,
    DOUBLE_FAULT: `Double fault by ${loserName}`,
    SERVICE_FAULT: `Service fault by ${loserName}`,
    FAULT: `Fault by ${loserName}`,
  } as Record<PointDetail, string>)[value];
}
