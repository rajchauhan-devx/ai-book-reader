import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  FolderPlus,
  LockKeyhole,
  Plus,
  ScanText,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type { BookSelection } from '../types/library';
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
  const [targetCategory, setTargetCategory] = useState<string>('Default');
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [pendingSelection, setPendingSelection] =
    useState<BookSelection | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  const {
    error,
    books,
    categories,
    addCategory,
    selectedBook,
    importProgress,
    chooseBookSelection,
    importBookSelection,
    cancelImport,
    clearImportResult,
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

  const handleChooseFile = async () => {
    setImportedId(undefined);
    const selection = await chooseBookSelection();
    if (selection) {
      setPendingSelection(selection);
      setTargetCategory('Default');
      setShowCreateInput(false);
      setNewCatName('');
      setCategoryModalVisible(true);
    }
  };

  const handleConfirmCategoryAndImport = async () => {
    if (!pendingSelection) return;
    const cat = targetCategory.trim() || 'Default';
    setCategoryModalVisible(false);
    const book = await importBookSelection(pendingSelection, cat);
    setImportedId(book?.id);
    setPendingSelection(null);
  };

  const handleCancelCategoryModal = () => {
    setCategoryModalVisible(false);
    setPendingSelection(null);
    clearImportResult();
  };

  const handleCreateCategory = async () => {
    const trimmed = newCatName.trim();
    if (trimmed) {
      await addCategory(trimmed);
      setTargetCategory(trimmed);
      setNewCatName('');
      setShowCreateInput(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      {/* Aniyomi-Style Category Selection Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelCategoryModal}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={handleCancelCategoryModal}
        >
          <Pressable
            style={[
              styles.categoryModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View
                style={[
                  styles.modalHeaderIcon,
                  { backgroundColor: colors.brandSoft },
                ]}
              >
                <FolderPlus size={20} color={colors.brand} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.modalTitle, { color: colors.ink }]}>
                  Add to Category
                </Text>
              </View>
            </View>

            {pendingSelection?.name ? (
              <View
                style={[
                  styles.bookNameBadge,
                  { backgroundColor: colors.surfaceMuted },
                ]}
              >
                <Text
                  style={[styles.bookNameText, { color: colors.inkMuted }]}
                  numberOfLines={2}
                >
                  {pendingSelection.name}
                </Text>
              </View>
            ) : null}

            <Text
              style={[
                styles.categoryPrompt,
                { color: colors.ink, marginTop: spacing.xs },
              ]}
            >
              Select category for this book:
            </Text>

            <ScrollView
              style={styles.categoryListScroll}
              showsVerticalScrollIndicator={false}
            >
              {categories.map(cat => {
                const isSelected = targetCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setTargetCategory(cat)}
                    style={[
                      styles.categoryOptionRow,
                      {
                        backgroundColor: isSelected
                          ? colors.brandSoft
                          : 'transparent',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radioCircle,
                        {
                          borderColor: isSelected ? colors.brand : colors.border,
                          backgroundColor: isSelected
                            ? colors.brand
                            : 'transparent',
                        },
                      ]}
                    >
                      {isSelected ? (
                        <Check size={12} color={colors.white} strokeWidth={3} />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.categoryOptionText,
                        {
                          color: isSelected ? colors.brand : colors.ink,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {showCreateInput ? (
              <View style={styles.createCategoryInputRow}>
                <TextInput
                  autoFocus
                  placeholder="Category name…"
                  placeholderTextColor={colors.inkMuted}
                  value={newCatName}
                  onChangeText={setNewCatName}
                  maxLength={40}
                  onSubmitEditing={handleCreateCategory}
                  style={[
                    styles.createInput,
                    {
                      color: colors.ink,
                      borderColor: colors.border,
                      backgroundColor: colors.canvas,
                    },
                  ]}
                />
                <AppButton
                  label="Add"
                  disabled={!newCatName.trim()}
                  onPress={handleCreateCategory}
                  style={styles.addCategoryButton}
                />
                <Pressable
                  onPress={() => setShowCreateInput(false)}
                  style={styles.cancelCreateButton}
                >
                  <X size={18} color={colors.inkMuted} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowCreateInput(true)}
                style={styles.createRow}
              >
                <Plus size={16} color={colors.brand} />
                <Text
                  style={[
                    styles.createRowText,
                    { color: colors.brand },
                  ]}
                >
                  Create new category
                </Text>
              </Pressable>
            )}

            <View style={styles.modalActions}>
              <View style={styles.modalActionFlex}>
                <AppButton
                  label="Cancel"
                  variant="ghost"
                  fullWidth
                  onPress={handleCancelCategoryModal}
                />
              </View>
              <View style={styles.modalActionFlex}>
                <AppButton
                  label="Add to Library"
                  fullWidth
                  onPress={handleConfirmCategoryAndImport}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
          onPress={handleChooseFile}
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
                Category:
              </Text>
              <View style={styles.genreChips}>
                {categories.map(c => {
                  const book = books.find(b => b.id === importedId);
                  const isCurrent =
                    c.toLowerCase() === 'default'
                      ? !book?.genre ||
                        book.genre === 'Default' ||
                        book.genre === 'Uncategorized'
                      : book?.genre?.toLowerCase() === c.toLowerCase();
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isCurrent }}
                      onPress={async () => {
                        if (book) {
                          await updateBookMetadata(
                            importedId,
                            book.title,
                            book.author,
                            c,
                            book.coverChoice ?? -1,
                          );
                        }
                      }}
                      style={[
                        styles.genreChip,
                        {
                          backgroundColor: isCurrent ? colors.brand : colors.surface,
                          borderColor: isCurrent ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.genreChipText,
                          { color: isCurrent ? colors.white : colors.ink },
                        ]}
                      >
                        {c}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  categoryModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.sectionTitle,
    fontSize: 18,
  },
  bookNameBadge: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  bookNameText: {
    ...typography.small,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryPrompt: {
    ...typography.label,
    fontSize: 13,
  },
  categoryListScroll: {
    maxHeight: 220,
    marginVertical: spacing.xs,
  },
  categoryOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginVertical: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  categoryOptionText: {
    ...typography.body,
    fontSize: 15,
    flex: 1,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  createRowText: {
    ...typography.label,
    fontSize: 14,
  },
  createCategoryInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  createInput: {
    ...typography.body,
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
  },
  addCategoryButton: {
    minWidth: 60,
  },
  cancelCreateButton: {
    padding: spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalActionFlex: {
    flex: 1,
  },
});
