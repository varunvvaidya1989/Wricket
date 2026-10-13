import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export async function capturePoster(view: View, width: number, height: number): Promise<string> {
  return captureRef(view, { format: 'png', quality: 1, width, height, result: 'tmpfile' });
}
