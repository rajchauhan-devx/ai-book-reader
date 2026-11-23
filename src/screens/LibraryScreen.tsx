import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Plus, Search } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { BookCard } from '../components/BookCard';
import {
  LibrarySortMenu,
  librarySortOptions as sorts,
} from '../components/LibrarySortMenu';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../types/navigation';
import type { Book, BookFormat } from '../types/library';
import { useLibrary } from '../state/LibraryProvider';
import {
  filterBooks,
  getDistinctGenres,
  type LibrarySort,
} from '../services/libraryView';

export function LibraryScreen() {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const {
    books,
    categories,
    addCategory,
    deleteCategory,
    loading,
    error,
    refresh,
    removeBook,
  } = useLibrary();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [selectedCategory, setSelectedCategory] = useState<string>('Default');
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const columns = width >= 960 ? 5 : width >= 720 ? 4 : 2;
  const cardWidth = (width - 40 - (columns - 1) * 16) / columns;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(cat => {
      if (cat.toLowerCase() === 'default') {
        counts[cat] = books.filter(
          b => !b.genre || b.genre === 'Default' || b.genre === 'Uncategorized',
        ).length;
      } else {
        counts[cat] = books.filter(
          b => b.genre?.toLowerCase() === cat.toLowerCase(),
        ).length;
      }
    });
    return counts;
  }, [categories, books]);

  const visible = useMemo(
    () =>
      filterBooks(
        books,
        query,
        'all',
        'all',
        sort,
        selectedCategory,
      ),
    [books, query, sort, selectedCategory],
  );

  const selectedIds = books
    .filter(book => selected.has(book.id))
    .map(book => book.id);

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function details(book: Book) {
    navigation.navigate('BookDetails', { bookId: book.id });
  }

  function confirmRemove(ids: string[]) {
    if (!ids.length || removing) return;
    Alert.alert(
      'Remove ' + ids.length + ' book(s)?',
      'Private copies, prepared text and reading locations will be deleted. Original files and the voice model stay untouched.',
      [
        { text: 'Keep books', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            const failed: string[] = [];
            for (const id of ids) {
              try {
                await removeBook(id);
              } catch {
                failed.push(id);
              }
            }
            setSelected(new Set(failed));
            setSelecting(failed.length > 0);
            setRemoving(false);
            if (failed.length) {
              Alert.alert(
                'Some books could not be removed',
                'Retry the selected books.',
              );
            }
          },
        },
      ],
    );
  }

  function menu(book: Book) {
    Alert.alert(
      book.title,
      book.remaining,
      [
        { text: 'Book details', onPress: () => details(book) },
        {
          text: 'Select book',
          onPress: () => {
            setSelecting(true);
            toggle(book.id);
          },
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => confirmRemove([book.id]),
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <Screen scroll={false}>
      <LibrarySortMenu
        visible={sortOpen}
        value={sort}
        onSelect={setSort}
        onClose={() => setSortOpen(false)}
      />

      {/* New Category Creation Modal */}
      <Modal
        visible={newCategoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewCategoryModalOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setNewCategoryModalOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.ink }]}>
              New Category
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.inkMuted }]}>
              Enter a category name to organize your library (e.g. Fantasy, Horror, Manga).
            </Text>
            <TextInput
              accessibilityLabel="Category name input"
              autoFocus
              placeholder="Category name…"
              placeholderTextColor={colors.inkMuted}
              value={newCategoryInput}
              onChangeText={setNewCategoryInput}
              style={[
                styles.modalInput,
                {
                  color: colors.ink,
                  borderColor: colors.border,
                  backgroundColor: colors.canvas,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <AppButton
                label="Cancel"
                variant="ghost"
                onPress={() => setNewCategoryModalOpen(false)}
                style={styles.modalBtn}
              />
              <AppButton
                label="Create"
                disabled={!newCategoryInput.trim()}
                onPress={async () => {
                  const trimmed = newCategoryInput.trim();
                  if (trimmed) {
                    await addCategory(trimmed);
                    setSelectedCategory(trimmed);
                    setNewCategoryModalOpen(false);
                  }
                }}
                style={styles.modalBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <FlatList
        key={columns}
        numColumns={columns}
        data={visible}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        refreshing={loading}
        onRefresh={refresh}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: colors.brand }]}>
                  MY COLLECTION
                </Text>
                <Text style={[styles.title, { color: colors.ink }]}>
                  Library
                </Text>
              </View>
              <AppButton
                label="Import"
                icon={Plus}
                onPress={() => navigation.navigate('ImportBook')}
              />
            </View>

            {/* Category Tabs: Default, User Categories, + New */}
            <View style={styles.categoryTabsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
              >
                {categories.map(cat => {
                  const isSelected =
                    selectedCategory.toLowerCase() === cat.toLowerCase();
                  const count = categoryCounts[cat] ?? 0;
                  return (
                    <Pressable
                      key={cat}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelectedCategory(cat)}
                      onLongPress={() => {
                        if (cat.toLowerCase() !== 'default') {
                          Alert.alert(
                            `Category: ${cat}`,
                            'Manage this category',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete Category',
                                style: 'destructive',
                                onPress: async () => {
                                  await deleteCategory(cat);
                                  if (
                                    selectedCategory.toLowerCase() ===
                                    cat.toLowerCase()
                                  ) {
                                    setSelectedCategory('Default');
                                  }
                                },
                              },
                            ],
                          );
                        }
                      }}
                      style={[
                        styles.categoryTab,
                        {
                          backgroundColor: isSelected
                            ? colors.brand
                            : colors.surface,
                          borderColor: isSelected ? colors.brand : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryTabText,
                          { color: isSelected ? colors.white : colors.ink },
                        ]}
                      >
                        {cat}
                      </Text>
                      {count > 0 && (
                        <View
                          style={[
                            styles.categoryBadge,
                            {
                              backgroundColor: isSelected
                                ? 'rgba(255, 255, 255, 0.25)'
                                : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryBadgeText,
                              {
                                color: isSelected
                                  ? colors.white
                                  : colors.inkMuted,
                              },
                            ]}
                          >
                            {count}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}

                {/* + New Category Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create new category"
                  onPress={() => {
                    setNewCategoryInput('');
                    setNewCategoryModalOpen(true);
                  }}
                  style={[
                    styles.newCategoryBtn,
                    {
                      borderColor: colors.brand,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <Plus size={15} color={colors.brand} />
                  <Text
                    style={[styles.newCategoryText, { color: colors.brand }]}
                  >
                    New
                  </Text>
                </Pressable>
              </ScrollView>
            </View>

            {/* Search Input */}
            <View
              style={[
                styles.search,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Search size={18} color={colors.inkMuted} />
              <TextInput
                accessibilityLabel="Search books or authors"
                placeholder="Search title, author or genre"
                placeholderTextColor={colors.inkMuted}
                value={query}
                onChangeText={setQuery}
                style={[styles.input, { color: colors.ink }]}
              />
            </View>

            {/* Sort & Select Tools */}
            <View style={styles.tools}>
              <Text style={[styles.bookCount, { color: colors.inkMuted }]}>
                {visible.length} {visible.length === 1 ? 'book' : 'books'}
              </Text>
              <View style={styles.toolActions}>
                <AppButton
                  label={sorts.find(item => item.value === sort)!.label}
                  variant="ghost"
                  onPress={() => setSortOpen(true)}
                />
                <AppButton
                  label={selecting ? 'Done selecting' : 'Select'}
                  variant="ghost"
                  disabled={removing || books.length === 0}
                  onPress={() => {
                    setSelecting(!selecting);
                    setSelected(new Set());
                  }}
                />
              </View>
            </View>

            {selecting ? (
              <AppButton
                label={'Remove selected · ' + selectedIds.length}
                variant="secondary"
                disabled={!selectedIds.length}
                loading={removing}
                onPress={() => confirmRemove(selectedIds)}
              />
            ) : null}

            {error ? (
              <>
                <Text style={{ color: colors.danger }}>{error}</Text>
                <AppButton
                  label="Reload library"
                  variant="secondary"
                  onPress={refresh}
                />
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <BookCard
            book={item}
            width={cardWidth}
            selected={selected.has(item.id)}
            selecting={selecting && !item.isSample}
            onPress={() =>
              selecting && !item.isSample ? toggle(item.id) : details(item)
            }
            onLongPress={
              item.isSample
                ? undefined
                : () => {
                    setSelecting(true);
                    toggle(item.id);
                  }
            }
            onMenu={item.isSample || selecting ? undefined : () => menu(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              style={[
                styles.subtitle,
                { color: colors.ink, textAlign: 'center' },
              ]}
            >
              {loading
                ? 'Opening your library…'
                : books.length
                ? 'No matching books'
                : 'No books yet'}
            </Text>
            <Text style={[styles.small, { color: colors.inkMuted, textAlign: 'center', maxWidth: 300 }]}>
              {books.length
                ? query.trim()
                  ? 'No books match your search.'
                  : 'No books in this category yet.'
                : 'Import an EPUB, text-based PDF or TXT to build your offline library.'}
            </Text>
            {books.length ? (
              <AppButton
                label={query ? 'Clear search' : 'Switch to Default category'}
                variant="ghost"
                onPress={() => {
                  setQuery('');
                  setSelectedCategory('Default');
                }}
              />
            ) : (
              <AppButton
                label="Import book"
                icon={Plus}
                onPress={() => navigation.navigate('ImportBook')}
              />
            )}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 110 },
  header: { gap: 14, marginBottom: 20 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  row: { gap: 16, marginBottom: 24 },
  flex: { flex: 1, gap: 4 },
  eyebrow: { ...typography.small, fontWeight: '800', letterSpacing: 1.2 },
  title: typography.pageTitle,
  subtitle: typography.sectionTitle,
  small: typography.small,
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    marginVertical: 4,
  },
  input: { ...typography.body, flex: 1, minHeight: 44 },
  tools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  bookCount: {
    ...typography.label,
    fontSize: 13,
  },
  toolActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  empty: { gap: spacing.sm, paddingVertical: 32, alignItems: 'center' },
  categoryTabsContainer: {
    marginVertical: 4,
  },
  categoryScroll: {
    gap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 6,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  newCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  newCategoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalBtn: {
    minWidth: 90,
  },
});
