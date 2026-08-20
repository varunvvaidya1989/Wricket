export type SportCompetitionLifecycle =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_LOCKED'
  | 'PUBLISHED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

const transitions: Record<SportCompetitionLifecycle, readonly SportCompetitionLifecycle[]> = {
  DRAFT: ['REGISTRATION_OPEN', 'PUBLISHED', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_LOCKED', 'CANCELLED'],
  REGISTRATION_LOCKED: ['REGISTRATION_OPEN', 'PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['LIVE', 'CANCELLED'],
  LIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function getNextCompetitionLifecycleActions(
  current: SportCompetitionLifecycle,
): readonly SportCompetitionLifecycle[] {
  return transitions[current];
}
