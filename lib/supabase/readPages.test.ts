import { describe, expect, it } from 'vitest';
import { readIdChunks, readPages } from './readPages';

describe('large tournament reads', () => {
  it('retains all 2016 fixtures beyond the backend row limit', async () => {
    const fixtures = Array.from({ length: 2016 }, (_, id) => ({ id }));
    const ranges: number[][] = [];
    const result = await readPages(async (start, end) => {
      ranges.push([start, end]);
      return { data: fixtures.slice(start, end + 1), error: null };
    });
    expect(result).toEqual(fixtures);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('never returns silently truncated data after a later page fails', async () => {
    await expect(readPages(async start => start === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => id), error: null }
      : { data: null, error: { message: 'Network unavailable' } })).rejects.toThrow('Network unavailable');
  });

  it('bounds filters and deduplicates IDs without losing the final batch', async () => {
    const ids = Array.from({ length: 1001 }, (_, id) => String(id));
    const lengths: number[] = [];
    const result = await readIdChunks([...ids, ids[0]], async chunk => {
      lengths.push(chunk.length);
      return chunk;
    });
    expect(result).toEqual(ids);
    expect(lengths).toEqual([...Array(10).fill(100), 1]);
    expect(await readIdChunks([], async () => { throw new Error('Empty query'); })).toEqual([]);
  });
});
