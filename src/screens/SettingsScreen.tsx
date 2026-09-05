import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  Accessibility,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Gauge,
  HardDrive,
  Info,
  Key,
  Moon,
  PlayCircle,
  Smartphone,
  Sparkles,
  Sun,
  XCircle,
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
import {opencodeMimoService} from '../services/opencodeMimoService';

const rows: {
  icon: any;
  title: string;
  subtitle: string;
  route?: keyof RootStackParamList;
  action?: 'voicePicker';
}[] = [
  {icon: PlayCircle, title: 'Playback', subtitle: 'Voice, speed, engine & skip duration', action: 'voicePicker'},
  {icon: BookOpenText, title: 'Reading', subtitle: 'Font, spacing, sentence highlight'},
  {icon: Accessibility, title: 'Accessibility', subtitle: 'Contrast, motion and larger controls'},
  {icon: Database, title: 'Backup & restore', subtitle: 'Export your private local library', route: 'BackupRestore'},
  {icon: Info, title: 'Privacy & about', subtitle: 'Local processing and licenses', route: 'PrivacyAbout'},
];

export function SettingsScreen() {
  const {colors, preference, setPreference, isDark} = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {status: modelStatus} = useModelDownload();
  const {status: voiceStatus, setPerformanceMode} = useNarrationEngine();

  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [currentEngineMode, setCurrentEngineMode] = useState<string>('edge-cloud');
  const [currentVoice, setCurrentVoice] = useState<string>('Jenny');

  // OpenCode MiMo v2.5 AI State
  const [opencodeKey, setOpencodeKey] = useState('');
  const [showOpencodeKey, setShowOpencodeKey] = useState(false);
  const [opencodeEnabled, setOpencodeEnabled] = useState(true);
  const [testingOpencode, setTestingOpencode] = useState(false);
  const [opencodeStatus, setOpencodeStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  const loadOpencodeConfig = useCallback(async () => {
    try {
      const cfg = await opencodeMimoService.getConfig();
      setOpencodeKey(cfg.apiKey);
      setOpencodeEnabled(cfg.enabled);
    } catch {
      // ignore
    }
  }, []);

  const handleSaveOpencodeKey = async (text: string) => {
    setOpencodeKey(text);
    await opencodeMimoService.setApiKey(text);
    setOpencodeStatus(null);
  };

  const handleToggleOpencodeEnabled = async () => {
    const next = !opencodeEnabled;
    setOpencodeEnabled(next);
    await opencodeMimoService.setEnabled(next);
  };

  const handleTestOpencode = async () => {
    setTestingOpencode(true);
    try {
      const res = await opencodeMimoService.testConnection(opencodeKey);
      setOpencodeStatus({
        tested: true,
        success: res.success,
        message: res.message,
      });
    } finally {
      setTestingOpencode(false);
    }
  };

  const loadEngineStatus = useCallback(async () => {
    try {
      const prefs = await narrationPipelineService.getPreferences();
      setCurrentEngineMode(prefs.engineMode);
      const voiceDisplay =
        prefs.engineMode === 'edge-cloud'
          ? prefs.edgeVoice.replace('en-US-', '').replace('Neural', '')
          : prefs.chatterboxVoice;
      setCurrentVoice(voiceDisplay);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEngineStatus();
    loadOpencodeConfig();
    const unsubscribe = navigation.addListener?.('focus', () => {
      loadEngineStatus();
      loadOpencodeConfig();
    });
    return unsubscribe;
  }, [navigation, loadEngineStatus, loadOpencodeConfig]);

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

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>AI NARRATION & ENGINES</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AI Engine, Voice & API Key configuration"
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
            {currentEngineMode === 'edge-cloud'
              ? 'Edge Neural Cloud AI (Studio)'
              : 'Chatterbox AI (100% Offline)'}
          </Text>
          <Text style={[styles.rowSubtitle, {color: colors.inkMuted}]}>
            {currentEngineMode === 'edge-cloud'
              ? `Voice: ${currentVoice} · 100% Free · 0% phone heat`
              : `Voice: ${currentVoice} · On-device neural speech`}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.inkMuted} />
      </Pressable>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>OPENCODE AI SPEECH DIRECTOR</Text>
      <View style={[styles.aiCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={styles.aiCardHeader}>
          <View style={[styles.rowIcon, {backgroundColor: colors.brandSoft}]}>
            <Sparkles size={20} color={colors.brand} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, {color: colors.ink}]}>
              MiMo v2.5 Free AI Model
            </Text>
            <Text style={[styles.rowSubtitle, {color: colors.inkMuted}]}>
              OpenCode Zen · 100% Free · Real-time
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{checked: opencodeEnabled}}
            onPress={handleToggleOpencodeEnabled}
            style={[
              styles.togglePill,
              {backgroundColor: opencodeEnabled ? colors.brand : (isDark ? '#374151' : '#E5E7EB')},
            ]}>
            <Text style={[styles.toggleText, {color: opencodeEnabled ? colors.white : colors.inkMuted}]}>
              {opencodeEnabled ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.aiExplanation, {color: colors.inkMuted}]}>
          Analyzes book pages in the background to fix split words (e.g. "fil ed" → "filled", "stal ion" → "stallion") and direct expressive voice acting (whispering, excited, dramatic) without lag.
        </Text>

        <View style={styles.keyInputContainer}>
          <View style={[styles.keyInputWrapper, {backgroundColor: colors.surfaceMuted, borderColor: colors.border}]}>
            <Key size={16} color={colors.inkMuted} style={styles.keyIcon} />
            <TextInput
              style={[styles.keyInput, {color: colors.ink}]}
              placeholder="Enter OpenCode API Key"
              placeholderTextColor={colors.inkMuted}
              secureTextEntry={!showOpencodeKey}
              value={opencodeKey}
              onChangeText={handleSaveOpencodeKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setShowOpencodeKey(!showOpencodeKey)}
              style={styles.eyeBtn}>
              {showOpencodeKey ? (
                <EyeOff size={18} color={colors.inkMuted} />
              ) : (
                <Eye size={18} color={colors.inkMuted} />
              )}
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleTestOpencode}
            disabled={testingOpencode || !opencodeKey.trim()}
            style={({pressed}) => [
              styles.testBtn,
              {
                backgroundColor: colors.brand,
                opacity: (testingOpencode || !opencodeKey.trim()) ? 0.5 : (pressed ? 0.8 : 1),
              },
            ]}>
            <Text style={[styles.testBtnText, {color: colors.white}]}>
              {testingOpencode ? 'Testing...' : 'Test Connection'}
            </Text>
          </Pressable>
        </View>

        {opencodeStatus && (
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: opencodeStatus.success
                  ? (isDark ? '#064E3B' : '#ECFDF5')
                  : (isDark ? '#7F1D1D' : '#FEF2F2'),
                borderColor: opencodeStatus.success ? '#10B981' : '#EF4444',
              },
            ]}>
            {opencodeStatus.success ? (
              <CheckCircle2 size={16} color="#10B981" />
            ) : (
              <XCircle size={16} color="#EF4444" />
            )}
            <Text
              style={[
                styles.statusText,
                {color: opencodeStatus.success ? (isDark ? '#34D399' : '#065F46') : (isDark ? '#F87171' : '#991B1B')},
              ]}>
              {opencodeStatus.message}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>NATURAL VOICE</Text>
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
          <Text style={[styles.rowTitle, {color: colors.ink}]}>Model & voice test</Text>
          <Text style={[styles.rowSubtitle, {color: colors.inkMuted}]}>
            {modelStatus.state === 'ready'
              ? 'Installed · Tap to test your narrator'
              : modelStatus.state === 'downloading'
                ? `Downloading ${Math.round(modelStatus.progress * 100)}%`
                : 'Set up the free offline natural voice'}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.inkMuted} />
      </Pressable>

      <View style={[styles.modeCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <Text style={[styles.modeTitle, {color: colors.ink}]}>Performance</Text>
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
              ? `${formatDownloadBytes(modelStatus.totalBytes)} voice model installed`
              : 'Manage voice files and generated audio'}
          </Text>
        </View>
        <ChevronRight size={21} color={colors.white} />
      </Pressable>

      <Text style={[styles.version, {color: colors.inkMuted}]}>AI Book Reader · v1.0.0-beta (Phase 8)</Text>

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
  aiCard: {borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm},
  aiCardHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  togglePill: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill},
  toggleText: {...typography.label, fontSize: 12, fontWeight: '700'},
  aiExplanation: {...typography.small, fontSize: 12, lineHeight: 17, marginTop: spacing.sm, marginBottom: spacing.md},
  keyInputContainer: {flexDirection: 'row', gap: spacing.xs, alignItems: 'center'},
  keyInputWrapper: {flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, height: 44},
  keyIcon: {marginRight: 6},
  keyInput: {flex: 1, height: 44, fontSize: 13},
  eyeBtn: {padding: 6},
  testBtn: {height: 44, paddingHorizontal: 14, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center'},
  testBtnText: {...typography.label, fontSize: 12, fontWeight: '700'},
  statusBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm},
  statusText: {...typography.small, fontSize: 12, fontWeight: '600', flex: 1},
});
