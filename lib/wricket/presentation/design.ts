import type { TextStyle } from 'react-native';
import { colors as baseColors, palette } from '@/lib/theme/colors';
export { palette };

// Source of truth: docs/UI Designs/wricket-revamp/styles.css.
// The bundled design TTFs are byte-identical to these installed font faces.
export const colors = { ...baseColors, bg: '#0b100e', surface: '#151c18', surfaceElevated: '#1d2620',
  border: '#2a352e', borderStrong: '#39493b', text: '#f0f4ef', textMuted: '#a1afa4', textDim: '#77877d',
  accent: '#a6f477', accentInk: '#15210f', accentMuted: '#243c22', gold: '#efcb7a', danger: '#ff9d91', live: '#a6f477' };
export const fonts = { display: 'SpaceGrotesk_600SemiBold', body: 'Inter_400Regular', mono: 'IBMPlexMono_500Medium' };
export const typography = {
  scoreXL: { fontFamily: fonts.mono, fontSize: 52, lineHeight: 57, letterSpacing: -2 },
  scoreLg: { fontFamily: fonts.mono, fontSize: 38, lineHeight: 42, letterSpacing: -1 },
  scoreMd: { fontFamily: fonts.mono, fontSize: 23, lineHeight: 30, letterSpacing: -1 },
  h1: { fontFamily: fonts.display, fontSize: 27, lineHeight: 30.51, letterSpacing: -0.7 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  h3: { fontFamily: fonts.display, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.display, fontSize: 13, lineHeight: 18.2 },
  caption: { fontFamily: fonts.body, fontSize: 11, lineHeight: 17.6 },
  overline: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 13.5, letterSpacing: 1.1, textTransform: 'uppercase' },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;
