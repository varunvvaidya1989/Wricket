export interface StatusPresentation { label: string; live: boolean; terminal: boolean }

export function matchStatus(status: string): StatusPresentation {
  const labels: Record<string, string> = {
    SETUP: 'Setup', TOSS: 'Toss', SCHEDULED: 'Upcoming', UPCOMING: 'Upcoming',
    IN_PROGRESS: 'Live', LIVE: 'Live', INNINGS_BREAK: 'Innings break',
    FOLLOW_ON_DECISION: 'Follow-on decision', COMPLETED: 'Completed',
    ABANDONED: 'Abandoned', NO_RESULT: 'No result', WALKOVER: 'Walkover', CANCELLED: 'Cancelled',
  };
  return { label: labels[status] ?? 'Status unavailable', live: status === 'IN_PROGRESS' || status === 'LIVE',
    terminal: ['COMPLETED', 'ABANDONED', 'NO_RESULT', 'WALKOVER', 'CANCELLED'].includes(status) };
}

export function tournamentStatus(status: string): StatusPresentation {
  return { label: status === 'ACTIVE' ? 'In progress' : status === 'COMPLETED' ? 'Completed' : 'Status unavailable',
    live: false, terminal: status === 'COMPLETED' };
}

export function connectionLabel(status: 'PENDING' | 'SYNCING' | 'LIVE' | 'ERROR'): string {
  return { PENDING: 'Saved on this device', SYNCING: 'Syncing', LIVE: 'Synced', ERROR: 'Sync needs attention' }[status];
}
