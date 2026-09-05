import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Plus,
  ScanText,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import { useLibrary } from '../state/LibraryProvider';
import { formatBookBytes } from '../services/bookLibrary';

const formats = [
  { icon: BookOpen, title: 'EPUB', subtitle: 'Best chapter structure' },
  { icon: ScanText, title: 'PDF', subtitle: 'Text-based files' },
  { icon: FileText, title: 'TXT', subtitle: 'Plain text books' },
];

export function ImportBookScreen() {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [importedId, setImportedId] = useState<string>();
  const [selectedGenre, setSelectedGenre] = useState<string>('Uncategorized');
  const {
    error,
    books,
    selectedBook,
    importProgress,
    chooseAndImportBook,
    cancelImport,
    updateBookMetadata,
  } = useLibrary();
  const busy =
    importProgress.phase === 'choosing' ||
    importProgress.phase === 'copying' ||
    importProgress.phase === 'checking' ||
    importProgress.phase === 'cancelling';
  const copying =
    importProgress.phase === 'copying' || importProgress.phase === 'checking';
  const complete = importProgress.phase === 'complete';
  const failed = importProgress.phase === 'failed';
  const percent = Math.round(importProgress.progress * 100);
  const cancelling = importProgress.phase === 'cancelling';
  const knownProgress =
    importProgress.totalBytes > 0 || importProgress.phase === 'checking';

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.ink }]}>Import a book</Text>
        <Text style={[styles.intro, { color: colors.inkMuted }]}>
          Choose a file you own and save a private copy on this phone. EPUB, PDF
          and TXT text preparation starts automatically after import. Open the
          book to see progress and read.
        </Text>
      </View>

      <View style={styles.formats}>
        {formats.map(format => {
          const Icon = format.icon;
          return (
            <View
              key={format.title}
              style={[
                styles.formatCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.formatIcon,
                  { backgroundColor: colors.brandSoft },
                ]}
              >
                <Icon size={22} color={colors.brand} />
              </View>
              <Text style={[styles.formatTitle, { color: colors.ink }]}>
                {format.title}
              </Text>
              <Text style={[styles.formatBody, { color: colors.inkMuted }]}>
                {format.subtitle}
              </Text>
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.dropzone,
          { backgroundColor: colors.surface, borderColor: colors.brand },
        ]}
      >
        <View style={[styles.addIcon, { backgroundColor: colors.brandSoft }]}>
          <Plus size={30} color={colors.brand} />
        </View>
        <Text style={[styles.dropTitle, { color: colors.ink }]}>
          Choose from your device
        </Text>
        <Text style={[styles.dropBody, { color: colors.inkMuted }]}>
          The Android file picker lets you choose from Files, Drive, or
          connected storage without giving the app broad access.
          {'\n'}Import up to 250 MB. Preparation: TXT up to 16 MiB; PDF up to 64
          MiB / 1,000 pages. Scanned PDFs need OCR (not included).
        </Text>
        <AppButton
          label={
            importProgress.phase === 'choosing'
              ? 'Waiting for a file…'
              : cancelling
              ? 'Stopping import…'
              : copying
              ? 'Importing book…'
              : complete
              ? 'Choose another file'
              : 'Choose file'
          }
          fullWidth
          loading={busy}
          onPress={async () => {
            setImportedId(undefined);
            const book = await chooseAndImportBook();
            setImportedId(book?.id);
          }}
        />
        {copying ? (
          <AppButton
            label="Stop import"
            icon={X}
            variant="ghost"
            onPress={cancelImport}
            style={styles.cancelButton}
          />
        ) : null}
      </View>

      {importProgress.phase !== 'idle' ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.statusCard,
            {
              backgroundColor: failed ? colors.surface : colors.brandSoft,
              borderColor: failed ? colors.danger : colors.border,
            },
          ]}
        >
          <View style={styles.statusHeader}>
            {complete ? (
              <CheckCircle2 size={22} color={colors.success} />
            ) : failed ? (
              <AlertCircle size={22} color={colors.danger} />
            ) : (
              <FileText size={22} color={colors.brand} />
            )}
            <View style={styles.flex}>
              <Text style={[styles.statusTitle, { color: colors.ink }]}>
                {complete
                  ? importProgress.message
                  : failed
                  ? 'Import needs attention'
                  : importProgress.message}
              </Text>
              {selectedBook ? (
                <Text
                  style={[styles.statusBody, { color: colors.inkMuted }]}
                  numberOfLines={2}
                >
                  {selectedBook.name}
                  {selectedBook.size > 0
                    ? ` · ${formatBookBytes(selectedBook.size)}`
                    : ''}
                </Text>
              ) : null}
              {error ? (
                <Text style={[styles.statusBody, { color: colors.danger }]}>
                  {error}
                </Text>
              ) : null}
            </View>
            {copying ? (
              <Text style={[styles.percent, { color: colors.brand }]}>
                {knownProgress
                  ? `${percent}%`
                  : formatBookBytes(importProgress.copiedBytes)}
              </Text>
            ) : null}
          </View>
          {copying && knownProgress ? (
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.brand,
                    width: `${percent}%`,
                  },
                ]}
              />
            </View>
          ) : null}
          {complete && importedId ? (
            <View style={styles.genreSection}>
              <Text style={[styles.genreLabel, { color: colors.ink }]}>
                Choose genre (optional):
              </Text>
              <View style={styles.genreChips}>
                {[
                  'Fiction',
                  'Non-Fiction',
                  'Sci-Fi',
                  'Fantasy',
                  'Mystery',
                  'Biography',
                  'History',
                  'Philosophy',
                  'Self-Help',
                  'Classics',
                ].map(g => {
                  const active = selectedGenre === g;
                  return (
                    <Pressable
                      key={g}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={async () => {
                        setSelectedGenre(g);
                        const book = books.find(b => b.id === importedId);
                        if (book) {
                          await updateBookMetadata(
                            importedId,
                            book.title,
                            book.author,
                            g,
                            book.coverChoice ?? -1,
                          );
                        }
                      }}
                      style={[
                        styles.genreChip,
                        {
                          backgroundColor: active ? colors.brand : colors.surface,
                          borderColor: active ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.genreChipText,
                          { color: active ? colors.white : colors.ink },
                        ]}
                      >
                        {g}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {complete && importedId ? (
            <AppButton
              label="Open imported book"
              fullWidth
              onPress={() =>
                navigation.navigate('BookDetails', { bookId: importedId })
              }
              style={styles.doneButton}
            />
          ) : null}
          {complete ? (
            <AppButton
              label="Back to library"
              variant="secondary"
              fullWidth
              onPress={() => navigation.goBack()}
              style={styles.doneButton}
            />
          ) : null}
        </View>
      ) : null}

      <View style={[styles.privacy, { backgroundColor: colors.listenSoft }]}>
        <LockKeyhole size={20} color={colors.listen} />
        <View style={styles.flex}>
          <Text style={[styles.privacyTitle, { color: colors.ink }]}>
            Private by design
          </Text>
          <Text style={[styles.privacyBody, { color: colors.inkMuted }]}>
            Your file is not uploaded. Protected books cannot be read or
            narrated.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heading: { alignItems: 'center', marginTop: spacing.lg },
  title: { ...typography.pageTitle, textAlign: 'center' },
  intro: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 520,
  },
  formats: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xl },
  formatCard: {
    flex: 1,
    minHeight: 132,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  formatIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatTitle: { ...typography.label, marginTop: spacing.xs },
  formatBody: {
    ...typography.small,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  dropzone: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  addIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: { ...typography.sectionTitle, marginTop: spacing.md },
  dropBody: {
    ...typography.small,
    textAlign: 'center',
    maxWidth: 440,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  cancelButton: { marginTop: spacing.xs },
  statusCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  statusTitle: typography.label,
  statusBody: { ...typography.small, marginTop: 2 },
  percent: { ...typography.label, fontVariant: ['tabular-nums'] },
  progressTrack: {
    height: 7,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  doneButton: { marginTop: spacing.md },
  genreSection: { marginTop: spacing.md, gap: spacing.xs },
  genreLabel: { ...typography.label, fontSize: 13 },
  genreChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  genreChipText: { fontSize: 12, fontWeight: '600' },
  privacy: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  privacyTitle: typography.label,
  privacyBody: { ...typography.small, marginTop: 2 },
  flex: { flex: 1 },
});
