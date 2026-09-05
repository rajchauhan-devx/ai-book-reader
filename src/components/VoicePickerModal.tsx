import React, {useCallback, useEffect, useState} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Check, Play, Sparkles, Volume2, X} from 'lucide-react-native';
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
import {useNarrationEngine} from '../state/NarrationEngineProvider';

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
  const {testNaturalVoice, testPhoneVoice, status: voiceEngineStatus} =
    useNarrationEngine();

  const [voices, setVoices] = useState<VoiceProfile[]>(DEFAULT_VOICES);
  const [expressions, setExpressions] =
    useState<ExpressionPreset[]>(DEFAULT_EXPRESSIONS);
  const [selectedVoiceId, setSelectedVoiceId] = useState('warm');
  const [selectedExpression, setSelectedExpression] = useState('natural');
  const [previewing, setPreviewing] = useState(false);

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
    }
    return () => {
      mounted = false;
    };
  }, [visible]);

  const handleSelectVoice = async (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    const updated = await narrationPipelineService.savePreferences({
      voiceId,
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
      const activeVoice = voices.find(v => v.id === selectedVoiceId);
      if (activeVoice?.engine === 'system') {
        await testPhoneVoice();
      } else {
        await testNaturalVoice();
      }
    } finally {
      setPreviewing(false);
    }
  }, [selectedVoiceId, testNaturalVoice, testPhoneVoice, voices]);

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
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheetCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}
          onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.modalTitle, {color: colors.ink}]}>
                Narrator & Voice
              </Text>
              <Text style={[styles.modalSubtitle, {color: colors.inkMuted}]}>
                Choose who reads your books privately on this device.
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

          <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionHeading, {color: colors.inkMuted}]}>
              CURATED VOICES
            </Text>

            <View style={styles.voiceList}>
              {voices.map(voice => {
                const isSelected = voice.id === selectedVoiceId;
                return (
                  <Pressable
                    key={voice.id}
                    accessibilityRole="radio"
                    accessibilityState={{selected: isSelected}}
                    accessibilityLabel={`${voice.name}: ${voice.descriptor}`}
                    onPress={() => handleSelectVoice(voice.id)}
                    style={[
                      styles.voiceCard,
                      {
                        backgroundColor: colors.canvas,
                        borderColor: isSelected ? colors.brand : colors.border,
                      },
                      isSelected && {
                        backgroundColor: colors.brandSoft,
                      },
                    ]}>
                    <View style={styles.voiceCardHeader}>
                      <View style={styles.voiceNameRow}>
                        {voice.engine === 'natural' ? (
                          <Sparkles size={16} color={colors.brand} />
                        ) : (
                          <Volume2 size={16} color={colors.inkMuted} />
                        )}
                        <Text
                          style={[
                            styles.voiceName,
                            {color: colors.ink},
                            isSelected && styles.selectedVoiceName,
                          ]}>
                          {voice.name}
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
                    accessibilityLabel={expr.name}
                    onPress={() => handleSelectExpression(expr.id)}
                    style={[
                      styles.expressionPill,
                      {
                        backgroundColor: colors.canvas,
                        borderColor: isSelected ? colors.brand : colors.border,
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

            <View style={styles.previewSection}>
              <AppButton
                label={
                  isTesting
                    ? 'Playing sample…'
                    : 'Preview narrator'
                }
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
        </Pressable>
      </Pressable>
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
    maxHeight: '85%',
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
  sectionHeading: {
    ...typography.label,
    fontSize: 12,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
});
