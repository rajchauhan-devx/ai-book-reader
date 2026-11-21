import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Play,
  Sparkles,
  Volume2,
  X,
  Zap,
} from 'lucide-react-native';
import {useAppTheme} from '../theme/ThemeProvider';
import {radius, spacing, typography} from '../theme/tokens';
import {AppButton} from './AppButton';
import {
  type ExpressionPreset,
  type NarrationPreferences,
  type VoiceProfile,
  DEFAULT_EXPRESSIONS,
  DEFAULT_VOICES,
  narrationPipelineService,
} from '../services/narrationPipeline';
import {type KokoroVoiceId} from '../services/kokoroTtsService';
import {narrationPlayerService} from '../services/narrationPlayer';
import {useNarrationEngine} from '../state/NarrationEngineProvider';
import {useModelDownload} from '../state/ModelDownloadProvider';

type VoicePickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onVoiceChanged?: (prefs: NarrationPreferences) => void;
};

export function VoicePickerModal({
  visible,
  onClose,
  onVoiceChanged,
}: VoicePickerModalProps) {
  const {colors} = useAppTheme();
  const {
    testNaturalVoice,
    status: voiceEngineStatus,
    result: voiceTestResult,
  } = useNarrationEngine();
  const {status: modelDownloadStatus, startDownload} = useModelDownload();

  const [voices, setVoices] = useState<VoiceProfile[]>(DEFAULT_VOICES);
  const [expressions, setExpressions] =
    useState<ExpressionPreset[]>(DEFAULT_EXPRESSIONS);
  const [selectedVoiceId, setSelectedVoiceId] = useState<KokoroVoiceId>('af_heart');
  const [selectedExpression, setSelectedExpression] = useState('natural');
  const [activePreviewVoiceId, setActivePreviewVoiceId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [isModelRunning, setIsModelRunning] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (visible) {
      narrationPipelineService.getCuratedVoices().then(catalog => {
        if (mounted) {
          setVoices(catalog.voices);
          setExpressions(catalog.expressions);
        }
      });
      narrationPipelineService.getPreferences().then(prefs => {
        if (mounted) {
          setSelectedVoiceId(prefs.voiceId);
          setSelectedExpression(prefs.expression);
        }
      });
      narrationPlayerService.isModelRunning().then(running => {
        if (mounted) {
          setIsModelRunning(running);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [visible]);

  const handleSelectVoice = async (voiceId: KokoroVoiceId) => {
    setSelectedVoiceId(voiceId);
    const updated = await narrationPipelineService.savePreferences({
      voiceId,
    });
    await narrationPlayerService.setEngineConfig(voiceId);
    onVoiceChanged?.(updated);
  };

  const handleSelectExpression = async (exprId: string) => {
    setSelectedExpression(exprId);
    const updated = await narrationPipelineService.savePreferences({
      expression: exprId,
    });
    onVoiceChanged?.(updated);
  };

  const handlePreview = useCallback(
    async (voiceIdToTest?: string) => {
      const targetId = voiceIdToTest || selectedVoiceId;
      setActivePreviewVoiceId(targetId);
      setPreviewing(true);
      try {
        await testNaturalVoice(targetId);
      } finally {
        setPreviewing(false);
        setActivePreviewVoiceId(null);
      }
    },
    [selectedVoiceId, testNaturalVoice],
  );

  const isTesting =
    previewing ||
    voiceEngineStatus.state === 'preparing' ||
    voiceEngineStatus.state === 'generating' ||
    voiceEngineStatus.state === 'playing';

  const isModelInstalled =
    modelDownloadStatus.state === 'ready' || voiceEngineStatus.modelInstalled;

  const currentSelectedProfile =
    voices.find(v => v.id === selectedVoiceId) || voices[0];
  const activeTestingProfile =
    voices.find(v => v.id === activePreviewVoiceId) || currentSelectedProfile;

  const currentVoiceName = currentSelectedProfile?.name || 'Kokoro';
  const activeVoiceName = activeTestingProfile?.name || currentVoiceName;
  const currentVoiceFirstName = currentVoiceName.split(' ')[0] || 'Kokoro';
  const activeVoiceFirstName = activeVoiceName.split(' ')[0] || 'Kokoro';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close voice picker modal"
        />
        <View
          style={[
            styles.sheetCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleContainer}>
              <View style={styles.headerIconRow}>
                <Sparkles size={18} color={colors.brand} />
                <Text style={[styles.modalTitle, {color: colors.ink}]}>
                  Kokoro Voice & Narrator
                </Text>
              </View>
              <Text style={[styles.modalSubtitle, {color: colors.inkMuted}]}>
                100% Offline neural speech synthesis running directly on your phone.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.closeBtn}>
              <X size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}>
            {/* OFFLINE STATUS BANNER */}
            <View
              style={[
                styles.offlineBanner,
                {
                  backgroundColor: isModelInstalled ? colors.canvas : '#FEF3C7',
                  borderColor: isModelInstalled ? colors.border : '#F59E0B',
                },
              ]}>
              <View style={styles.offlineBannerContent}>
                <View
                  style={[
                    styles.statusIconCircle,
                    {backgroundColor: isModelInstalled ? '#ECFDF5' : '#FDE68A'},
                  ]}>
                  {isModelInstalled ? (
                    <Cpu size={16} color="#059669" />
                  ) : (
                    <AlertTriangle size={16} color="#D97706" />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text
                    style={[
                      styles.bannerTitle,
                      {color: isModelInstalled ? colors.ink : '#92400E'},
                    ]}>
                    {isModelInstalled
                      ? 'Kokoro-82M ONNX Model'
                      : 'Kokoro Model Not Downloaded (~84 MB)'}
                  </Text>
                  <Text
                    style={[
                      styles.bannerSubtitle,
                      {color: isModelInstalled ? colors.inkMuted : '#B45309'},
                    ]}>
                    {isModelInstalled
                      ? 'Air-gapped on-device AI · Zero network requests · Zero cloud APIs'
                      : modelDownloadStatus.state === 'downloading'
                      ? `Downloading model pack (${Math.round(modelDownloadStatus.progress * 100)}%)...`
                      : 'Download the Kokoro model pack to audition voices and start offline narration.'}
                  </Text>
                </View>
                {isModelInstalled ? (
                  <View style={styles.readyBadge}>
                    <CheckCircle2 size={14} color="#059669" />
                    <Text style={styles.readyBadgeText}>Offline Ready</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Download Kokoro model pack"
                    style={styles.downloadBadge}
                    onPress={async () => {
                      if (modelDownloadStatus.state !== 'downloading') {
                        startDownload(false);
                      }
                    }}>
                    <Download size={13} color="#FFFFFF" />
                    <Text style={styles.downloadBadgeText}>
                      {modelDownloadStatus.state === 'downloading'
                        ? `${Math.round(modelDownloadStatus.progress * 100)}%`
                        : 'Download'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* KOKORO VOICES SELECTION */}
            <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
              KOKORO NEURAL VOICES (TAP PLAY TO AUDITION)
            </Text>
            <View style={styles.voiceList}>
              {voices.map(profile => {
                const isSelected = profile.id === selectedVoiceId;
                const isAuditioningThis =
                  isTesting && activePreviewVoiceId === profile.id;

                return (
                  <Pressable
                    key={profile.id}
                    accessibilityRole="radio"
                    accessibilityState={{selected: isSelected}}
                    onPress={() => handleSelectVoice(profile.id as KokoroVoiceId)}
                    style={[
                      styles.voiceCard,
                      {
                        backgroundColor: colors.canvas,
                        borderColor: isSelected ? colors.brand : colors.border,
                      },
                      isSelected && {backgroundColor: colors.brandSoft},
                    ]}>
                    <View style={styles.voiceCardHeader}>
                      <View style={styles.voiceTitleRow}>
                        <Volume2
                          size={16}
                          color={isSelected ? colors.brand : colors.inkMuted}
                        />
                        <Text
                          style={[
                            styles.voiceName,
                            {color: colors.ink},
                            isSelected && styles.selectedFont,
                          ]}>
                          {profile.name}
                        </Text>
                        {profile.accent && (
                          <View
                            style={[
                              styles.accentTag,
                              {backgroundColor: colors.surfaceMuted},
                            ]}>
                            <Text
                              style={[
                                styles.accentTagText,
                                {color: colors.inkMuted},
                              ]}>
                              {profile.accent} · {profile.gender === 'female' ? 'Female' : 'Male'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.voiceActionRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Audition ${profile.name}`}
                          onPress={e => {
                            e.stopPropagation();
                            handleSelectVoice(profile.id as KokoroVoiceId);
                            handlePreview(profile.id);
                          }}
                          style={[
                            styles.previewPlayBtn,
                            {
                              backgroundColor: isAuditioningThis
                                ? colors.brand
                                : colors.surfaceMuted,
                            },
                          ]}>
                          {isAuditioningThis ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : (
                            <Play size={12} color={colors.brand} />
                          )}
                        </Pressable>
                        <View
                          style={[
                            styles.radioCircle,
                            {
                              borderColor: isSelected
                                ? colors.brand
                                : colors.border,
                              backgroundColor: isSelected
                                ? colors.brand
                                : 'transparent',
                            },
                          ]}>
                          {isSelected && <Check size={11} color={colors.white} />}
                        </View>
                      </View>
                    </View>

                    <Text style={[styles.voiceDesc, {color: colors.inkMuted}]}>
                      {profile.descriptor}
                    </Text>

                    {profile.tone && (
                      <View style={styles.tonePillRow}>
                        <View
                          style={[
                            styles.tonePill,
                            {backgroundColor: isSelected ? colors.surface : colors.surfaceMuted},
                          ]}>
                          <Text
                            style={[
                              styles.tonePillText,
                              {color: isSelected ? colors.brand : colors.inkMuted},
                            ]}>
                            {profile.tone}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* EXPRESSION / PACING */}
            <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
              NARRATION CADENCE & EXPRESSION
            </Text>
            <View style={styles.expressionRow}>
              {expressions.map(expr => {
                const isSelected = expr.id === selectedExpression;
                return (
                  <Pressable
                    key={expr.id}
                    accessibilityRole="radio"
                    accessibilityState={{selected: isSelected}}
                    onPress={() => handleSelectExpression(expr.id)}
                    style={[
                      styles.exprCard,
                      {
                        backgroundColor: colors.canvas,
                        borderColor: isSelected ? colors.brand : colors.border,
                      },
                      isSelected && {backgroundColor: colors.brandSoft},
                    ]}>
                    <Text
                      style={[
                        styles.exprName,
                        {color: colors.ink},
                        isSelected && styles.selectedFont,
                      ]}>
                      {expr.name}
                    </Text>
                    <Text style={[styles.exprDesc, {color: colors.inkMuted}]}>
                      {expr.descriptor}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* REAL-TIME SYNTHESIS & ENGINE FEEDBACK CARD */}
            {isTesting || voiceTestResult ? (
              <View
                style={[
                  styles.testStatusCard,
                  {
                    backgroundColor: colors.canvas,
                    borderColor: '#10B981',
                  },
                ]}>
                <View style={styles.testStatusRow}>
                  {isTesting ? (
                    <ActivityIndicator size="small" color={colors.brand} />
                  ) : (
                    <CheckCircle2 size={15} color="#059669" />
                  )}
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.testStatusTitle,
                        {color: colors.ink},
                      ]}>
                      {isTesting
                        ? `Synthesizing ${activeVoiceName}…`
                        : 'Kokoro On-Device Engine Active'}
                    </Text>
                    <Text
                      style={[
                        styles.testStatusDesc,
                        {color: colors.inkMuted},
                      ]}>
                      {isTesting
                        ? 'Running 100% offline neural synthesis on your device'
                        : voiceTestResult?.fallbackReason
                        ? voiceTestResult.fallbackReason
                        : voiceTestResult?.message || voiceEngineStatus.message}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.spacer} />
          </ScrollView>

          {/* FOOTER ACTIONS */}
          <View
            style={[
              styles.sheetFooter,
              {backgroundColor: colors.surface, borderTopColor: colors.border},
            ]}>
            <AppButton
              label={
                isTesting
                  ? `Testing ${activeVoiceFirstName}…`
                  : `Test ${currentVoiceFirstName} Voice`
              }
              icon={isTesting ? undefined : Play}
              variant="secondary"
              disabled={isTesting}
              loading={isTesting}
              onPress={() => handlePreview(selectedVoiceId)}
            />
            <AppButton label="Done" fullWidth onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  headerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: typography.sectionTitle.fontSize,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: typography.small.fontSize,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.pill,
  },
  sheetBody: {
    flexGrow: 1,
  },
  sheetBodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  offlineBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginVertical: spacing.sm,
  },
  offlineBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bannerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  readyBadgeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: typography.small.fontSize,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  voiceList: {
    gap: spacing.xs,
  },
  voiceCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  voiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  voiceName: {
    fontSize: 14,
    fontWeight: '600',
  },
  accentTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  accentTagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  voiceActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  previewPlayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  downloadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  testStatusCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  testStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  testStatusTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  testStatusDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceDesc: {
    fontSize: 12,
    marginTop: 3,
    marginLeft: 22,
  },
  tonePillRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginLeft: 22,
  },
  tonePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tonePillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  expressionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  exprCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  exprName: {
    fontSize: 13,
    fontWeight: '600',
  },
  exprDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  selectedFont: {
    fontWeight: '700',
  },
  spacer: {
    height: spacing.md,
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
