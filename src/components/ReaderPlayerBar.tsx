import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Moon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react-native';
import { useNarrationPlayer } from '../state/NarrationPlayerProvider';
import type { SleepTimerPreset } from '../services/narrationPlayer';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/tokens';

const SPEED_OPTIONS: number[] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const SLEEP_OPTIONS: { key: SleepTimerPreset; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: '10m', label: '10 minutes' },
  { key: '20m', label: '20 minutes' },
  { key: '30m', label: '30 minutes' },
  { key: '45m', label: '45 minutes' },
  { key: '60m', label: '60 minutes' },
  { key: 'chapter', label: 'End of Chapter' },
];

interface ReaderPlayerBarProps {
  bookId: string;
  chapterId: string;
  chapterTitle?: string;
  bookTitle?: string;
  activeSentenceIndex: number;
  totalSentences: number;
  pageSize?: number;
  onOpenVoicePicker: () => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  hasPrevChapter?: boolean;
  hasNextChapter?: boolean;
}

export function ReaderPlayerBar({
  bookId,
  chapterId,
  chapterTitle: _chapterTitle,
  bookTitle: _bookTitle,
  activeSentenceIndex,
  totalSentences,
  pageSize,
  onOpenVoicePicker,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter = false,
  hasNextChapter = false,
}: ReaderPlayerBarProps) {
  const { colors, isDark } = useAppTheme();
  const {
    playerState,
    isPlaying,
    isBuffering,
    play,
    pause,
    resume,
    nextSentence,
    prevSentence,
    skipTime,
    setSpeed,
    setSleepTimer,
  } = useNarrationPlayer();

  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showSleepModal, setShowSleepModal] = useState(false);

  const isCurrentBookPlaying =
    playerState.bookId === bookId && playerState.chapterId === chapterId;

  const displaySentenceIndex = isCurrentBookPlaying
    ? playerState.sentenceIndex
    : activeSentenceIndex;

  const displayTotalSentences = isCurrentBookPlaying
    ? playerState.totalSentences || totalSentences
    : totalSentences;

  const handlePlayPause = async () => {
    if (isCurrentBookPlaying) {
      if (isPlaying) {
        await pause();
      } else {
        await resume();
      }
    } else {
      // Start playing this chapter and sentence
      if (pageSize !== undefined) {
        await play(
          bookId,
          chapterId,
          activeSentenceIndex,
          undefined,
          undefined,
          undefined,
          pageSize,
        );
      } else {
        await play(bookId, chapterId, activeSentenceIndex);
      }
    }
  };

  const formatTimerLabel = () => {
    if (!playerState.isSleepTimerActive) return null;
    if (playerState.sleepTimerEndOfChapter) return 'End';
    const mins = Math.ceil(playerState.sleepTimerSecondsRemaining / 60);
    return `${mins}m`;
  };

  const barThemedStyle = React.useMemo(
    () => ({
      borderTopColor: colors.border,
    }),
    [colors.border],
  );

  const selectedRowStyle = React.useMemo(
    () => ({ backgroundColor: colors.listenSoft }),
    [colors.listenSoft],
  );

  return (
    <View
      style={[
        styles.barContainer,
        isDark ? styles.barDark : styles.barLight,
        barThemedStyle,
      ]}
    >
      {/* Top Status / Progress row */}
      <View style={styles.topStatusRow}>
        <View style={styles.sentenceInfo}>
          <Text style={[styles.sentenceBadge, playerState.state === 'error' ? styles.errorText : { color: colors.ink }]}>
            {playerState.state === 'error'
              ? 'Narration Error'
              : isBuffering
              ? (playerState.pagePreparationTotal && playerState.pagePreparationTotal > 0
                  ? `Preparing page (${playerState.pagePreparationReady || 0}/${playerState.pagePreparationTotal})…`
                  : 'Preparing narration…')
              : `Sentence ${displaySentenceIndex + 1} of ${displayTotalSentences || 1}`}
          </Text>
        </View>

        <View style={styles.topActionsRow}>
          {/* Speed Selector Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Playback speed ${playerState?.speed ?? 1.0}x. Tap to change.`}
            onPress={() => setShowSpeedModal(true)}
            style={[styles.miniPill, { backgroundColor: colors.surfaceMuted }]}
          >
            <Gauge size={13} color={colors.ink} />
            <Text style={[styles.miniPillText, { color: colors.ink }]}>
              {(playerState?.speed ?? 1.0).toFixed(2).replace(/\.?0+$/, '')}×
            </Text>
          </Pressable>

          {/* Sleep Timer Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sleep timer settings"
            onPress={() => setShowSleepModal(true)}
            style={[
              styles.miniPill,
              {
                backgroundColor: playerState.isSleepTimerActive
                  ? colors.listenSoft
                  : colors.surfaceMuted,
              },
            ]}
          >
            <Moon
              size={13}
              color={
                playerState.isSleepTimerActive ? colors.listen : colors.ink
              }
            />
            {formatTimerLabel() && (
              <Text
                style={[
                  styles.miniPillText,
                  styles.boldText,
                  { color: colors.listen },
                ]}
              >
                {formatTimerLabel()}
              </Text>
            )}
          </Pressable>

          {/* Voice Picker Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice settings and engine mode"
            onPress={onOpenVoicePicker}
            style={[styles.miniPill, { backgroundColor: colors.surfaceMuted }]}
          >
            <Volume2 size={13} color={colors.ink} />
            <Text style={[styles.miniPillText, { color: colors.ink }]}>
              {playerState.engineMode === 'chatterbox-local' ? 'Chatterbox' : 'Edge'}
            </Text>
            {playerState.engineMode === 'chatterbox-local' && (
              <View
                style={[
                  styles.engineStatusDot,
                  { backgroundColor: playerState.isModelLoaded ? '#10B981' : '#9CA3AF' },
                ]}
              />
            )}
          </Pressable>
        </View>
      </View>

      {/* Error notification banner if any engine/API issue occurred */}
      {playerState.errorMessage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Narration Error: ${playerState.errorMessage}. Tap to configure settings.`}
          onPress={onOpenVoicePicker}
          style={styles.errorBanner}
        >
          <AlertCircle size={14} color="#DC2626" />
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {playerState.errorMessage}
          </Text>
          <Text style={styles.errorActionText}>Fix Settings →</Text>
        </Pressable>
      ) : null}

      {/* Main Playback Controls */}
      <View style={styles.controlsRow}>
        {/* Previous Chapter */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous chapter"
          disabled={!hasPrevChapter}
          onPress={onPrevChapter}
          style={[
            styles.navBtn,
            !hasPrevChapter && styles.disabledBtn,
          ]}
        >
          <SkipBack size={18} color={colors.ink} />
        </Pressable>

        {/* Skip Back 15s */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip backward 15 seconds"
          onPress={() => skipTime(-15000)}
          style={styles.navBtn}
        >
          <RotateCcw size={20} color={colors.ink} />
        </Pressable>

        {/* Previous Sentence */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous sentence"
          disabled={displaySentenceIndex <= 0}
          onPress={prevSentence}
          style={[
            styles.navBtn,
            displaySentenceIndex <= 0 && styles.disabledBtn,
          ]}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>

        {/* Center Big Play/Pause Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isPlaying && isCurrentBookPlaying ? 'Pause narration' : 'Play narration'
          }
          onPress={handlePlayPause}
          style={[
            styles.mainPlayBtn,
            { backgroundColor: colors.listen },
          ]}
        >
          {isBuffering && isCurrentBookPlaying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : isPlaying && isCurrentBookPlaying ? (
            <Pause size={24} color="#FFFFFF" />
          ) : (
            <Play size={24} color="#FFFFFF" fill="#FFFFFF" />
          )}
        </Pressable>

        {/* Next Sentence */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next sentence"
          disabled={displaySentenceIndex >= displayTotalSentences - 1}
          onPress={nextSentence}
          style={[
            styles.navBtn,
            displaySentenceIndex >= displayTotalSentences - 1 && styles.disabledBtn,
          ]}
        >
          <ChevronRight size={24} color={colors.ink} />
        </Pressable>

        {/* Skip Forward 30s */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip forward 30 seconds"
          onPress={() => skipTime(30000)}
          style={styles.navBtn}
        >
          <RotateCw size={20} color={colors.ink} />
        </Pressable>

        {/* Next Chapter */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next chapter"
          disabled={!hasNextChapter}
          onPress={onNextChapter}
          style={[
            styles.navBtn,
            !hasNextChapter && styles.disabledBtn,
          ]}
        >
          <SkipForward size={18} color={colors.ink} />
        </Pressable>
      </View>

      {/* Speed Selector Modal Sheet */}
      <Modal visible={showSpeedModal} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowSpeedModal(false)}
        >
          <View
            style={[
              styles.sheetContainer,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.ink }]}>
                Playback Speed
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close speed selection"
                onPress={() => setShowSpeedModal(false)}
                style={styles.sheetCloseBtn}
              >
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            </View>

            <View style={styles.optionsGrid}>
              {SPEED_OPTIONS.map(spd => {
                const isSelected = Math.abs(playerState.speed - spd) < 0.05;
                return (
                  <Pressable
                    key={spd}
                    accessibilityRole="button"
                    accessibilityLabel={`${spd}x speed`}
                    onPress={async () => {
                      await setSpeed(spd);
                      setShowSpeedModal(false);
                    }}
                    style={[
                      styles.speedOptionBtn,
                      {
                        backgroundColor: isSelected
                          ? colors.listenSoft
                          : colors.surfaceMuted,
                        borderColor: isSelected ? colors.listen : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.speedOptionText,
                        isSelected ? styles.boldText : styles.mediumText,
                        {
                          color: isSelected ? colors.listen : colors.ink,
                        },
                      ]}
                    >
                      {spd.toFixed(2).replace(/\.?0+$/, '')}×
                    </Text>
                    {isSelected && <Check size={16} color={colors.listen} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Sleep Timer Modal Sheet */}
      <Modal visible={showSleepModal} transparent animationType="fade">
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowSleepModal(false)}
        >
          <View
            style={[
              styles.sheetContainer,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.ink }]}>
                Sleep Timer
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close sleep timer selection"
                onPress={() => setShowSleepModal(false)}
                style={styles.sheetCloseBtn}
              >
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            </View>

            <View style={styles.sleepOptionsList}>
              {SLEEP_OPTIONS.map(opt => {
                const isSelected =
                  opt.key === 'chapter'
                    ? playerState.sleepTimerEndOfChapter
                    : opt.key === 'off'
                    ? !playerState.isSleepTimerActive
                    : playerState.isSleepTimerActive &&
                      !playerState.sleepTimerEndOfChapter;

                return (
                  <Pressable
                    key={opt.key}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    onPress={async () => {
                      await setSleepTimer(opt.key);
                      setShowSleepModal(false);
                    }}
                    style={[
                      styles.sleepOptionRow,
                      isSelected && selectedRowStyle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sleepOptionLabel,
                        isSelected ? styles.boldText : styles.regularText,
                        {
                          color: isSelected ? colors.listen : colors.ink,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && <Check size={18} color={colors.listen} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  topStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sentenceInfo: {
    flex: 1,
  },
  sentenceBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  miniPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  engineStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  navBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  mainPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#854D0E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetCloseBtn: {
    padding: 4,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  speedOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '30%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  speedOptionText: {
    fontSize: 14,
  },
  sleepOptionsList: {
    gap: 4,
  },
  sleepOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  sleepOptionLabel: {
    fontSize: 15,
  },
  barDark: {
    backgroundColor: '#1C1917',
  },
  barLight: {
    backgroundColor: '#FFFFFF',
  },
  disabledBtn: {
    opacity: 0.3,
  },
  boldText: {
    fontWeight: '700',
  },
  mediumText: {
    fontWeight: '500',
  },
  regularText: {
    fontWeight: '400',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.xs,
    gap: 6,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#991B1B',
  },
  errorActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  errorText: {
    color: '#DC2626',
  },
});
