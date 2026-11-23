import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNarrationPlayer } from '../state/NarrationPlayerProvider';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/tokens';
import type { RootStackParamList } from '../types/navigation';

export function MiniPlayer() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    playerState,
    isPlaying,
    isBuffering,
    pause,
    resume,
    stop,
    skipTime,
  } = useNarrationPlayer();

  const containerThemedStyle = React.useMemo(
    () => ({
      backgroundColor: isDark ? '#1A1E26' : '#FFFFFF',
      borderColor: colors.border,
      shadowColor: isDark ? '#000000' : '#D97706',
    }),
    [isDark, colors.border],
  );

  if (playerState.state === 'idle' || !playerState.bookId) {
    return null;
  }

  const handleOpenReader = () => {
    if (!playerState.bookId) return;
    navigation.navigate('Reader', {
      bookId: playerState.bookId,
      initialChapterId: playerState.chapterId ?? undefined,
      initialSentenceIndex: playerState.sentenceIndex,
    });
  };

  const statusText = isBuffering
    ? 'Preparing narration…'
    : playerState.state === 'paused'
    ? `Paused · Sentence ${playerState.sentenceIndex + 1} of ${playerState.totalSentences || 1}`
    : `Sentence ${playerState.sentenceIndex + 1} of ${playerState.totalSentences || 1}`;

  return (
    <View style={[styles.container, containerThemedStyle]}>
      {/* Tap area to expand / open reader */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${playerState.bookTitle ?? 'Book'}. Tap to open reader.`}
        onPress={handleOpenReader}
        style={styles.infoArea}
      >
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: isPlaying ? colors.listenSoft : colors.surfaceMuted,
            },
          ]}
        >
          {isBuffering ? (
            <ActivityIndicator size="small" color={colors.listen} />
          ) : (
            <Headphones
              size={18}
              color={isPlaying ? colors.listen : colors.inkMuted}
            />
          )}
        </View>

        <View style={styles.textContainer}>
          <Text
            style={[styles.title, { color: colors.ink }]}
            numberOfLines={1}
          >
            {playerState.chapterTitle || playerState.bookTitle || 'Book Narration'}
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.inkMuted }]}
            numberOfLines={1}
          >
            {statusText}
          </Text>
        </View>
      </Pressable>

      {/* Playback Controls */}
      <View style={styles.controlsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rewind 15 seconds"
          onPress={() => skipTime(-15000)}
          style={styles.controlBtn}
          hitSlop={8}
        >
          <RotateCcw size={18} color={colors.ink} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause narration' : 'Play narration'}
          onPress={() => (isPlaying ? pause() : resume())}
          style={[
            styles.playPauseBtn,
            { backgroundColor: colors.listen },
          ]}
          hitSlop={8}
        >
          {isPlaying ? (
            <Pause size={18} color="#FFFFFF" />
          ) : (
            <Play size={18} color="#FFFFFF" fill="#FFFFFF" />
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fast forward 30 seconds"
          onPress={() => skipTime(30000)}
          style={styles.controlBtn}
          hitSlop={8}
        >
          <RotateCw size={18} color={colors.ink} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close player"
          onPress={() => stop()}
          style={styles.closeBtn}
          hitSlop={8}
        >
          <X size={16} color={colors.inkMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginHorizontal: spacing.sm,
    marginBottom: 6,
    borderWidth: 1,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  infoArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.xs,
  },
  controlBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  playPauseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginLeft: 2,
  },
});
