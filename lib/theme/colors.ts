export const palette = {
  black: '#0A0A0B',
  ink900: '#0E1014',
  ink800: '#15181E',
  ink700: '#1C1F26',
  ink600: '#262932',
  ink500: '#363A45',
  ink400: '#4B4F5C',
  ink300: '#6B6F7A',
  ink200: '#9498A2',
  ink100: '#C4C7CE',
  ink50: '#E8EAEF',
  white: '#FFFFFF',

  // Brand accents
  pitch: '#7CE07C',
  pitchDeep: '#4FB54F',
  willow: '#E8C77A',
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

  boundary: palette.boundary,
  six: palette.six,
  wicket: palette.wicket,
  extra: palette.willow,

  success: palette.pitch,
  danger: palette.wicket,
} as const;

export type Colors = typeof colors;
