export const palette = {
  black: '#080B09',
  ink900: '#0A0C0B',
  ink800: '#1B211C',
  ink700: '#171C18',
  ink600: '#242B25',
  ink500: '#343D36',
  ink400: '#4D5850',
  ink300: '#5C6660',
  ink200: '#8C978E',
  ink100: '#CDD2CE',
  ink50: '#EEF1EE',
  white: '#EEF2ED',

  // Brand accents
  pitch: '#5FE38A',
  pitchDeep: '#36A961',
  willow: '#E8C468',
  six: '#FF6A3D',
  wicket: '#E0394B',
  boundary: '#3DD9D6',

  // Team palette (user picks from these at setup)
  team: [
    '#FF6A3D',
    '#3DD9D6',
    '#7CE07C',
    '#E8C77A',
    '#B785FF',
    '#FF85C0',
    '#5B8DEF',
    '#E0394B',
  ],
} as const;

export const colors = {
  bg: palette.ink900,
  surface: palette.ink800,
  surfaceElevated: palette.ink700,
  border: palette.ink600,
  borderStrong: palette.ink500,

  text: palette.white,
  textMuted: palette.ink200,
  textDim: palette.ink300,

  accent: palette.pitch,
  accentInk: palette.black,
  accentMuted: 'rgba(95, 227, 138, 0.12)',
  gold: palette.willow,
  goldMuted: 'rgba(232, 196, 104, 0.12)',
  live: '#FF5D68',

  boundary: palette.boundary,
  six: palette.six,
  wicket: palette.wicket,
  extra: palette.willow,

  success: palette.pitch,
  danger: palette.wicket,
} as const;

export type Colors = typeof colors;
