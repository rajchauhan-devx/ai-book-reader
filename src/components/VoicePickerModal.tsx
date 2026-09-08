import React, {useCallback, useEffect, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Check,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Key,
  Play,
  Sparkles,
  Volume2,
  X,
  XCircle,
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
import {
  EDGE_VOICES,
  type EdgeVoiceId,
  type NarrationEngineMode,
} from '../services/edgeTtsService';
import {narrationPlayerService} from '../services/narrationPlayer';
import {useNarrationEngine} from '../state/NarrationEngineProvider';
import {opencodeMimoService} from '../services/opencodeMimoService';

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
  const {testNaturalVoice, status: voiceEngineStatus} = useNarrationEngine();

  const [voices, setVoices] = useState<VoiceProfile[]>(DEFAULT_VOICES);
  const [expressions, setExpressions] =
    useState<ExpressionPreset[]>(DEFAULT_EXPRESSIONS);
  const [selectedVoiceId, setSelectedVoiceId] = useState('warm');
  const [selectedExpression, setSelectedExpression] = useState('natural');
  const [engineMode, setEngineMode] =
    useState<NarrationEngineMode>('edge-cloud');
  const [edgeVoice, setEdgeVoice] =
    useState<EdgeVoiceId>('en-US-JennyNeural');

  const [previewing, setPreviewing] = useState(false);

  // OpenCode MiMo v2.5 State
  const [opencodeKey, setOpencodeKey] = useState('');
  const [showOpencodeKey, setShowOpencodeKey] = useState(false);
  const [opencodeEnabled, setOpencodeEnabled] = useState(true);
  const [testingOpencode, setTestingOpencode] = useState(false);
  const [opencodeStatus, setOpencodeStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);

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
          setEngineMode(prefs.engineMode);
          setEdgeVoice(prefs.edgeVoice);
        }
      });
      opencodeMimoService.getConfig().then(cfg => {
        if (mounted) {
          setOpencodeKey(cfg.apiKey);
          setOpencodeEnabled(cfg.enabled);
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

  const handleUnloadModel = async () => {
    await narrationPlayerService.unloadModel();
    setIsModelRunning(false);
  };

  const handleSaveOpencodeKey = async (text: string) => {
    setOpencodeKey(text);
    await opencodeMimoService.setApiKey(text);
    setOpencodeStatus(null);
  };

  const handleToggleOpencode = async () => {
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

  const handleSelectEngineMode = async (mode: NarrationEngineMode) => {
    setEngineMode(mode);
    const updated = await narrationPipelineService.savePreferences({
      engineMode: mode,
    });
    await narrationPlayerService.setEngineConfig(mode, edgeVoice);
    if (mode === 'edge-cloud') {
      await narrationPlayerService.unloadModel();
      setIsModelRunning(false);
    }
    onVoiceChanged?.(updated);
  };

  const handleSelectEdgeVoice = async (v: EdgeVoiceId) => {
    setEdgeVoice(v);
    const updated = await narrationPipelineService.savePreferences({
      edgeVoice: v,
    });
    await narrationPlayerService.setEngineConfig(engineMode, v);
    onVoiceChanged?.(updated);
  };

  const handleSelectVoice = async (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    const updated = await narrationPipelineService.savePreferences({
      voiceId,
      chatterboxVoice: voiceId,
    });
    onVoiceChanged?.(updated);
  };

  const handleSelectExpression = async (exprId: string) => {
    setSelectedExpression(exprId);
    const updated = await narrationPipelineService.savePreferences({
      expression: exprId,
    });
    onVoiceChanged?.(updated);
  };

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    try {
      await testNaturalVoice();
    } finally {
      setPreviewing(false);
    }
  }, [testNaturalVoice]);

  const isTesting =
    previewing ||
    voiceEngineStatus.state === 'preparing' ||
    voiceEngineStatus.state === 'generating' ||
    voiceEngineStatus.state === 'playing';

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
            <View>
              <Text style={[styles.modalTitle, {color: colors.ink}]}>
                AI Voice & Narrator
              </Text>
              <Text style={[styles.modalSubtitle, {color: colors.inkMuted}]}>
                Choose your AI engine, character voice, and narration style.
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
            {/* ENGINE MODE SELECTION */}
            <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
              NARRATION ENGINE MODE
            </Text>
            <View style={styles.engineGrid}>
              {/* Option 1: Edge Neural Cloud */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{selected: engineMode === 'edge-cloud'}}
                onPress={() => handleSelectEngineMode('edge-cloud')}
                style={[
                  styles.engineCard,
                  {
                    backgroundColor: colors.canvas,
                    borderColor:
                      engineMode === 'edge-cloud'
                        ? colors.brand
                        : colors.border,
                  },
                  engineMode === 'edge-cloud' && {
                    backgroundColor: colors.brandSoft,
                  },
                ]}>
                <View style={styles.engineCardHeader}>
                  <View style={styles.engineIconRow}>
                    <Cloud size={18} color={colors.brand} />
                    <Text
                      style={[
                        styles.engineTitle,
                        {color: colors.ink},
                        engineMode === 'edge-cloud' && styles.selectedFont,
                      ]}>
                      Edge Neural Cloud AI
                    </Text>
                  </View>
                  {engineMode === 'edge-cloud' && (
                    <Check size={16} color={colors.brand} />
                  )}
                </View>
                <Text style={[styles.engineDesc, {color: colors.inkMuted}]}>
                  100% Free · Studio quality · 0% phone heat · No API key needed
                </Text>
              </Pressable>

              {/* Option 2: Chatterbox Local */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{selected: engineMode === 'chatterbox-local'}}
                onPress={() => handleSelectEngineMode('chatterbox-local')}
                style={[
                  styles.engineCard,
                  {
                    backgroundColor: colors.canvas,
                    borderColor:
                      engineMode === 'chatterbox-local'
                        ? colors.brand
                        : colors.border,
                  },
                  engineMode === 'chatterbox-local' && {
                    backgroundColor: colors.brandSoft,
                  },
                ]}>
                <View style={styles.engineCardHeader}>
                  <View style={styles.engineIconRow}>
                    <Zap size={18} color="#E5A93C" />
                    <Text
                      style={[
                        styles.engineTitle,
                        {color: colors.ink},
                        engineMode === 'chatterbox-local' && styles.selectedFont,
                      ]}>
                      Chatterbox AI (Offline)
                    </Text>
                  </View>
                  {engineMode === 'chatterbox-local' && (
                    <Check size={16} color={colors.brand} />
                  )}
                </View>
                <Text style={[styles.engineDesc, {color: colors.inkMuted}]}>
                  100% Offline · On-device neural speech · Zero internet required
                </Text>
              </Pressable>
            </View>

            {/* ENGINE INFO BANNER */}
            <View
              style={[
                styles.infoBanner,
                {
                  backgroundColor:
                    engineMode === 'edge-cloud'
                      ? colors.brandSoft
                      : colors.canvas,
                  borderColor:
                    engineMode === 'edge-cloud' ? colors.brand : colors.border,
                },
              ]}>
              {engineMode === 'edge-cloud' ? (
                <>
                  <Sparkles size={16} color={colors.brand} />
                  <Text style={[styles.infoBannerText, {color: colors.ink}]}>
                    Powered by Microsoft Azure Neural voices. Enjoy unlimited, human-like narration without quota limits.
                  </Text>
                </>
              ) : (
                <>
                  <Zap size={16} color="#E5A93C" />
                  <Text style={[styles.infoBannerText, {color: colors.ink}]}>
                    Runs entirely on your phone's processor using Chatterbox ONNX models. Fully functional without internet.
                  </Text>
                </>
              )}
            </View>

            {/* OPENCODE AI DIRECTOR SECTION */}
            <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
              OPENCODE AI SPEECH DIRECTOR
            </Text>
            <View
              style={[
                styles.opencodeCard,
                {backgroundColor: colors.canvas, borderColor: colors.border},
              ]}>
              <View style={styles.opencodeHeader}>
                <View style={styles.engineIconRow}>
                  <Sparkles size={18} color={colors.brand} />
                  <Text style={[styles.engineTitle, {color: colors.ink}]}>
                    MiMo v2.5 Free Model
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{checked: opencodeEnabled}}
                  onPress={handleToggleOpencode}
                  style={[
                    styles.toggleBadge,
                    {backgroundColor: opencodeEnabled ? colors.brand : colors.surfaceMuted},
                  ]}>
                  <Text style={[styles.toggleBadgeText, {color: opencodeEnabled ? colors.white : colors.inkMuted}]}>
                    {opencodeEnabled ? 'ACTIVE' : 'OFF'}
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.engineDesc, {color: colors.inkMuted, marginTop: 4}]}>
                Fixes split words ("fil ed" → "filled") & directs expressive voice acting (whispering, excited, dramatic).
              </Text>

              <View style={styles.keyRow}>
                <View style={[styles.keyInputWrap, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  <Key size={15} color={colors.inkMuted} style={{marginRight: 6}} />
                  <TextInput
                    style={[styles.keyTextInput, {color: colors.ink}]}
                    placeholder="Enter OpenCode API Key"
                    placeholderTextColor={colors.inkMuted}
                    secureTextEntry={!showOpencodeKey}
                    value={opencodeKey}
                    onChangeText={handleSaveOpencodeKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable onPress={() => setShowOpencodeKey(!showOpencodeKey)} style={{padding: 4}}>
                    {showOpencodeKey ? (
                      <EyeOff size={16} color={colors.inkMuted} />
                    ) : (
                      <Eye size={16} color={colors.inkMuted} />
                    )}
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleTestOpencode}
                  disabled={testingOpencode || !opencodeKey.trim()}
                  style={[
                    styles.testSmallBtn,
                    {
                      backgroundColor: colors.brand,
                      opacity: (testingOpencode || !opencodeKey.trim()) ? 0.5 : 1,
                    },
                  ]}>
                  <Text style={styles.testSmallBtnText}>
                    {testingOpencode ? '...' : 'Test'}
                  </Text>
                </Pressable>
              </View>

              {opencodeStatus && (
                <View
                  style={[
                    styles.opencodeStatus,
                    {
                      backgroundColor: opencodeStatus.success ? '#ECFDF5' : '#FEF2F2',
                      borderColor: opencodeStatus.success ? '#10B981' : '#EF4444',
                    },
                  ]}>
                  {opencodeStatus.success ? (
                    <CheckCircle2 size={14} color="#10B981" />
                  ) : (
                    <XCircle size={14} color="#EF4444" />
                  )}
                  <Text
                    style={[
                      styles.opencodeStatusText,
                      {color: opencodeStatus.success ? '#065F46' : '#991B1B'},
                    ]}>
                    {opencodeStatus.message}
                  </Text>
                </View>
              )}
            </View>

            {/* CHARACTER / VOICE SELECTION */}
            {engineMode === 'edge-cloud' ? (
              <>
                <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
                  EDGE NEURAL CHARACTERS
                </Text>
                <View style={styles.voiceList}>
                  {EDGE_VOICES.map(profile => {
                    const isSelected = profile.id === edgeVoice;
                    return (
                      <Pressable
                        key={profile.id}
                        accessibilityRole="radio"
                        accessibilityState={{selected: isSelected}}
                        onPress={() => handleSelectEdgeVoice(profile.id)}
                        style={[
                          styles.voiceCard,
                          {
                            backgroundColor: colors.canvas,
                            borderColor: isSelected
                              ? colors.brand
                              : colors.border,
                          },
                          isSelected && {backgroundColor: colors.brandSoft},
                        ]}>
                        <View style={styles.voiceCardHeader}>
                          <View style={styles.voiceNameRow}>
                            <Sparkles size={16} color={colors.brand} />
                            <Text
                              style={[
                                styles.voiceName,
                                {color: colors.ink},
                                isSelected && styles.selectedVoiceName,
                              ]}>
                              {profile.name}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.radioCircle,
                              {
                                borderColor: isSelected
                                  ? colors.brand
                                  : colors.border,
                              },
                              isSelected && {backgroundColor: colors.brand},
                            ]}>
                            {isSelected && <Check size={12} color="#FFF" />}
                          </View>
                        </View>
                        <Text
                          style={[styles.voiceDesc, {color: colors.inkMuted}]}
                          numberOfLines={2}>
                          {profile.descriptor}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                {/* CHATTERBOX MODEL STATUS & LIFECYCLE MONITOR */}
                <View
                  style={[
                    styles.modelLifecycleCard,
                    {
                      backgroundColor: colors.canvas,
                      borderColor: isModelRunning ? '#10B981' : colors.border,
                    },
                  ]}>
                  <View style={styles.modelLifecycleHeader}>
                    <View style={styles.engineIconRow}>
                      <View
                        style={[
                          styles.statusDot,
                          {backgroundColor: isModelRunning ? '#10B981' : '#6B7280'},
                        ]}
                      />
                      <Text style={[styles.modelStatusTitle, {color: colors.ink}]}>
                        {isModelRunning ? 'Model Active in RAM' : 'Model Asleep (0% Battery)'}
                      </Text>
                    </View>
                    {isModelRunning && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleUnloadModel}
                        style={[styles.unloadBtn, {borderColor: colors.border}]}>
                        <Text style={[styles.unloadBtnText, {color: colors.inkMuted}]}>
                          Unload from RAM
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={[styles.engineDesc, {color: colors.inkMuted, marginTop: 4}]}>
                    {isModelRunning
                      ? 'The ONNX neural weights are loaded in memory for instant speech generation.'
                      : 'The model is completely unloaded when stopped or closed. It uses 0% CPU and 0% battery when idle.'}
                  </Text>
                </View>

                <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
                  CHATTERBOX CHARACTER VOICES
                </Text>
                <View style={styles.voiceList}>
                  {voices
                    .filter(v => v.engine === 'natural' || v.engine === 'system')
                    .map(voice => {
                      const isSelected = voice.id === selectedVoiceId;
                      const roleTag =
                        voice.id === 'warm'
                          ? 'FICTION · WARMTH'
                          : voice.id === 'clear'
                          ? 'NON-FICTION · CLARITY'
                          : voice.id === 'deep'
                          ? 'MYSTERY · DRAMA'
                          : voice.id === 'gentle'
                          ? 'BEDTIME · CALM'
                          : 'CHARACTER';
                      return (
                        <Pressable
                          key={voice.id}
                          accessibilityRole="radio"
                          accessibilityState={{selected: isSelected}}
                          onPress={() => handleSelectVoice(voice.id)}
                          style={[
                            styles.voiceCard,
                            {
                              backgroundColor: colors.canvas,
                              borderColor: isSelected
                                ? colors.brand
                                : colors.border,
                            },
                            isSelected && {backgroundColor: colors.brandSoft},
                          ]}>
                          <View style={styles.voiceCardHeader}>
                            <View style={styles.voiceNameRow}>
                              <Zap size={16} color="#E5A93C" />
                              <Text
                                style={[
                                  styles.voiceName,
                                  {color: colors.ink},
                                  isSelected && styles.selectedVoiceName,
                                ]}>
                                {voice.name}
                              </Text>
                              <View
                                style={[
                                  styles.voiceTagPill,
                                  {
                                    backgroundColor: isSelected
                                      ? colors.brand
                                      : colors.surfaceMuted,
                                  },
                                ]}>
                                <Text
                                  style={[
                                    styles.voiceTagText,
                                    {
                                      color: isSelected
                                        ? colors.white
                                        : colors.inkMuted,
                                    },
                                  ]}>
                                  {roleTag}
                                </Text>
                              </View>
                            </View>
                            <View
                              style={[
                                styles.radioCircle,
                                {
                                  borderColor: isSelected
                                    ? colors.brand
                                    : colors.border,
                                },
                                isSelected && {backgroundColor: colors.brand},
                              ]}>
                              {isSelected && <Check size={12} color="#FFF" />}
                            </View>
                          </View>
                          <Text
                            style={[styles.voiceDesc, {color: colors.inkMuted}]}
                            numberOfLines={2}>
                            {voice.descriptor}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
                  EXPRESSION PRESET
                </Text>

                <View style={styles.expressionRow}>
                  {expressions.map(expr => {
                    const isSelected = expr.id === selectedExpression;
                    return (
                      <Pressable
                        key={expr.id}
                        accessibilityRole="button"
                        accessibilityState={{selected: isSelected}}
                        onPress={() => handleSelectExpression(expr.id)}
                        style={[
                          styles.expressionPill,
                          {
                            backgroundColor: colors.canvas,
                            borderColor: isSelected
                              ? colors.brand
                              : colors.border,
                          },
                          isSelected && {
                            backgroundColor: colors.brandSoft,
                            borderColor: colors.brand,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.expressionText,
                            {color: isSelected ? colors.brand : colors.ink},
                          ]}>
                          {expr.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.previewSection}>
              <AppButton
                label={isTesting ? 'Playing sample…' : 'Preview Narrator'}
                variant="secondary"
                onPress={handlePreview}
                disabled={isTesting}
                icon={Play}
                style={styles.previewBtn}
              />
            </View>
          </ScrollView>

          <View style={styles.sheetFooter}>
            <AppButton label="Done" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.sectionTitle,
    fontSize: 20,
  },
  modalSubtitle: {
    ...typography.small,
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  sheetBody: {
    marginBottom: spacing.md,
  },
  sheetBodyContent: {
    paddingBottom: spacing.lg,
  },
  modelLifecycleCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  modelLifecycleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelStatusTitle: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  unloadBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  unloadBtnText: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '600',
  },
  voiceTagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: spacing.xs,
  },
  voiceTagText: {
    ...typography.label,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionHeading: {
    ...typography.label,
    fontSize: 12,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  engineGrid: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  engineCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  engineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  engineIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  engineTitle: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 15,
  },
  selectedFont: {
    fontWeight: '700',
  },
  engineDesc: {
    ...typography.small,
    fontSize: 12,
    lineHeight: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  infoBannerText: {
    ...typography.small,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  voiceList: {
    gap: spacing.sm,
  },
  voiceCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  voiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  voiceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  voiceName: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 15,
  },
  selectedVoiceName: {
    fontWeight: '700',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceDesc: {
    ...typography.small,
    fontSize: 13,
    lineHeight: 18,
  },
  expressionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  expressionPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expressionText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  previewSection: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  previewBtn: {
    width: '100%',
  },
  sheetFooter: {
    paddingTop: spacing.xs,
  },
  opencodeCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  opencodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  toggleBadgeText: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '700',
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  keyInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    height: 40,
  },
  keyTextInput: {
    flex: 1,
    height: 40,
    fontSize: 12,
  },
  testSmallBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testSmallBtnText: {
    color: '#FFFFFF',
    ...typography.small,
    fontSize: 12,
    fontWeight: '700',
  },
  opencodeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.xs,
    marginTop: spacing.xs,
  },
  opencodeStatusText: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
