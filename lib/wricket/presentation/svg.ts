import { fromByteArray } from 'base64-js';

// expo-image's Android data-URL loader always decodes the payload as base64.
// Percent-encoded SVGs work on web but silently omit artwork on Android.
export function svgDataUri(svg: string): string {
  const bytes = encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return 'data:image/svg+xml;base64,' + fromByteArray(Uint8Array.from(bytes, character => character.charCodeAt(0)));
}
