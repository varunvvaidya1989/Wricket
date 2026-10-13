import html2canvas from 'html2canvas';
import type { View } from 'react-native';

export async function capturePoster(view: View, width: number, height: number): Promise<string> {
  const element = view as unknown as HTMLElement;
  await document.fonts.ready;
  const canvas = await html2canvas(element, { backgroundColor: '#0b100e', useCORS: true, logging: false,
    scale: width / Math.max(1, element.getBoundingClientRect().width) });
  const exported = document.createElement('canvas');
  exported.width = width;
  exported.height = height;
  const context = exported.getContext('2d');
  if (!context) throw new Error('Image export is unavailable in this browser');
  context.drawImage(canvas, 0, 0, width, height);
  return exported.toDataURL('image/png');
}
