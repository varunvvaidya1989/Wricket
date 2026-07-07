import { Platform, TextStyle } from 'react-native';

const family = Platform.select({
  ios: { sans: 'System', mono: 'Menlo' },
  android: { sans: 'sans-serif', mono: 'monospace' },
  default: { sans: 'System', mono: 'monospace' },
})!;

export const typography = {
  scoreXL: {
    fontFamily: family.sans,
    fontSize: 72,
    fontWeight: '800',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  scoreLg: {
    fontFamily: family.sans,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  scoreMd: {
    fontFamily: family.sans,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
  h1: {
    fontFamily: family.sans,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  } satisfies TextStyle,
  h2: {
    fontFamily: family.sans,
    fontSize: 22,
    fontWeight: '700',
  } satisfies TextStyle,
  h3: {
    fontFamily: family.sans,
    fontSize: 17,
    fontWeight: '600',
  } satisfies TextStyle,
  body: {
    fontFamily: family.sans,
    fontSize: 15,
    fontWeight: '400',
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: family.sans,
    fontSize: 15,
    fontWeight: '600',
  } satisfies TextStyle,
  caption: {
    fontFamily: family.sans,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
  } satisfies TextStyle,
  overline: {
    fontFamily: family.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  } satisfies TextStyle,
  mono: {
    fontFamily: family.mono,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  } satisfies TextStyle,
} as const;

export type Typography = typeof typography;
