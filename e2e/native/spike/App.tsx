import React, { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GesturePad, type PadAction } from '../../../components/wricket/scoring/GesturePad';

// Exercises the production recognizer without auth, persistence, or network clients.
export default function App() {
  const [actions, setActions] = useState<PadAction[]>([]);
  const [disabled, setDisabled] = useState(false);
  return <GestureHandlerRootView style={styles.root}>
    <Text style={styles.text}>Wricket recognizer baseline</Text>
    <Text style={styles.text}>Recognized input only; no score is saved.</Text>
    <View style={styles.pad}><GesturePad disabled={disabled} onAction={action => {
      console.log(`WRICKET_GESTURE ${JSON.stringify(action)}`);
      setActions(previous => [...previous, action]);
    }} /></View>
    <Text testID="gesture-events" accessibilityLabel={`Events ${JSON.stringify(actions)}`} style={styles.text}>
      Events {JSON.stringify(actions)}
    </Text>
    <Button title="Clear events" onPress={() => setActions([])} />
    <Button title={disabled ? 'Enable pad' : 'Disable pad'} onPress={() => setDisabled(value => !value)} />
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101820', padding: 24, paddingTop: 60, gap: 16 },
  pad: { height: 320 },
  text: { color: '#fff', fontSize: 16 },
});
