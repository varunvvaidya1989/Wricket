import { describe, expect, it } from 'vitest';

import app from '../../app.json';
import dependencies from '../../package.json';
import { AdPrivacyOptions } from '../../components/ads/AdPrivacyOptions.native';
import { SportStageBannerAd } from '../../components/ads/SportStageBannerAd.native';

describe('ad-free adult/youth release configuration', () => {
  it('excludes the native advertising dependency and Expo plugin', () => {
    expect(dependencies.dependencies).not.toHaveProperty('react-native-google-mobile-ads');
    expect(app.expo.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads')).toBe(false);
  });

  it('native ad entry points render nothing without loading an advertising SDK', () => {
    expect(SportStageBannerAd()).toBeNull();
    expect(AdPrivacyOptions()).toBeNull();
  });
});
