import type { AnalyticsModule } from './types';
export const tennisAnalytics: AnalyticsModule = {
  sportId: 'tennis', focus: 'Serve dominance, return pressure and baseline efficiency',
  strokes: ['Forehand', 'Backhand', 'Volley', 'Overhead', 'Drop shot', 'Lob', 'Serve'],
  zones: ['Baseline', 'Mid-court', 'Net'], shortRally: 4, longRally: 9,
  signature: [{ label: 'Aces', outcome: 'ACE' }, { label: 'Double faults', outcome: 'DOUBLE_FAULT' }, { label: 'Volley finishes', stroke: 'Volley' }],
};
