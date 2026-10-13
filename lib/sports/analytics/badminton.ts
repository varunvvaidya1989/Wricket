import type { AnalyticsModule } from './types';
export const badmintonAnalytics: AnalyticsModule = {
  sportId: 'badminton', focus: 'Attack conversion, net play and long-rally endurance',
  strokes: ['Smash', 'Clear', 'Drop', 'Drive', 'Net shot', 'Lift', 'Serve'],
  zones: ['Front court', 'Mid-court', 'Rear court'], shortRally: 4, longRally: 12,
  signature: [{ label: 'Smash winners', outcome: 'SMASH_WINNER' }, { label: 'Net finishes', stroke: 'Net shot' }, { label: 'Service faults', outcome: 'SERVICE_FAULT' }],
};
