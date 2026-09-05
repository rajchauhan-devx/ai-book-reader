import React from 'react';
import {ActivityIndicator, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppNavigator} from './src/navigation/AppNavigator';
import {AppThemeProvider, useAppTheme} from './src/theme/ThemeProvider';
import {AppBootstrapProvider, useAppBootstrap} from './src/state/AppBootstrapProvider';
import {FirstLaunchScreen} from './src/screens/FirstLaunchScreen';
import {typography} from './src/theme/tokens';
import {ModelDownloadProvider} from './src/state/ModelDownloadProvider';
import {NarrationEngineProvider} from './src/state/NarrationEngineProvider';
import {NarrationPlayerProvider} from './src/state/NarrationPlayerProvider';
import {LibraryProvider} from './src/state/LibraryProvider';

function App() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <ModelDownloadProvider>
          <NarrationEngineProvider>
            <NarrationPlayerProvider>
              <LibraryProvider>
                <AppBootstrapProvider>
                  <AppContent />
                </AppBootstrapProvider>
              </LibraryProvider>
            </NarrationPlayerProvider>
          </NarrationEngineProvider>
        </ModelDownloadProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const {colors, isDark} = useAppTheme();
  const {ready, hasCompletedOnboarding, completeOnboarding} = useAppBootstrap();

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />
      {!ready ? (
        <View style={[styles.loading, {backgroundColor: colors.canvas}]}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[styles.loadingText, {color: colors.inkMuted}]}>Opening your library…</Text>
        </View>
      ) : !hasCompletedOnboarding ? (
        <FirstLaunchScreen onContinue={completeOnboarding} />
      ) : (
        <AppNavigator />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  loadingText: typography.small,
});

export default App;
