import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { books as samples } from '../data/mockBooks';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../types/navigation';
import type { Book, BookFormat } from '../types/library';
import { useLibrary } from '../state/LibraryProvider';
import {
  filterBooks,
  getDistinctGenres,
  type LibraryFilter,
  type LibrarySort,
} from '../services/libraryView';

const filters: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All books' },
  { value: 'ready', label: 'Text ready' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
  { value: 'unread', label: 'Unread' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'attention', label: 'Needs attention' },
];

export function LibraryScreen() {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const { books, loading, error, refresh, removeBook } = useLibrary();
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<BookFormat | 'all'>('all');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [selectedGenre, setSelectedGenre] = useState<string | 'all'>('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const columns = width >= 960 ? 5 : width >= 720 ? 4 : 2;
  const cardWidth = (width - 40 - (columns - 1) * 16) / columns;

  const distinctGenres = useMemo(
    () => getDistinctGenres(showSamples ? [...books, ...samples] : books),
    [books, showSamples],
  );

  const visible = useMemo(
    () =>
      filterBooks(
        showSamples ? [...books, ...samples] : books,
        query,
        format,
        filter,
        sort,
        selectedGenre,
      ),
    [books, showSamples, query, format, filter, sort, selectedGenre],
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

  function chip(label: string, chosen: boolean, onPress: () => void) {
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityState={{ selected: chosen }}
        onPress={onPress}
        style={[
          styles.chip,
          {
            backgroundColor: chosen ? colors.brand : colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[styles.small, { color: chosen ? colors.white : colors.ink }]}
        >
          {label}
        </Text>
      </Pressable>
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

            {/* Search Input */}
            <View
              style={[
                styles.search,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Search size={20} color={colors.inkMuted} />
              <TextInput
                accessibilityLabel="Search books or authors"
                placeholder="Search title, author or genre"
                placeholderTextColor={colors.inkMuted}
                value={query}
                onChangeText={setQuery}
                style={[styles.input, { color: colors.ink }]}
              />
            </View>

            {/* Genre Filter Pills */}
            {distinctGenres.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {chip('All genres', selectedGenre === 'all', () =>
                  setSelectedGenre('all'),
                )}
                {distinctGenres.map(g =>
                  chip(g, selectedGenre === g, () => setSelectedGenre(g)),
                )}
              </ScrollView>
            ) : null}

            {/* Status Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {filters.map(item =>
                chip(item.label, filter === item.value, () =>
                  setFilter(item.value),
                ),
              )}
            </ScrollView>

            {/* Format Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {(['all', 'epub', 'pdf', 'txt'] as const).map(value =>
                chip(
                  value === 'all' ? 'All formats' : value.toUpperCase(),
                  format === value,
                  () => setFormat(value),
                ),
              )}
            </ScrollView>

            {/* Sort & Select Tools */}
            <View style={styles.tools}>
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

            {selecting ? (
              <AppButton
                label={'Remove selected · ' + selectedIds.length}
                variant="secondary"
                disabled={!selectedIds.length}
                loading={removing}
                onPress={() => confirmRemove(selectedIds)}
              />
            ) : null}

            <Text style={[styles.small, { color: colors.inkMuted }]}>
              {visible.length} shown · {books.length} in library
            </Text>

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
            <Text style={[styles.subtitle, { color: colors.ink }]}>
              {loading
                ? 'Opening your library…'
                : books.length
                ? 'No matching books'
                : 'Your bookshelf is empty'}
            </Text>
            <Text style={[styles.small, { color: colors.inkMuted }]}>
              {books.length
                ? 'Change the search or filters to see more books.'
                : 'Import an EPUB, text-based PDF or TXT to build your offline library.'}
            </Text>
            {books.length ? (
              <AppButton
                label="Clear filters"
                variant="ghost"
                onPress={() => {
                  setQuery('');
                  setFilter('all');
                  setFormat('all');
                  setSelectedGenre('all');
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
        ListFooterComponent={
          <AppButton
            label={
              showSamples ? 'Hide design samples' : 'Explore design samples'
            }
            variant="ghost"
            onPress={() => setShowSamples(!showSamples)}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
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
  },
  input: { ...typography.body, flex: 1, minHeight: 50 },
  chips: { gap: 8 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  empty: { gap: spacing.sm, paddingVertical: 32, alignItems: 'center' },
});
