import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  Accessibility,
  BookOpenText,
  ChevronRight,
  Database,
  Gauge,
  HardDrive,
  Info,
  Moon,
  PlayCircle,
  Smartphone,
  Sparkles,
  Sun,
  Volume2,
} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Screen} from '../components/Screen';
import {useAppTheme} from '../theme/ThemeProvider';
import {radius, spacing, typography, ThemePreference} from '../theme/tokens';
import type {RootStackParamList} from '../types/navigation';
import {useModelDownload} from '../state/ModelDownloadProvider';
import {useNarrationEngine} from '../state/NarrationEngineProvider';
import type {PerformanceMode} from '../services/narrationEngine';
import {formatDownloadBytes} from '../services/modelDownload';
import {VoicePickerModal} from '../components/VoicePickerModal';
import {narrationPipelineService} from '../services/narrationPipeline';
import {kokoroTtsService} from '../services/kokoroTtsService';

const rows: {
  icon: any;
  title: string;
  subtitle: string;
  route?: keyof RootStackParamList;
  action?: 'voicePicker';
}[] = [
  {icon: PlayCircle, title: 'Playback', subtitle: 'Voice, speed, expression & skip duration', action: 'voicePicker'},
  {icon: BookOpenText, title: 'Reading', subtitle: 'Font, spacing, sentence highlight'},
  {icon: Accessibility, title: 'Accessibility', subtitle: 'Contrast, motion and larger controls'},
  {icon: Database, title: 'Backup & restore', subtitle: 'Export your private local library', route: 'BackupRestore'},
  {icon: Info, title: 'Privacy & about', subtitle: 'Local processing and licenses', route: 'PrivacyAbout'},
];

