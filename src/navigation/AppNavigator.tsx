import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Bookmark, Home, Library, Settings } from 'lucide-react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { BookmarksScreen } from '../screens/BookmarksScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ModelSetupScreen } from '../screens/ModelSetupScreen';
import { ImportBookScreen } from '../screens/ImportBookScreen';
import { BookDetailsScreen } from '../screens/BookDetailsScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { TextPreviewScreen } from '../screens/TextPreviewScreen';
import { StorageScreen } from '../screens/StorageScreen';
import { BackupRestoreScreen } from '../screens/BackupRestoreScreen';
import { PrivacyAboutScreen } from '../screens/PrivacyAboutScreen';
import { MiniPlayer } from '../components/MiniPlayer';
import { useAppTheme } from '../theme/ThemeProvider';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = { color: string; size: number };

function HomeTabIcon({ color, size }: TabIconProps) {
  return <Home size={size} color={color} strokeWidth={2.1} />;
}

function LibraryTabIcon({ color, size }: TabIconProps) {
  return <Library size={size} color={color} strokeWidth={2.1} />;
}

function BookmarksTabIcon({ color, size }: TabIconProps) {
  return <Bookmark size={size} color={color} strokeWidth={2.1} />;
}

function SettingsTabIcon({ color, size }: TabIconProps) {
  return <Settings size={size} color={color} strokeWidth={2.1} />;
}

function MainTabs() {
  const { colors } = useAppTheme();

  return (
    <View style={styles.flex}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.inkMuted,
          tabBarStyle: {
            height: 72,
            paddingTop: 8,
            paddingBottom: 8,
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="Home"
          component={HomeScreen}
          options={{ tabBarIcon: HomeTabIcon }}
        />
        <Tabs.Screen
          name="Library"
          component={LibraryScreen}
          options={{ tabBarIcon: LibraryTabIcon }}
        />
        <Tabs.Screen
          name="Bookmarks"
          component={BookmarksScreen}
          options={{ tabBarIcon: BookmarksTabIcon }}
        />
        <Tabs.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ tabBarIcon: SettingsTabIcon }}
        />
      </Tabs.Navigator>
      <View style={styles.miniPlayer} pointerEvents="box-none">
        <MiniPlayer />
      </View>
    </View>
  );
}

export function AppNavigator() {
  const { colors, isDark } = useAppTheme();
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.brand,
      background: colors.canvas,
      card: colors.surface,
      text: colors.ink,
      border: colors.border,
      notification: colors.listen,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.canvas },
          headerTitleStyle: { fontSize: 17, fontWeight: '700' },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ModelSetup"
          component={ModelSetupScreen}
          options={{ title: 'Voice model' }}
        />
        <Stack.Screen
          name="ImportBook"
          component={ImportBookScreen}
          options={{ title: 'Import book', presentation: 'modal' }}
        />
        <Stack.Screen
          name="BookDetails"
          component={BookDetailsScreen}
          options={{ title: 'Book details' }}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TextPreview"
          component={TextPreviewScreen}
          options={{ title: 'Prepared text' }}
        />
        <Stack.Screen
          name="Storage"
          component={StorageScreen}
          options={{ title: 'Storage manager' }}
        />
        <Stack.Screen
          name="BackupRestore"
          component={BackupRestoreScreen}
          options={{ title: 'Backup & restore' }}
        />
        <Stack.Screen
          name="PrivacyAbout"
          component={PrivacyAboutScreen}
          options={{ title: 'Privacy & about' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  miniPlayer: { position: 'absolute', left: 0, right: 0, bottom: 72 },
});
