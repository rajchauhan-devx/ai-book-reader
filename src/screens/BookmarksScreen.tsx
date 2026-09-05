import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Bookmark,
  ChevronRight,
  Download,
  Highlighter,
  StickyNote,
  Trash2,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import {
  annotationsService,
  type AnnotationType,
  type BookAnnotation,
} from '../services/annotations';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../types/navigation';

type FilterTab = 'all' | AnnotationType;

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bookmark', label: 'Bookmarks' },
  { key: 'highlight', label: 'Highlights' },
  { key: 'note', label: 'Notes' },
];

export function BookmarksScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedTab, setSelectedTab] = useState<FilterTab>('all');
  const [items, setItems] = useState<BookAnnotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await annotationsService.list(
        selectedTab === 'all' ? undefined : { type: selectedTab },
      );
      setItems(data);
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [selectedTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = (item: BookAnnotation) => {
    Alert.alert(
      'Remove saved passage',
      'Are you sure you want to remove this saved passage?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await annotationsService.remove(item.id);
            await loadData();
          },
        },
      ],
    );
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const markdown = await annotationsService.exportToMarkdown();
      await Share.share({
        title: 'AI Book Reader - Saved Passages',
        message: markdown,
      });
    } catch {
      // Non-fatal
    } finally {
      setExporting(false);
    }
  };

  const getIcon = (type: AnnotationType) => {
    switch (type) {
      case 'bookmark':
        return Bookmark;
      case 'highlight':
        return Highlighter;
      case 'note':
        return StickyNote;
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.brand }]}>
            YOUR COLLECTION
          </Text>
          <Text style={[styles.pageTitle, { color: colors.ink }]}>
            Saved passages
          </Text>
        </View>

        {items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export saved passages"
            onPress={handleExport}
            disabled={exporting}
            style={[
              styles.exportBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Download size={18} color={colors.brand} />
            <Text style={[styles.exportText, { color: colors.brand }]}>
              Export
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.intro, { color: colors.inkMuted }]}>
        Bookmarks, highlights, and notes saved while reading.
      </Text>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = selectedTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${tab.label}`}
              onPress={() => setSelectedTab(tab.key)}
              style={[
                styles.tabItem,
                {
                  backgroundColor: isActive ? colors.brand : colors.surface,
                  borderColor: isActive ? colors.brand : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? colors.white : colors.ink },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* List / Loading / Empty */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Bookmark size={36} color={colors.inkMuted} />
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No saved passages yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.inkMuted }]}>
            Tap any sentence while reading to bookmark it, highlight in color, or
            add your thoughts.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const Icon = getIcon(item.type);
            const dateStr = new Date(item.createdAt).toLocaleDateString();

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.type} in ${item.bookTitle}`}
                onPress={() =>
                  navigation.navigate('Reader', {
                    bookId: item.bookId,
                    initialChapterId: item.chapterId,
                    initialSentenceIndex: item.sentenceIndex,
                  })
                }
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor:
                        item.type === 'bookmark'
                          ? colors.listenSoft
                          : item.type === 'highlight'
                          ? isDark
                            ? '#3A3816'
                            : '#FEF08A'
                          : colors.brandSoft,
                    },
                  ]}
                >
                  <Icon
                    size={20}
                    color={
                      item.type === 'bookmark'
                        ? colors.listen
                        : item.type === 'highlight'
                        ? '#B45309'
                        : colors.brand
                    }
                  />
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text
                      style={[
                        styles.cardType,
                        {
                          color:
                            item.type === 'bookmark'
                              ? colors.listen
                              : item.type === 'highlight'
                              ? '#B45309'
                              : colors.brand,
                        },
                      ]}
                    >
                      {item.type.toUpperCase()}
                      {item.color ? ` · ${item.color.toUpperCase()}` : ''}
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete item"
                      onPress={e => {
                        e.stopPropagation();
                        handleDelete(item);
                      }}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={16} color={colors.inkMuted} />
                    </Pressable>
                  </View>

                  {item.text ? (
                    <Text
                      style={[styles.cardExcerpt, { color: colors.ink }]}
                      numberOfLines={3}
                    >
                      “{item.text.trim()}”
                    </Text>
                  ) : null}

                  {item.note ? (
                    <View
                      style={[
                        styles.noteBox,
                        {
                          backgroundColor: colors.canvas,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.noteText, { color: colors.ink }]}>
                        {item.note}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <Text
                      style={[styles.metaText, { color: colors.inkMuted }]}
                      numberOfLines={1}
                    >
                      {item.bookTitle} · {item.chapterTitle}
                    </Text>
                    <Text style={[styles.metaDate, { color: colors.inkMuted }]}>
                      {dateStr}
                    </Text>
                  </View>
                </View>

                <ChevronRight size={18} color={colors.inkMuted} style={styles.chevron} />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerCopy: { flex: 1 },
  eyebrow: { ...typography.small, fontWeight: '800', letterSpacing: 1.5 },
  pageTitle: typography.pageTitle,
  intro: { ...typography.body, marginTop: spacing.xs, maxWidth: 520 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 6,
  },
  exportText: { fontSize: 13, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tabItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  center: { padding: spacing.xxl, alignItems: 'center' },
  emptyCard: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    textAlign: 'center',
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: spacing.xs },
  emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 300 },
  list: { gap: spacing.sm },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardType: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  deleteBtn: { padding: 4 },
  cardExcerpt: { ...typography.body, fontFamily: 'serif', fontSize: 14 },
  noteBox: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 2,
  },
  noteText: { fontSize: 13, fontStyle: 'italic' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  metaText: { fontSize: 12, flex: 1, marginRight: spacing.xs },
  metaDate: { fontSize: 11 },
  chevron: { alignSelf: 'center' },
});
