module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|@react-native(-community)?|@react-native-async-storage|@react-navigation)/|lucide-react-native)',
  ],
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/test-mocks/lucide.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/test-mocks/asyncStorage.js',
  },
  testTimeout: 15000,
};
