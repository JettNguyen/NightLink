import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.nightlink',
  appName: 'nightlink',
  webDir: 'dist',
  ios: {
    backgroundColor: '#05070f',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#0b1021',
      showSpinner: false,
    },
  },
};

export default config;
