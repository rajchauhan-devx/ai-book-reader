import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  BookOpen,
  Database,
  Music2,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import { useModelDownload } from '../state/ModelDownloadProvider';
import { bookLibraryService } from '../services/bookLibrary';
import {
  formatStorage,
  storageBackupService,
  type StorageBreakdown,
} from '../services/storageBackup';

export function StorageScreen() {
  const { colors } = useAppTheme();
  const { status: modelStatus, removeModel } = useModelDownload();
  const [breakdown, setBreakdown] = useState<StorageBreakdown>({
    modelsBytes: 0,
    audioBytes: 0,
    booksBytes: 0,
    databaseBytes: 0,
    freeBytes: 1024 * 1024 * 1024 * 50,
    totalBytes: 1024 * 1024 * 1024 * 128,
    books: [],
  });
  const [_loading, setLoading] = useState(false);

  const refreshStorage = useCallback(async () => {
    setLoading(true);
    try {
      const data = await storageBackupService.getStorageBreakdown();
      setBreakdown(data);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStorage();
    }, [refreshStorage]),
  );

  const totalAppUsed =
    breakdown.modelsBytes +
    breakdown.audioBytes +
    breakdown.booksBytes +
    breakdown.databaseBytes;

  const isLowStorage = breakdown.freeBytes < 250 * 1024 * 1024; // < 250 MB

  // Segment widths for visual bar
  const totalBar = Math.max(totalAppUsed + breakdown.freeBytes, 1);
  const modelPct = (breakdown.modelsBytes / totalBar) * 100;
  const audioPct = (breakdown.audioBytes / totalBar) * 100;
  const booksPct = (breakdown.booksBytes / totalBar) * 100;
  const dbPct = (breakdown.databaseBytes / totalBar) * 100;

  const handleClearBookAudio = (bookId: string, title: string) => {
    Alert.alert(
      'Clear Narration Audio?',
      `Remove generated narration audio for "${title}"? Book text, notes, and reading progress will remain intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Audio',
          style: 'destructive',
          onPress: async () => {
            await storageBackupService.deleteBookAudio(bookId);
            refreshStorage();
          },
        },
      ],
    );
  };

  const handleDeleteBook = (bookId: string, title: string) => {
    Alert.alert(
      'Delete Book?',
      `Completely remove "${title}" along with its notes, bookmarks, and generated audio from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([
              bookLibraryService.removeBook(bookId),
              storageBackupService.deleteBookAudio(bookId),
            ]);
            refreshStorage();
          },
        },
      ],
    );
  };

  const handleRemoveAllAudio = () => {
    Alert.alert(
      'Remove all generated audio?',
      'All speech files will be deleted to free space. You can regenerate audio for any chapter whenever you want.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Audio',
          style: 'destructive',
          onPress: async () => {
            for (const b of breakdown.books) {
              await storageBackupService.deleteBookAudio(b.id);
            }
            refreshStorage();
          },
        },
      ],
    );
  };

  const categories = [
    {
      icon: Sparkles,
      label: 'Natural voice model',
      size:
        modelStatus.state === 'ready'
          ? formatStorage(breakdown.modelsBytes)
          : 'Not installed',
      color: '#315C4C',
    },
    {
      icon: Music2,
      label: 'Generated audio',
      size: formatStorage(breakdown.audioBytes),
      color: '#D69A45',
    },
    {
      icon: BookOpen,
      label: 'Books & covers',
      size: formatStorage(breakdown.booksBytes),
      color: '#A85849',
    },
    {
      icon: Database,
      label: 'App database & notes',
      size: formatStorage(breakdown.databaseBytes),
      color: '#705A76',
    },
  ];

  const modelWidth = useMemo(
    () => ({ width: `${Math.max(modelPct, 2)}%` as `${number}%` }),
    [modelPct],
  );
  const audioWidth = useMemo(
    () => ({ width: `${Math.max(audioPct, 2)}%` as `${number}%` }),
    [audioPct],
  );
  const booksWidth = useMemo(
    () => ({ width: `${Math.max(booksPct, 2)}%` as `${number}%` }),
    [booksPct],
  );
  const dbWidth = useMemo(
    () => ({ width: `${Math.max(dbPct, 2)}%` as `${number}%` }),
    [dbPct],
  );

  return (
    <Screen contentStyle={styles.content}>
      {/* Low Storage Alert */}
      {isLowStorage && (
        <View style={[styles.alertBanner, styles.alertBannerLow]}>
          <AlertTriangle size={20} color="#B91C1C" />
          <Text style={[styles.alertText, styles.alertTextLow]}>
            Low storage ({formatStorage(breakdown.freeBytes)} remaining). Consider removing generated audio to free space.
          </Text>
        </View>
      )}

      {/* Main Usage Summary Card */}
      <View style={[styles.usageCard, { backgroundColor: colors.brand }]}>
        <Text style={styles.usageKicker}>STORAGE BREAKDOWN</Text>
        <Text style={styles.usageValue}>{formatStorage(totalAppUsed)}</Text>
        <Text style={styles.usageBody}>used by AI Book Reader</Text>

        {/* Multi-segmented visual bar */}
        <View style={styles.segmentedBar}>
          {modelPct > 0 && <View style={[styles.barSegment, styles.segmentModel, modelWidth]} />}
          {audioPct > 0 && <View style={[styles.barSegment, styles.segmentAudio, audioWidth]} />}
          {booksPct > 0 && <View style={[styles.barSegment, styles.segmentBooks, booksWidth]} />}
          {dbPct > 0 && <View style={[styles.barSegment, styles.segmentDb, dbWidth]} />}
        </View>

        <Text style={styles.usageFooter}>
          {formatStorage(breakdown.freeBytes)} available on phone
        </Text>
      </View>

      {/* Categories List */}
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Storage categories</Text>
      <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {categories.map((category, index) => {
          const Icon = category.icon;
          return (
            <View
              key={category.label}
              style={[
                styles.row,
                index < categories.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: `${category.color}18` }]}>
                <Icon size={20} color={category.color} />
              </View>
              <Text style={[styles.label, { color: colors.ink }]}>{category.label}</Text>
              <Text style={[styles.size, { color: colors.inkMuted }]}>{category.size}</Text>
            </View>
          );
        })}
      </View>

      {/* Per-Book Storage Section */}
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>
        Books ({breakdown.books.length})
      </Text>
      {breakdown.books.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.inkMuted }]}>
            No imported books in your library yet.
          </Text>
        </View>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {breakdown.books.map((b, idx) => (
            <View
              key={b.id}
              style={[
                styles.bookRow,
                idx < breakdown.books.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={styles.bookInfo}>
                <Text style={[styles.bookTitle, { color: colors.ink }]} numberOfLines={1}>
                  {b.title}
                </Text>
                <Text style={[styles.bookSubtitle, { color: colors.inkMuted }]}>
                  {b.format.toUpperCase()} · Text: {formatStorage(b.sourceSizeBytes)} · Audio:{' '}
                  {formatStorage(b.audioSizeBytes)}
                </Text>
              </View>

              <View style={styles.bookActions}>
                {b.audioSizeBytes > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Clear narration for ${b.title}`}
                    onPress={() => handleClearBookAudio(b.id, b.title)}
                    style={[styles.smallActionBtn, { backgroundColor: colors.surfaceMuted }]}
                    hitSlop={6}
                  >
                    <Music2 size={13} color={colors.ink} />
                    <Text style={[styles.smallActionText, { color: colors.ink }]}>Clear</Text>
                  </Pressable>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${b.title}`}
                  onPress={() => handleDeleteBook(b.id, b.title)}
                  style={[styles.smallActionBtn, styles.deleteActionBtn]}
                  hitSlop={6}
                >
                  <Trash2 size={13} color="#B91C1C" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Global Cleanup Actions */}
      <View style={styles.globalActions}>
        {breakdown.audioBytes > 0 && (
          <AppButton
            label="Remove all generated audio"
            icon={Trash2}
            variant="secondary"
            fullWidth
            onPress={handleRemoveAllAudio}
          />
        )}

        {modelStatus.state === 'ready' && (
          <AppButton
            label="Remove Kokoro neural voice model (~86 MB)"
            icon={Trash2}
            variant="ghost"
            fullWidth
            onPress={() =>
              Alert.alert(
                'Remove Kokoro neural voice files?',
                'You can re-download the Kokoro neural voice pack anytime in Model Setup.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () =>
                      removeModel()
                        .then(refreshStorage)
                        .catch(error =>
                          Alert.alert('Could not remove voice', error.message),
                        ),
                  },
                ],
              )
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  alertBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  alertText: { ...typography.small, flex: 1, fontWeight: '600' },
  usageCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    minHeight: 190,
    justifyContent: 'center',
  },
  usageKicker: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  usageValue: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  usageBody: { color: 'rgba(255,255,255,0.76)', ...typography.body },
  segmentedBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: spacing.lg,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  barSegment: { height: '100%' },
  usageFooter: {
    color: 'rgba(255,255,255,0.72)',
    ...typography.small,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.label, flex: 1 },
  size: typography.small,
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: { ...typography.small },
  bookRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bookInfo: { flex: 1 },
  bookTitle: { ...typography.label, fontSize: 13 },
  bookSubtitle: { ...typography.small, fontSize: 11, marginTop: 2 },
  bookActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  smallActionText: { fontSize: 11, fontWeight: '600' },
  globalActions: { marginTop: spacing.xl, gap: spacing.sm },
  alertBannerLow: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  alertTextLow: {
    color: '#B91C1C',
  },
  segmentModel: {
    backgroundColor: '#4ADE80',
  },
  segmentAudio: {
    backgroundColor: '#FBBF24',
  },
  segmentBooks: {
    backgroundColor: '#F87171',
  },
  segmentDb: {
    backgroundColor: '#C084FC',
  },
  deleteActionBtn: {
    backgroundColor: '#FEE2E2',
  },
});
