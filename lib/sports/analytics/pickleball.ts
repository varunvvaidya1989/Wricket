import type { AnalyticsModule } from './types';
export const pickleballAnalytics: AnalyticsModule = {
  sportId: 'pickleball', focus: 'Side-out efficiency, kitchen play and transition attacks',
  strokes: ['Dink', 'Drop', 'Drive', 'Volley', 'Lob', 'Overhead', 'Serve'],
  zones: ['Baseline', 'Transition', 'Kitchen line'], shortRally: 4, longRally: 10,
  signature: [{ label: 'Dink finishes', stroke: 'Dink' }, { label: 'Drop finishes', stroke: 'Drop' }, { label: 'Faults conceded', outcome: 'FAULT' }],
};
