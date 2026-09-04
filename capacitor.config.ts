import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.taylz.qq',
  appName: 'qq Quotes',
  webDir: 'build',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'qq',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for capacitor sqlite',
      },
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for capacitor sqlite',
        biometricSubTitle: 'Log in using your biometric',
      },
      // electronIsEncryption: true,
      // electronWindowsLocation: 'C:\\ProgramData\\CapacitorDatabases',
      // electronMacLocation: '/Volumes/Development_Lacie/Development/Databases',
      // electronLinuxLocation: 'Databases',
    },
  },
}

export default config
