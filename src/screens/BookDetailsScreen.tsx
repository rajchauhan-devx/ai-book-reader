import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  BookOpen,
  Clock3,
  Download,
  FileCheck2,
  Headphones,
  ListMusic,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { BookCover } from '../components/BookCover';
import { BookPreparationPanel } from '../components/BookPreparationPanel';
import { BookMetadataEditor } from '../components/BookMetadataEditor';
import { books } from '../data/mockBooks';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../types/navigation';
import { useLibrary } from '../state/LibraryProvider';
import { formatBookBytes } from '../services/bookLibrary';

type RouteProps = NativeStackScreenProps<
  RootStackParamList,
  'BookDetails'
>['route'];

export function BookDetailsScreen() {
  const { colors } = useAppTheme();
  const route = useRoute<RouteProps>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { books: importedBooks, loading, removeBook } = useLibrary();
  const [removing, setRemoving] = useState(false);
  const importedBook = importedBooks.find(
    item => item.id === route.params.bookId,
  );
  const book =
    importedBook ?? books.find(item => item.id === route.params.bookId);
  const isImported = Boolean(importedBook);

  if (!book) {
    return (
      <Screen contentStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>
          {loading ? 'Opening book…' : 'Book not found'}
        </Text>
        <AppButton
          label="Back to library"
          onPress={() => navigation.navigate('MainTabs')}
        />
      </Screen>
    );
  }

  const confirmRemoval = () => {
    Alert.alert(
      'Remove this book?',
      'Its private copy and saved reading position will be removed from this phone.',
      [
        { text: 'Keep book', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await removeBook(book.id);
              navigation.navigate('MainTabs');
            } catch (error) {
              setRemoving(false);
              Alert.alert(
                'Book not removed',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <BookCover book={book} width={150} height={216} />
        <Text style={[styles.title, { color: colors.ink }]}>{book.title}</Text>
        <Text style={[styles.author, { color: colors.inkMuted }]}>
          {book.author}
        </Text>
        <View style={styles.metaRow}>
          <View
            style={[styles.metaPill, { backgroundColor: colors.surfaceMuted }]}
          >
            {isImported ? (
              <FileCheck2 size={15} color={colors.inkMuted} />
            ) : (
              <Clock3 size={15} color={colors.inkMuted} />
            )}
            <Text style={[styles.metaText, { color: colors.inkMuted }]}>
              {isImported
                ? formatBookBytes(book.sourceSizeBytes ?? 0)
                : book.remaining}
            </Text>
          </View>
          <View
            style={[styles.metaPill, { backgroundColor: colors.surfaceMuted }]}
          >
            {isImported ? (
              <ShieldCheck size={15} color={colors.inkMuted} />
            ) : (
              <ListMusic size={15} color={colors.inkMuted} />
            )}
            <Text style={[styles.metaText, { color: colors.inkMuted }]}>
              {isImported ? book.format?.toUpperCase() : '9 chapters'}
            </Text>
          </View>
        </View>
      </View>

      {!isImported ? (
        <>
          <AppButton
            label={book.progress ? 'Continue listening' : 'Start listening'}
            icon={Headphones}
            fullWidth
            onPress={() =>
              navigation.navigate('Reader', {
                bookId: book.id,
                mode: 'audiobook',
              })
            }
          />
          <View style={styles.actionRow}>
            <AppButton
              label="Read Book"
              icon={BookOpen}
              variant="secondary"
              onPress={() =>
                navigation.navigate('Reader', { bookId: book.id, mode: 'read' })
              }
              style={styles.flexButton}
            />
            <AppButton
              label="Prepare audio"
              icon={Download}
              variant="secondary"
              onPress={() => navigation.navigate('ModelSetup')}
              style={styles.flexButton}
            />
          </View>
        </>
      ) : null}
      {isImported ? (
        <>
          <BookPreparationPanel book={book} />
          <BookMetadataEditor book={book} />
          <AppButton
            label="Remove from library"
            icon={Trash2}
            variant="ghost"
            loading={removing}
            onPress={confirmRemoval}
            style={styles.removeButton}
          />
        </>
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>
              Chapters
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.inkMuted }]}>
              4h 36m total
            </Text>
          </View>

          <View
            style={[
              styles.chapterList,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {[
              'In My Younger Years',
              'A Party at Gatsby’s',
              'The Green Light',
              'Past and Present',
            ].map((chapter, index) => (
              <View
                key={chapter}
                style={[
                  styles.chapter,
                  index < 3 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.chapterNumber,
                    {
                      backgroundColor:
                        index === 0 ? colors.brand : colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chapterNumberText,
                      { color: index === 0 ? colors.white : colors.inkMuted },
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.chapterTitle, { color: colors.ink }]}>
                    {chapter}
                  </Text>
                  <Text
                    style={[styles.chapterMeta, { color: colors.inkMuted }]}
                  >
                    {24 + index * 8} min · Not prepared
                  </Text>
                </View>
                <Download size={19} color={colors.inkMuted} />
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  title: {
    ...typography.pageTitle,
    fontSize: 27,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  author: { ...typography.body, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  metaPill: {
    height: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: typography.small,
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flexButton: { flex: 1, paddingHorizontal: spacing.sm },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: typography.sectionTitle,
  sectionMeta: typography.small,
  chapterList: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  removeButton: { marginTop: spacing.md },
  chapter: {
    minHeight: 78,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chapterNumber: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumberText: { ...typography.label, fontWeight: '800' },
  chapterTitle: typography.label,
  chapterMeta: typography.small,
  flex: { flex: 1 },
});
