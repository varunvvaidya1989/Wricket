import { TextStyle } from 'react-native';

const font = {
  displayRegular: 'SpaceGrotesk_400Regular',
  displaySemiBold: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_700Bold',
} as const;

export const typography = {
  scoreXL: { fontFamily: font.displayBold, fontSize: 72, letterSpacing: -2, fontVariant: ['tabular-nums'] } satisfies TextStyle,
  scoreLg: { fontFamily: font.displayBold, fontSize: 48, letterSpacing: -1, fontVariant: ['tabular-nums'] } satisfies TextStyle,
  scoreMd: { fontFamily: font.displayBold, fontSize: 28, fontVariant: ['tabular-nums'] } satisfies TextStyle,
  h1: { fontFamily: font.displayBold, fontSize: 26, letterSpacing: -0.5 } satisfies TextStyle,
  h2: { fontFamily: font.displayBold, fontSize: 20 } satisfies TextStyle,
  h3: { fontFamily: font.displaySemiBold, fontSize: 17 } satisfies TextStyle,
  body: { fontFamily: font.bodyRegular, fontSize: 15 } satisfies TextStyle,
  bodyStrong: { fontFamily: font.bodySemiBold, fontSize: 15 } satisfies TextStyle,
  caption: { fontFamily: font.monoMedium, fontSize: 12, letterSpacing: 0.25 } satisfies TextStyle,
  overline: { fontFamily: font.monoBold, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' as const } satisfies TextStyle,
  mono: { fontFamily: font.monoRegular, fontSize: 14, fontVariant: ['tabular-nums'] } satisfies TextStyle,
} as const;

export type Typography = typeof typography;
