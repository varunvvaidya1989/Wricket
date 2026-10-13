import { svgDataUri } from '@/lib/wricket/presentation/svg';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/wricket/ui/Text';
import { fonts } from '@/lib/wricket/presentation/design';

export type PadAction =
  | { kind: 'RUNS'; runs: 0 | 1 | 2 | 3 | 4 | 6 }
  | { kind: 'WICKET' }
  | { kind: 'UNDO' };

export interface GesturePadProps {
  onAction: (action: PadAction) => void;
  disabled?: boolean;
  onInteractionChange?: (active: boolean) => void;
}
const SWIPE_THRESHOLD = 40;
const field = svgDataUri('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="130"><defs><pattern id="p" width="84" height="130" patternUnits="userSpaceOnUse"><path fill="#223a26" d="M0 0h42v130H0z"/><path fill="#253e29" d="M42 0h42v130H42z"/></pattern></defs><path fill="url(#p)" d="M0 0h400v130H0z"/></svg>');

export function GesturePad({ onAction, disabled, onInteractionChange }: GesturePadProps) {
  // Recognition is only an input. The shared command owns saved feedback.
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [holdReady, setHoldReady] = useState(false);
  const progress = useSharedValue(0);
  const canRecord = useRef(false);
  canRecord.current = !disabled && active;
  const enabled = !disabled && active;
  const progressStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      canRecord.current = state === 'active' && !disabled;
      setActive(state === 'active');
      if (state !== 'active') { cancelAnimation(progress); progress.value = 0; setHoldReady(false); onInteractionChange?.(false); }
    });
    return () => listener.remove();
  }, [disabled, onInteractionChange, progress]);
  useEffect(() => {
    if (!enabled) { cancelAnimation(progress); progress.value = 0; setHoldReady(false); }
  }, [enabled, progress]);
  const fire = (action: PadAction) => { if (canRecord.current) onAction(action); };
  const tap = Gesture.Tap().enabled(enabled).runOnJS(true)
    .maxDuration(220)
    .numberOfTaps(1)
    .onEnd((_, success) => {
      if (success) fire({ kind: 'RUNS', runs: 0 });
    });

  const doubleTap = Gesture.Tap().enabled(enabled).runOnJS(true)
    .numberOfTaps(2)
    .onEnd((_, success) => {
      if (success) fire({ kind: 'RUNS', runs: 4 });
    });

  const longPress = Gesture.LongPress().enabled(enabled).runOnJS(true)
    .minDuration(450)
    .maxDistance(12)
    .onBegin(() => { progress.value = withTiming(1, { duration: 450 }); })
    .onStart(() => { setHoldReady(true); })
    .onEnd((_, success) => {
      if (success) fire({ kind: 'RUNS', runs: 6 });
    })
    .onFinalize(() => {
      cancelAnimation(progress); progress.value = 0; setHoldReady(false);
    });

  const twoFinger = Gesture.Tap().enabled(enabled).runOnJS(true)
    .numberOfTaps(1)
    .minPointers(2)
    .onEnd((_, success) => {
      if (success) fire({ kind: 'UNDO' });
    });

  const pan = Gesture.Pan().enabled(enabled).runOnJS(true).maxPointers(1)
    .minDistance(SWIPE_THRESHOLD)
    .onEnd((e, success) => {
      if (!success) return;
      const dx = e.translationX;
      const dy = e.translationY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // 8-direction
      if (absY > absX) {
        if (dy < 0) {
          // up
          if (absX > absY * 0.5 && dx > 0) {
            fire({ kind: 'RUNS', runs: 2 });
          } else {
            fire({ kind: 'RUNS', runs: 1 });
          }
        } else {
          // down → wicket
          fire({ kind: 'WICKET' });
        }
      } else {
        if (dx > 0) {
          // right
          if (absY > absX * 0.5 && dy < 0) {
            fire({ kind: 'RUNS', runs: 2 });
          } else {
            fire({ kind: 'RUNS', runs: 3 });
          }
        } else {
          // left → four
          fire({ kind: 'RUNS', runs: 4 });
        }
      }
    });

  // doubleTap must beat tap; longPress must beat tap
  const composed = Gesture.Race(longPress, pan, Gesture.Exclusive(twoFinger, doubleTap, tap));


  return <GestureDetector gesture={composed}>
    <View testID="gesture-pad" style={[styles.pad, disabled && { opacity: 0.4 }]}
      onTouchStart={() => onInteractionChange?.(true)} onTouchEnd={() => onInteractionChange?.(false)} onTouchCancel={() => onInteractionChange?.(false)}>
      <Image pointerEvents="none" source={{ uri: field }} contentFit="fill" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.boundary}><View style={styles.innerBoundary} /></View>
      <Text style={[styles.cue, { top: 10, left: '48%' }]}>↑ 1</Text>
      <Text style={[styles.cue, { top: 14, right: 30 }]}>↗ 2</Text>
      <Text style={[styles.cue, { left: 13, top: 55 }]}>4 ←</Text>
      <Text style={[styles.cue, { right: 13, top: 55 }]}>→ 3</Text>
      <View pointerEvents="none" style={{ alignItems: 'center' }}>
        <Text style={styles.title}>Tap · 0</Text><Text style={styles.caption}>{holdReady ? 'RELEASE TO RECORD 6' : 'DOUBLE TAP 4 · HOLD 6'}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[styles.holdProgress, progressStyle]} />
      <Text style={[styles.cue, { bottom: 9 }]}>↓ Wicket</Text>
    </View>
  </GestureDetector>;
}
const styles = StyleSheet.create({
  holdProgress: { position: 'absolute', bottom: 0, width: '100%', height: 3, backgroundColor: '#a6f477' },
  pad: { width: '100%', height: '100%', overflow: 'hidden', borderWidth: 1, borderColor: '#597348', borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#223a26' },
  boundary: { position: 'absolute', width: '85%', height: '135%', borderRadius: 999, borderWidth: 1, borderColor: '#8cab6e60', padding: 20 },
  innerBoundary: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: '#8cab6e30' },
  cue: { position: 'absolute', fontFamily: fonts.mono, fontSize: 11, color: '#d4e6c7' },
  title: { fontFamily: fonts.display, fontSize: 21, color: '#eef8e5' },
  caption: { fontFamily: fonts.mono, fontSize: 7, letterSpacing: 0.35, color: '#bfd5af', marginTop: 5 },
});
