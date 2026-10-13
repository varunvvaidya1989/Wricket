import type { ImageSourcePropType } from 'react-native';

// Bundled photos keep cards available offline and avoid runtime third-party requests.
export const sportCardPhotos: Readonly<Record<string, ImageSourcePropType>> = {
  CRICKET: require('@/assets/sportstage/sports/cricket.jpg'),
  BADMINTON: require('@/assets/sportstage/sports/badminton.jpg'),
  TENNIS: require('@/assets/sportstage/sports/tennis.jpg'),
  PADEL: require('@/assets/sportstage/sports/padel.jpg'),
  TABLE_TENNIS: require('@/assets/sportstage/sports/table-tennis.jpg'),
  PICKLEBALL: require('@/assets/sportstage/sports/pickleball.jpg'),
};
