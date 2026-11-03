import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leadjin.app',
  appName: 'LeadJin',
  webDir: 'dist',
  server: {
    // USER MUST REPLACE WITH THEIR LAN IP (run get-lan-ip.bat)
    url: 'http://192.168.1.18:3001',
    cleartext: true,
    androidScheme: 'http'
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  }
};

export default config;
