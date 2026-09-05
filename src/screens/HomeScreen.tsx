import React from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BookOpen,
  ChevronRight,
  Headphones,
  Library as LibraryIcon,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { BookCover } from '../components/BookCover';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../types/navigation';
import { useLibrary } from '../state/LibraryProvider';
import { useModelDownload } from '../state/ModelDownloadProvider';
import { continueReading } from '../services/libraryView';

export function HomeScreen() {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const { books } = useLibrary();
  const { status: model } = useModelDownload();

  const currentBook = continueReading(books);
  const totalBooks = books.length;
  const finishedBooks = books.filter(b => b.progress === 100).length;
  const inProgressBooks = books.filter(
    b => b.progress > 0 && b.progress < 100,
  ).length;

  const recentBooks = books
    .filter(b => b.lastOpenedAt)
    .sort(
      (a, b) =>
        Date.parse(b.lastOpenedAt ?? '') - Date.parse(a.lastOpenedAt ?? ''),
    )
    .slice(0, 6);

  const heroWidth = Math.min(width - 32, 540);

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.brand }]}>
            YOUR AUDIOBOOK COMPANION
          </Text>
          <Text style={[styles.title, { color: colors.ink }]}>
            AI Book Reader
          </Text>
        </View>

        {/* Hero Card: Continue Reading */}
        {currentBook ? (
          <View
            style={[
              styles.heroCard,
              {
                width: heroWidth,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.heroRow}>
              <BookCover book={currentBook} width={90} height={130} />
              <View style={styles.heroDetails}>
                <View style={styles.heroBadgeRow}>
                  <View
                    style={[
                      styles.heroBadge,
                      { backgroundColor: colors.brandSoft },
                    ]}
                  >
                    <Headphones size={13} color={colors.brand} />
                    <Text
                      style={[styles.heroBadgeText, { color: colors.brand }]}
                    >
                      CURRENTLY READING
                    </Text>
                  </View>
                  {currentBook.genre &&
                  currentBook.genre !== 'Uncategorized' ? (
                    <View
                      style={[
                        styles.heroBadge,
                        { backgroundColor: colors.surfaceMuted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.heroBadgeText,
                          { color: colors.inkMuted },
                        ]}
                      >
                        {currentBook.genre}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text
                  style={[styles.heroTitle, { color: colors.ink }]}
                  numberOfLines={2}
                >
                  {currentBook.title}
                </Text>
                <Text
                  style={[styles.heroAuthor, { color: colors.inkMuted }]}
                  numberOfLines={1}
                >
                  {currentBook.author}
                </Text>

                <View style={styles.progressContainer}>
                  <View
                    style={[
                      styles.track,
                      { backgroundColor: colors.surfaceMuted },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: colors.listen,
                          width: `${currentBook.progress}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.progressText, { color: colors.inkMuted }]}
                  >
                    {currentBook.progress}% complete · {currentBook.remaining}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.heroActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Resume reading ${currentBook.title}`}
                onPress={() =>
                  navigation.navigate('Reader', {
                    bookId: currentBook.id,
                    mode: 'audiobook',
                  })
                }
                style={[
                  styles.resumeButton,
                  styles.heroPrimaryBtn,
                  { backgroundColor: colors.brand },
                ]}
              >
                <Play size={18} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={styles.resumeButtonText}>Listen</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Read ${currentBook.title}`}
                onPress={() =>
                  navigation.navigate('Reader', {
                    bookId: currentBook.id,
                    mode: 'read',
                  })
                }
                style={[
                  styles.resumeButton,
                  styles.heroSecondaryBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <BookOpen size={18} color={colors.ink} />
                <Text style={[styles.readButtonText, { color: colors.ink }]}>
                  Read
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.emptyCard,
              {
                width: heroWidth,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <BookOpen size={36} color={colors.brand} />
            <Text style={[styles.emptyCardTitle, { color: colors.ink }]}>
              {totalBooks === 0 ? 'Welcome to AI Book Reader' : 'Pick up a book'}
            </Text>
            <Text style={[styles.emptyCardBody, { color: colors.inkMuted }]}>
              {totalBooks === 0
                ? 'Import an EPUB, PDF or TXT to start listening with natural offline voices.'
                : 'Choose any book from your library to start listening.'}
            </Text>
            <AppButton
              label={totalBooks === 0 ? 'Import your first book' : 'Open library'}
              onPress={() =>
                totalBooks === 0
                  ? navigation.navigate('ImportBook')
                  : navigation.navigate('MainTabs', { screen: 'Library' })
              }
              style={styles.emptyCardAction}
            />
          </View>
        )}

        {/* Offline Voice Model Setup Banner */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Natural voice model status"
          onPress={() => navigation.navigate('ModelSetup')}
          style={[styles.modelCard, { backgroundColor: colors.brand }]}
        >
          <Sparkles size={24} color="#F5E5C7" />
          <View style={styles.flex}>
            <Text style={styles.modelTitle}>
              {model.state === 'ready'
                ? 'Offline Voice Engine · Ready'
                : 'Natural Offline Voice · Free'}
            </Text>
            <Text style={styles.modelBody}>
              {model.state === 'ready'
                ? 'Chatterbox-Nano natural English voice installed. Tap to test.'
                : 'One-time setup for patient, human-like narration without internet.'}
            </Text>
          </View>
          <ChevronRight size={20} color="#F5E5C7" />
        </Pressable>

        {/* Quick Actions */}
        <View style={styles.quickActionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import a book"
            onPress={() => navigation.navigate('ImportBook')}
            style={[
              styles.actionTile,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: colors.brandSoft },
              ]}
            >
              <Plus size={22} color={colors.brand} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.ink }]}>
              Import Book
            </Text>
            <Text style={[styles.actionSub, { color: colors.inkMuted }]}>
              EPUB, PDF, TXT
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to library"
            onPress={() =>
              navigation.navigate('MainTabs', { screen: 'Library' })
            }
            style={[
              styles.actionTile,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: colors.listenSoft },
              ]}
            >
              <LibraryIcon size={22} color={colors.listen} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.ink }]}>
              Your Library
            </Text>
            <Text style={[styles.actionSub, { color: colors.inkMuted }]}>
              {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
            </Text>
          </Pressable>
        </View>

        {/* Reading Stats Card */}
        {totalBooks > 0 ? (
          <View
            style={[
              styles.statsCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statsTitle, { color: colors.ink }]}>
              Reading Overview
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.brand }]}>
                  {totalBooks}
                </Text>
                <Text style={[styles.statLabel, { color: colors.inkMuted }]}>
                  Total books
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.listen }]}>
                  {inProgressBooks}
                </Text>
                <Text style={[styles.statLabel, { color: colors.inkMuted }]}>
                  In progress
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {finishedBooks}
                </Text>
                <Text style={[styles.statLabel, { color: colors.inkMuted }]}>
                  Finished
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Recently Read Carousel */}
        {recentBooks.length > 0 ? (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={[styles.sectionHeading, { color: colors.ink }]}>
                Recently Read
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all books in library"
                onPress={() =>
                  navigation.navigate('MainTabs', { screen: 'Library' })
                }
              >
                <Text style={[styles.seeAllText, { color: colors.brand }]}>
                  See all
                </Text>
              </Pressable>
            </View>

            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={recentBooks}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.recentList}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title} by ${item.author}`}
                  onPress={() =>
                    navigation.navigate('BookDetails', { bookId: item.id })
                  }
                  style={styles.recentItem}
                >
                  <BookCover book={item} width={108} height={156} />
                  <Text
                    style={[styles.recentTitle, { color: colors.ink }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.recentAuthor, { color: colors.inkMuted }]}
                    numberOfLines={1}
                  >
                    {item.author}
                  </Text>
                  <View
                    style={[
                      styles.recentTrack,
                      { backgroundColor: colors.surfaceMuted },
                    ]}
                  >
                    <View
                      style={[
                        styles.recentProgress,
                        {
                          backgroundColor: colors.listen,
                          width: `${item.progress}%`,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              )}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    marginTop: spacing.xs,
  },
  eyebrow: {
    ...typography.small,
    fontWeight: '800' as const,
    letterSpacing: 1.1,
  },
  title: {
    ...typography.pageTitle,
    fontSize: 28,
    marginTop: 2,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    alignSelf: 'center',
  },
  heroRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heroDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroTitle: {
    ...typography.label,
    fontSize: 17,
    lineHeight: 22,
  },
  heroAuthor: {
    ...typography.small,
    fontSize: 13,
  },
  progressContainer: {
    marginTop: spacing.xs,
    gap: 4,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  progressText: {
    ...typography.small,
    fontSize: 11,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  resumeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroPrimaryBtn: {
    flex: 1.2,
  },
  heroSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
  },
  readButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
  },
  emptyCardTitle: {
    ...typography.sectionTitle,
    marginTop: spacing.xs,
  },
  emptyCardBody: {
    ...typography.body,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyCardAction: {
    marginTop: spacing.md,
    minWidth: 200,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  modelTitle: {
    ...typography.label,
    color: '#FBF7EE',
    fontSize: 15,
  },
  modelBody: {
    ...typography.small,
    color: '#EDE3D2',
    marginTop: 2,
    fontSize: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionTile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    ...typography.label,
    fontSize: 14,
  },
  actionSub: {
    ...typography.small,
    fontSize: 12,
  },
  statsCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  statsTitle: {
    ...typography.label,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.small,
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  recentSection: {
    gap: spacing.sm,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    ...typography.sectionTitle,
    fontSize: 17,
  },
  seeAllText: {
    ...typography.label,
    fontSize: 13,
  },
  recentList: {
    gap: spacing.sm,
    paddingVertical: 4,
  },
  recentItem: {
    width: 108,
    gap: 3,
  },
  recentTitle: {
    ...typography.label,
    fontSize: 13,
    marginTop: 4,
  },
  recentAuthor: {
    ...typography.small,
    fontSize: 11,
  },
  recentTrack: {
    height: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: 4,
  },
  recentProgress: {
    height: '100%',
    borderRadius: radius.pill,
  },
  flex: {
    flex: 1,
  },
});
