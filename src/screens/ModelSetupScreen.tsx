import React, {useState} from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BatteryCharging,
  Check,
  ChevronDown,
  CircleAlert,
  Cpu,
  Download,
  HardDrive,
  LockKeyhole,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  Wifi,
} from 'lucide-react-native';
import {useNavigation} from '@react-navigation/native';
import {Screen} from '../components/Screen';
import {AppButton} from '../components/AppButton';
import {useAppTheme} from '../theme/ThemeProvider';
import {radius, spacing, typography} from '../theme/tokens';
import {useModelDownload} from '../state/ModelDownloadProvider';
import {formatDownloadBytes} from '../services/modelDownload';
import {useNarrationEngine} from '../state/NarrationEngineProvider';
import {VoicePickerModal} from '../components/VoicePickerModal';

export function ModelSetupScreen() {
  const {colors} = useAppTheme();
  const navigation = useNavigation();
  const [wifiOnly, setWifiOnly] = useState(true);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const {status, startDownload, pauseDownload} = useModelDownload();
  const {
    status: voiceStatus,
    result: voiceResult,
    error: voiceError,
    testNaturalVoice,
    testPhoneVoice,
    stop,
  } = useNarrationEngine();
  const progressPercent = Math.round(status.progress * 100);
  const isChecking = status.state === 'checking';
  const isDownloading = status.state === 'downloading';
  const isVerifying = status.state === 'verifying';
  const isBusy = isChecking || isDownloading || isVerifying;
  const isReady = status.state === 'ready';
  const hasProgress = status.downloadedBytes > 0 || isBusy;
  const voiceBusy =
    voiceStatus.state === 'preparing' ||
    voiceStatus.state === 'generating' ||
    voiceStatus.state === 'playing';
  const voicePercent = Math.round(voiceStatus.progress * 100);
  const beginDownload = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      ).catch(() => undefined);
    }
    await startDownload(wifiOnly);
  };

  const statusTitle = {
    'not-installed': 'Ready to download',
    checking: 'Preparing download',
    downloading: 'Downloading natural voice',
    paused: 'Download paused',
    verifying: 'Checking downloaded files',
    ready: 'Voice files installed',
    failed: 'Download needs attention',
    unsupported: 'This device is not supported',
  }[status.state];

  const StatusIcon =
    status.state === 'ready'
      ? Check
      : status.state === 'failed' || status.state === 'unsupported'
        ? CircleAlert
        : status.state === 'downloading' || status.state === 'paused'
          ? Download
          : Cpu;

  return (
    <Screen contentStyle={styles.content}>
      <View style={[styles.heroIcon, {backgroundColor: colors.brandSoft}]}>
        <Sparkles size={30} color={colors.brand} />
      </View>
      <Text style={[styles.title, {color: colors.ink}]}>Natural voice setup</Text>
      <Text style={[styles.intro, {color: colors.inkMuted}]}>
        Download the voice model once. Your books and narration will stay on this phone.
      </Text>

      <View style={[styles.status, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={styles.statusTop}>
          <View style={[styles.statusIcon, {backgroundColor: colors.brandSoft}]}>
            <StatusIcon
              size={22}
              color={status.state === 'failed' ? colors.danger : colors.brand}
            />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.statusTitle, {color: colors.ink}]}>{statusTitle}</Text>
            <Text style={[styles.statusBody, {color: colors.inkMuted}]}>
              {status.message}
            </Text>
          </View>
          {isReady ? <Check size={21} color={colors.success} /> : null}
        </View>

        {hasProgress ? (
          <View style={styles.progressSection}>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{min: 0, max: 100, now: progressPercent}}
              style={[styles.progressTrack, {backgroundColor: colors.surfaceMuted}]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: isReady ? colors.success : colors.listen,
                    width: `${progressPercent}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.progressMeta}>
              <Text style={[styles.progressPercent, {color: colors.ink}]}>
                {isVerifying ? 'Verifying…' : `${progressPercent}%`}
              </Text>
              <Text style={[styles.progressBytes, {color: colors.inkMuted}]}>
                {formatDownloadBytes(status.downloadedBytes)} of{' '}
                {formatDownloadBytes(status.totalBytes)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.divider, {backgroundColor: colors.border}]} />
        <InfoRow
          icon={HardDrive}
          label="Voice download"
          value={formatDownloadBytes(status.totalBytes)}
        />
        <InfoRow icon={BatteryCharging} label="Best installed while charging" value="Recommended" />
        <InfoRow icon={ShieldCheck} label="Pack integrity" value="Files verified" />
      </View>

      <Text style={[styles.sectionLabel, {color: colors.inkMuted}]}>VOICE LANGUAGE</Text>
      <Pressable
        accessibilityRole="button"
        style={[styles.select, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={[styles.languageIcon, {backgroundColor: colors.listenSoft}]}>
          <Text style={[styles.languageMark, {color: colors.listen}]}>EN</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.selectTitle, {color: colors.ink}]}>English voice pack</Text>
          <Text style={[styles.selectBody, {color: colors.inkMuted}]}>Warm, Clear and Deep narrators</Text>
        </View>
        <ChevronDown size={20} color={colors.inkMuted} />
      </Pressable>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{checked: wifiOnly}}
        disabled={isBusy || isReady}
        onPress={() => setWifiOnly(value => !value)}
        style={[styles.switchRow, (isBusy || isReady) && styles.disabled]}>
        <View style={[styles.wifiIcon, {backgroundColor: colors.surfaceMuted}]}>
          <Wifi size={20} color={colors.brand} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.switchTitle, {color: colors.ink}]}>Download over Wi-Fi only</Text>
          <Text style={[styles.switchBody, {color: colors.inkMuted}]}>Recommended for large model files</Text>
        </View>
        <View
          style={[
            styles.switch,
            {backgroundColor: wifiOnly ? colors.brand : colors.surfaceMuted},
          ]}>
          <View
            style={[
              styles.switchThumb,
              {backgroundColor: colors.white, transform: [{translateX: wifiOnly ? 20 : 0}]},
            ]}
          />
        </View>
      </Pressable>

      <View style={[styles.privacy, {backgroundColor: colors.brandSoft}]}>
        <LockKeyhole size={20} color={colors.brand} />
        <Text style={[styles.privacyText, {color: colors.ink}]}>
          The voice downloads directly inside the app. No book text, notes, or listening history is uploaded.
        </Text>
      </View>

      {isReady ? (
        <View
          style={[
            styles.voiceTest,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.voiceTestHeader}>
            <View style={[styles.statusIcon, {backgroundColor: colors.listenSoft}]}>
              <Volume2 size={22} color={colors.listen} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.statusTitle, {color: colors.ink}]}>Test your narrator</Text>
              <Text style={[styles.statusBody, {color: colors.inkMuted}]}>
                {voiceError ?? voiceStatus.message}
              </Text>
            </View>
          </View>
          {voiceStatus.state === 'preparing' || voiceStatus.state === 'generating' ? (
            <View style={styles.progressSection}>
              <View style={[styles.progressTrack, {backgroundColor: colors.surfaceMuted}]}>
                <View
                  style={[
                    styles.progressFill,
                    {backgroundColor: colors.listen, width: `${voicePercent}%`},
                  ]}
                />
              </View>
              <Text style={[styles.voiceProgress, {color: colors.inkMuted}]}>
                {voicePercent}% · Keep the app open for this first test
              </Text>
            </View>
          ) : null}
          {voiceResult ? (
            <View style={[styles.result, {backgroundColor: colors.surfaceMuted}]}>
              <Check size={17} color={colors.success} />
              <View style={styles.flex}>
                <Text style={[styles.resultTitle, {color: colors.ink}]}>
                  {voiceResult.engine === 'natural'
                    ? 'Natural voice is working'
                    : 'Phone voice is working'}
                </Text>
                <Text style={[styles.resultBody, {color: colors.inkMuted}]}>
                  {voiceResult.fallbackReason ?? voiceResult.message}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {isDownloading ? (
        <AppButton
          label="Pause download"
          icon={Pause}
          variant="secondary"
          fullWidth
          onPress={pauseDownload}
        />
      ) : isChecking || isVerifying ? (
        <AppButton
          label={isVerifying ? 'Verifying files' : 'Preparing download'}
          loading
          fullWidth
          onPress={() => undefined}
        />
      ) : isReady ? (
        <View style={styles.actions}>
          <AppButton
            label="Configure AI Engine, Voices & API Key"
            icon={Sparkles}
            variant="secondary"
            fullWidth
            disabled={voiceBusy}
            onPress={() => setShowVoicePicker(true)}
          />
          <AppButton
            label={
              voiceStatus.state === 'playing'
                ? 'Stop sample'
                : voiceStatus.state === 'generating' || voiceStatus.state === 'preparing'
                  ? 'Stop voice test'
                  : 'Test natural voice'
            }
            icon={voiceBusy ? Square : Play}
            fullWidth
            onPress={voiceBusy ? stop : testNaturalVoice}
          />
          <AppButton
            label="Done"
            icon={Check}
            variant="secondary"
            fullWidth
            disabled={voiceBusy}
            onPress={() => navigation.goBack()}
          />
        </View>
      ) : (
        <AppButton
          label={status.state === 'paused' ? 'Resume download' : 'Download and install'}
          icon={Download}
          fullWidth
          onPress={beginDownload}
        />
      )}
      <AppButton
        label={isReady ? 'Test phone voice instead' : 'Use phone voice for now'}
        variant="ghost"
        fullWidth
        disabled={isBusy || voiceBusy}
        onPress={testPhoneVoice}
      />

      <VoicePickerModal
        visible={showVoicePicker}
        onClose={() => setShowVoicePicker(false)}
      />
    </Screen>
  );
}

function InfoRow({icon: Icon, label, value}: {icon: typeof Cpu; label: string; value: string}) {
  const {colors} = useAppTheme();
  return (
    <View style={styles.infoRow}>
      <Icon size={18} color={colors.inkMuted} />
      <Text style={[styles.infoLabel, {color: colors.inkMuted}]}>{label}</Text>
      <Text style={[styles.infoValue, {color: colors.ink}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'stretch'},
  heroIcon: {width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: spacing.lg},
  title: {...typography.pageTitle, textAlign: 'center', marginTop: spacing.md},
  intro: {...typography.body, textAlign: 'center', marginTop: spacing.xs, alignSelf: 'center', maxWidth: 480},
  status: {marginTop: spacing.xl, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md},
  statusTop: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  statusIcon: {width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  statusTitle: typography.title,
  statusBody: typography.small,
  progressSection: {marginTop: spacing.md},
  progressTrack: {height: 9, borderRadius: radius.pill, overflow: 'hidden'},
  progressFill: {height: '100%', borderRadius: radius.pill},
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  progressPercent: {...typography.label, fontVariant: ['tabular-nums']},
  progressBytes: {...typography.small, fontVariant: ['tabular-nums']},
  divider: {height: StyleSheet.hairlineWidth, marginVertical: spacing.md},
  infoRow: {minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  infoLabel: {...typography.small, flex: 1},
  infoValue: {...typography.small, fontWeight: '700'},
  sectionLabel: {...typography.small, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginTop: spacing.xl, marginBottom: spacing.sm},
  select: {minHeight: 76, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  languageIcon: {width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  languageMark: {fontSize: 14, fontWeight: '800'},
  selectTitle: typography.label,
  selectBody: typography.small,
  flex: {flex: 1},
  switchRow: {minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm},
  wifiIcon: {width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  switchTitle: typography.label,
  switchBody: typography.small,
  switch: {width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center'},
  switchThumb: {width: 24, height: 24, borderRadius: 12},
  disabled: {opacity: 0.55},
  privacy: {padding: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginVertical: spacing.lg},
  privacyText: {...typography.small, flex: 1},
  voiceTest: {borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md},
  voiceTestHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  voiceProgress: {...typography.small, marginTop: spacing.xs},
  result: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.md},
  resultTitle: typography.label,
  resultBody: typography.small,
  actions: {gap: spacing.sm},
});
