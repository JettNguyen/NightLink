import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.nightlink',
  appName: 'nightlink',
  webDir: 'dist',
  ios: {
    backgroundColor: '#0e0a14',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#17112b',
      showSpinner: false,
    },
  },
};

export default config;