export function SettingsScreen() {
  const {colors, preference, setPreference} = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {status: modelStatus} = useModelDownload();
  const {status: voiceStatus, setPerformanceMode} = useNarrationEngine();

  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [currentVoiceName, setCurrentVoiceName] = useState<string>('Heart (Flagship Expressive Narrator)');

  const loadEngineStatus = useCallback(async () => {
    try {
      const prefs = await narrationPipelineService.getPreferences();
      const profile = kokoroTtsService.getVoiceById(prefs.voiceId);
      setCurrentVoiceName(profile?.name ?? 'Heart (Flagship Expressive Narrator)');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEngineStatus();
    const unsubscribe = navigation.addListener?.('focus', () => {
      loadEngineStatus();
    });
    return unsubscribe;
  }, [navigation, loadEngineStatus]);

  const themes: {value: ThemePreference; label: string; icon: typeof Sun}[] = [
    {value: 'system', label: 'System', icon: Smartphone},
    {value: 'light', label: 'Light', icon: Sun},
    {value: 'dark', label: 'Dark', icon: Moon},
  ];
  const modes: {value: PerformanceMode; label: string; detail: string}[] = [
    {value: 'battery', label: 'Battery', detail: 'Cooler'},
    {value: 'balanced', label: 'Balanced', detail: 'Recommended'},
    {value: 'quality', label: 'Quality', detail: 'More detail'},
  ];

  return (
    <Screen contentStyle={styles.content}>
      <Text style={[styles.eyebrow, {color: colors.brand}]}>MAKE IT YOURS</Text>
      <Text style={[styles.pageTitle, {color: colors.ink}]}>Settings</Text>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>APPEARANCE</Text>
      <View style={[styles.themeCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        {themes.map(theme => {
          const Icon = theme.icon;
          const selected = preference === theme.value;
          return (
            <Pressable
              key={theme.value}
              accessibilityRole="radio"
              accessibilityState={{selected}}
              onPress={() => setPreference(theme.value)}
              style={[
                styles.themeOption,
                selected && {backgroundColor: colors.brandSoft},
              ]}>
              <Icon size={20} color={selected ? colors.brand : colors.inkMuted} />
              <Text style={[styles.themeText, {color: selected ? colors.brand : colors.ink}]}>
                {theme.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>KOKORO NEURAL VOICE</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Kokoro Voice configuration"
        onPress={() => setShowVoicePicker(true)}
        style={({pressed}) => [
          styles.modelRow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.76 : 1,
            marginBottom: spacing.md,
          },
        ]}>
        <View style={[styles.rowIcon, {backgroundColor: colors.brandSoft}]}>
          <Sparkles size={20} color={colors.brand} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, {color: colors.ink}]}>
            Kokoro AI (100% Offline)
          </Text>
          <Text style={[styles.rowSubtitle, {color: colors.inkMuted}]}>
            Voice: {currentVoiceName} · On-device neural speech
          </Text>
        </View>
        <ChevronRight size={20} color={colors.inkMuted} />
      </Pressable>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>MODEL SETUP & DIAGNOSTICS</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('ModelSetup')}
        style={({pressed}) => [
          styles.modelRow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.76 : 1,
          },
        ]}>
        <View style={[styles.rowIcon, {backgroundColor: colors.brandSoft}]}>
          <Gauge size={20} color={colors.brand} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, {color: colors.ink}]}>Kokoro Model & Voice Test</Text>
          <Text style={[styles.rowSubtitle, {color: colors.inkMuted}]}>
            {modelStatus.state === 'ready'
              ? 'Kokoro-82M Installed · Tap to test your narrator'
              : modelStatus.state === 'downloading'
                ? `Downloading Kokoro model ${Math.round(modelStatus.progress * 100)}%`
                : 'Set up the offline Kokoro neural voice'}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.inkMuted} />
      </Pressable>

      <View style={[styles.modeCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Text style={[styles.modeTitle, {color: colors.ink}]}>Performance Mode</Text>
        <Text style={[styles.modeBody, {color: colors.inkMuted}]}>
          Balanced works best for most phones. A mode change applies to the next sentence.
        </Text>
        <View style={[styles.modeOptions, {backgroundColor: colors.surfaceMuted}]}>
          {modes.map(mode => {
            const selected = voiceStatus.performanceMode === mode.value;
            return (
              <Pressable
                key={mode.value}
                accessibilityRole="radio"
                accessibilityState={{selected}}
                onPress={() => setPerformanceMode(mode.value)}
                style={[
                  styles.modeOption,
                  selected && {backgroundColor: colors.brand},
                ]}>
                <Text style={[styles.modeLabel, {color: selected ? colors.white : colors.ink}]}>
                  {mode.label}
                </Text>
                <Text
                  style={[
                    styles.modeDetail,
                    {color: colors.inkMuted},
                    selected && styles.modeDetailSelected,
                  ]}>
                  {mode.detail}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>PREFERENCES</Text>
      <View style={[styles.list, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        {rows.map((row, index) => {
          const Icon = row.icon;
          return (
            <Pressable
              key={row.title}
              accessibilityRole="button"
              onPress={() => {
                if (row.action === 'voicePicker') {
                  setShowVoicePicker(true);
                } else if (row.route) {
                  navigation.navigate(row.route as any);
                }
              }}
              style={({pressed}) => [
                styles.row,
                index < rows.length - 1 && {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border},
                {opacity: pressed ? 0.72 : 1},
              ]}>
              <View style={[styles.rowIcon, {backgroundColor: colors.surfaceMuted}]}>
                <Icon size={20} color={colors.brand} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, {color: colors.ink}]}>{row.title}</Text>
                <Text style={[styles.rowSubtitle, {color: colors.inkMuted}]}>{row.subtitle}</Text>
              </View>
              <ChevronRight size={20} color={colors.inkMuted} />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Storage')}
        style={({pressed}) => [
          styles.storage,
          {
            backgroundColor: colors.brand,
            opacity: pressed ? 0.88 : 1,
          },
        ]}>
        <HardDrive size={25} color={colors.white} />
        <View style={styles.rowCopy}>
          <Text style={styles.storageTitle}>Storage manager</Text>
          <Text style={styles.storageSubtitle}>
            {modelStatus.state === 'ready'
              ? `${formatDownloadBytes(modelStatus.totalBytes)} Kokoro voice model installed`
              : 'Manage voice files and generated audio'}
          </Text>
        </View>
        <ChevronRight size={21} color={colors.white} />
      </Pressable>

      <Text style={[styles.version, {color: colors.inkMuted}]}>AI Book Reader · Kokoro Neural AI (Offline)</Text>

      <VoicePickerModal
        visible={showVoicePicker}
        onClose={() => {
          setShowVoicePicker(false);
          loadEngineStatus();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {padding: spacing.lg, paddingBottom: 170},
  eyebrow: {...typography.small, fontWeight: '800', letterSpacing: 1.5},
  pageTitle: typography.pageTitle,
  sectionLabel: {...typography.small, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginTop: spacing.xl, marginBottom: spacing.sm},
  themeCard: {padding: 5, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: 4},
  themeOption: {flex: 1, height: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7},
  themeText: typography.label,
  modelRow: {minHeight: 78, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  modeCard: {borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm},
  modeTitle: typography.title,
  modeBody: {...typography.small, marginTop: spacing.xxs},
  modeOptions: {flexDirection: 'row', padding: 4, borderRadius: 12, marginTop: spacing.md, gap: 4},
  modeOption: {flex: 1, minHeight: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  modeLabel: {...typography.label, fontSize: 13},
  modeDetail: {...typography.small, fontSize: 10},
  modeDetailSelected: {color: 'rgba(255,255,255,0.72)'},
  list: {borderWidth: 1, borderRadius: radius.md, overflow: 'hidden'},
  row: {minHeight: 76, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  rowIcon: {width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  rowCopy: {flex: 1, gap: 2},
  rowTitle: typography.label,
  rowSubtitle: typography.small,
  storage: {marginTop: spacing.lg, minHeight: 84, padding: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  storageTitle: {color: '#FFFFFF', ...typography.title},
  storageSubtitle: {color: 'rgba(255,255,255,0.72)', ...typography.small},
  version: {...typography.small, textAlign: 'center', marginTop: spacing.xl},
});
