import { describe, expect, it, vi } from 'vitest';
import { createScoringGate, restoredInputMode } from './scoringInput';

describe('scoring input command gate', () => {
  it('rejects an overlapping command but accepts the next identical delivery', async () => {
    const gate = createScoringGate();
    let release!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const first = gate.run(save);
    expect(await gate.run(save)).toEqual({ accepted: false });
    expect(save).toHaveBeenCalledOnce();
    release();
    expect(await first).toEqual({ accepted: true, value: undefined });
    const next = gate.run(save);
    release();
    await next;
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('propagates a failed write and releases the gate', async () => {
    const gate = createScoringGate();
    await expect(gate.run(async () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
    expect(gate.busy).toBe(false);
    expect(await gate.run(async () => 'saved')).toEqual({ accepted: true, value: 'saved' });
  });

  it('defaults invalid or missing preferences to accessible numeric entry', () => {
    expect(restoredInputMode(null)).toBe('numbers');
    expect(restoredInputMode('old-mode')).toBe('numbers');
    expect(restoredInputMode('gestures')).toBe('gestures');
  });
});
