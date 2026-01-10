import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mediqom.app',
  appName: 'Mediqom',
  webDir: 'mobile/dist',
  bundledWebRuntime: false,

  server: {
    // For development with live reload, uncomment and set your local IP:
    // url: 'http://192.168.x.x:5174',
    // cleartext: true,

    // Production settings
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      spinnerColor: '#3880ff',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
  },

  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    // Deep link scheme configured in Info.plist
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Deep link scheme configured in AndroidManifest.xml
  },
};

export default config;
