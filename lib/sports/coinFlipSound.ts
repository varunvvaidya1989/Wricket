export function createCoinFlipSoundUri(): string {
  const sampleRate = 8000;
  const duration = 2.2;
  const sampleCount = Math.floor(sampleRate * duration);
  const pcm = new Int16Array(sampleCount);
  const ticks = [0, 0.16, 0.31, 0.45, 0.59, 0.74, 0.9, 1.08, 1.28, 1.5, 1.75, 2.02];
  for (const tick of ticks) {
    const start = Math.floor(tick * sampleRate);
    const burst = tick > 2 ? 0.16 : 0.055;
    const frequency = tick > 2 ? 620 : 980 - tick * 170;
    for (let offset = 0; offset < burst * sampleRate && start + offset < sampleCount; offset += 1) {
      const envelope = Math.exp(-offset / (sampleRate * (tick > 2 ? 0.055 : 0.016)));
      pcm[start + offset] += Math.round(Math.sin((2 * Math.PI * frequency * offset) / sampleRate) * envelope * 15000);
    }
  }
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, 'RIFF'); view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeAscii(view, 36, 'data'); view.setUint32(40, pcm.byteLength, true);
  for (let index = 0; index < pcm.length; index += 1) view.setInt16(44 + index * 2, pcm[index], true);
  let binary = '';
  for (let start = 0; start < bytes.length; start += 4096) binary += String.fromCharCode(...bytes.subarray(start, start + 4096));
  return `data:audio/wav;base64,${globalThis.btoa(binary)}`;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}
