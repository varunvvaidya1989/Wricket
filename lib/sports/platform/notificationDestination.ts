import { safeAuthReturnTo } from '@/lib/auth/returnTo';

// Notification links navigate within the app; route gates and RLS still decide access.
export function notificationDestination(value?: string): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\#\s]/.test(value)) return undefined;
  const publicDestination = safeAuthReturnTo(value);
  if (publicDestination === value) return value;
  const sport = '(?:wricket|tennis|badminton|padel|table-tennis|pickleball)';
  const id = '[A-Za-z0-9_-]+';
  const detail = new RegExp(`^/${sport}/(?:team|club|competition|tournament)/${id}$`);
  const match = new RegExp(`^/${sport}/match/${id}/(?:feed|live|score)$`);
  return detail.test(value) || match.test(value) ? value : undefined;
}
