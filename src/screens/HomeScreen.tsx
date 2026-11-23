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
  Headphones,
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
import { continueReading } from '../services/libraryView';

export function HomeScreen() {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const { books } = useLibrary();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning ☀️';
    if (hour >= 12 && hour < 17) return 'Good afternoon 🌤️';
    if (hour >= 17 && hour < 22) return 'Good evening 🌙';
    return 'Quiet night for reading ✨';
  };

  const getFormattedDate = () => {
    const d = new Date();
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  };

  const currentBook = continueReading(books);
  const totalBooks = books.length;

  const recentBooks = books
    .filter(b => b.lastOpenedAt)
    .sort(
      (a, b) =>
        Date.parse(b.lastOpenedAt ?? '') - Date.parse(a.lastOpenedAt ?? ''),
    )
    .slice(0, 8);

  const heroWidth = Math.min(width - 32, 540);

  return (
    <Screen scroll={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Greeting & Date */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <Text style={[styles.eyebrow, { color: colors.brand }]}>
              {getGreeting()}
            </Text>
            <View
              style={[
                styles.datePill,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.dateText, { color: colors.inkMuted }]}>
                {getFormattedDate()}
              </Text>
            </View>
          </View>
          <Text style={[styles.title, { color: colors.ink }]}>
            AI Book Reader
          </Text>
        </View>

        {/* Hero Section */}
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
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.brandSoft },
              ]}
            >
              <Sparkles size={28} color={colors.brand} />
            </View>
            <Text style={[styles.emptyCardTitle, { color: colors.ink }]}>
              Welcome to AI Book Reader
            </Text>
            <Text style={[styles.emptyCardBody, { color: colors.inkMuted }]}>
              Turn your books into natural, human-like audiobooks with
              Kokoro-82M AI. 100% offline with zero data consumption.
            </Text>
            <AppButton
              label="Import your first book"
              icon={Plus}
              onPress={() => navigation.navigate('ImportBook')}
              style={styles.emptyCardAction}
            />
            <View style={styles.formatTagRow}>
              <View
                style={[
                  styles.formatTag,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.formatTagText, { color: colors.inkMuted }]}
                >
                  EPUB · Chapters
                </Text>
              </View>
              <View
                style={[
                  styles.formatTag,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.formatTagText, { color: colors.inkMuted }]}
                >
                  PDF · Documents
                </Text>
              </View>
              <View
                style={[
                  styles.formatTag,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.formatTagText, { color: colors.inkMuted }]}
                >
                  TXT · Clean text
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Recently Read Carousel (Shown when user has recent books) */}
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
    paddingBottom: 110,
    gap: spacing.lg,
  },
  header: {
    marginTop: spacing.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  eyebrow: {
    ...typography.small,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
  },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
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
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyCardTitle: {
    ...typography.sectionTitle,
    textAlign: 'center',
  },
  emptyCardBody: {
    ...typography.body,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 19,
  },
  emptyCardAction: {
    marginTop: spacing.md,
    minWidth: 220,
  },
  formatTagRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  formatTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  formatTagText: {
    fontSize: 11,
    fontWeight: '600',
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
});
