import { describe, expect, it } from 'vitest';
import { svgDataUri } from './svg';

describe('portable SVG artwork', () => {
  it('preserves paths, colours, Unicode and reserved URL characters in the native base64 payload', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>नदी &amp; Cricket</text><path fill="#a6f477" d="M0 0h24v24H0z"/></svg>';
    const uri = svgDataUri(svg);
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(Buffer.from(uri.split(',')[1], 'base64').toString('utf8')).toBe(svg);
  });
});
