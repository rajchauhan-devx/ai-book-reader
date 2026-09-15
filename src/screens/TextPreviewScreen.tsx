import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { bookLibraryService } from '../services/bookLibrary';
import { fixLigatureSplits } from '../services/textNormalizer';
import { useLibrary } from '../state/LibraryProvider';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { BookChapter, ChapterPage } from '../types/library';
import type { RootStackParamList } from '../types/navigation';

type RouteProps = NativeStackScreenProps<
  RootStackParamList,
  'TextPreview'
>['route'];
export function TextPreviewScreen() {
  const {
    params: { bookId },
  } = useRoute<RouteProps>();
  return <BookTextPreview key={bookId} bookId={bookId} />;
}

function BookTextPreview({ bookId }: { bookId: string }) {
  const { colors } = useAppTheme();
  const { savePreviewPosition } = useLibrary();
  const [saveError, setSaveError] = useState('');
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ChapterPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [showChapters, setShowChapters] = useState(false);
  const list = useRef<FlatList<ChapterPage['blocks'][number]>>(null);
  const chapter = chapters[chapterIndex];

  useEffect(() => {
    let ignore = false;
    setError(null);
    setLoading(true);
    Promise.all([
      bookLibraryService.listChapters(bookId),
      bookLibraryService.getBook(bookId),
    ])
      .then(([result, book]) => {
        if (ignore) return;
        if (!result.length) throw new Error('No prepared chapters were found.');
        const index = result.findIndex(
          item => item.id === book?.previewChapterId,
        );
        setChapterIndex(Math.max(0, index));
        setOffset(index >= 0 ? book?.previewBlockOffset ?? 0 : 0);
        setChapters(result);
      })
      .catch(reason => {
        if (!ignore) {
          setError(reason.message ?? 'Chapters could not be loaded.');
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [bookId, retry]);

  useEffect(() => {
    if (!chapter) return;
    let ignore = false;
    setLoading(true);
    setPage(null);
    setError(null);
    bookLibraryService
      .getChapterPage(bookId, chapter.id, offset)
      .then(result => {
        if (!ignore) {
          setPage(result);
          setLoading(false);
          setSaveError('');
          savePreviewPosition(bookId, result.chapterId, result.offset).catch(
            () => {
              if (!ignore)
                setSaveError(
                  'This location could not be saved. Reopen the book and try again.',
                );
            },
          );
        }
      })
      .catch(reason => {
        if (!ignore) {
          setError(reason.message ?? 'Text could not be loaded.');
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [bookId, chapter, offset, retry, savePreviewPosition]);

  useEffect(() => {
    if (page) list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [page]);

  const displayBlocks = useMemo(() => {
    if (!page?.blocks || page.blocks.length === 0) return [];
    const result: ChapterPage['blocks'][number][] = [];

    function shouldMergeBlocks(
      prev: ChapterPage['blocks'][number],
      curr: ChapterPage['blocks'][number],
    ): boolean {
      if (prev.kind !== 'paragraph' || curr.kind !== 'paragraph') return false;
      const p = prev.text.trim();
      const c = curr.text.trim();
      if (!p || !c) return false;

      if (/[-—\u00AD]$/.test(p)) return true;

      const firstChar = c[0];
      if (firstChar >= 'a' && firstChar <= 'z') return true;
      if (/^[,;:\]\)}»—]/.test(c)) return true;

      const endsWithTerm = /[.!?”"’»]$/.test(p);
      if (!endsWithTerm) {
        if (!/^[“"‘']/.test(c)) {
          const lastWord = (p.split(/\s+/).pop() || '').toLowerCase();
          const danglingWords = new Set([
            'and', 'or', 'but', 'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'with',
            'for', 'from', 'as', 'by', 'were', 'was', 'is', 'are', 'had', 'have', 'has',
            'would', 'could', 'should', 'been', 'that', 'which', 'who', 'whose', 'what',
            'where', 'when', 'if', 'than', 'into', 'onto', 'upon', 'so', 'nor', 'yet',
            'my', 'his', 'her', 'their', 'our', 'your', 'its', 'like', 'not', 'too',
          ]);
          if (danglingWords.has(lastWord) || /[,;:]$/.test(p)) return true;
          if (/[a-zA-Z0-9]$/.test(p)) return true;
        }
      }
      return false;
    }

    for (const block of page.blocks) {
      if (result.length === 0) {
        result.push(block);
      } else {
        const last = result[result.length - 1];
        if (shouldMergeBlocks(last, block)) {
          const separator = /[-—\u00AD]$/.test(last.text.trim()) ? '' : ' ';
          const mergedText = `${last.text.trim()}${separator}${block.text.trim()}`;
          result[result.length - 1] = {
            ...last,
            text: mergedText,
          };
        } else {
          result.push(block);
        }
      }
    }
    return result;
  }, [page?.blocks]);

  function chooseChapter(index: number) {
    setOffset(0);
    setChapterIndex(index);
    setShowChapters(false);
  }

  if (showChapters) {
    return (
      <Screen scroll={false}>
        <FlatList
          data={chapters}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <AppButton
              label="Back to text"
              variant="ghost"
              onPress={() => setShowChapters(false)}
            />
          }
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              accessibilityState={{ selected: index === chapterIndex }}
              onPress={() => chooseChapter(index)}
              style={[
                styles.chapter,
                {
                  backgroundColor:
                    index === chapterIndex ? colors.brandSoft : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.label, { color: colors.ink }]}>
                {index + 1}. {item.title}
              </Text>
            </Pressable>
          )}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        ref={list}
        data={displayBlocks}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.note, { color: colors.inkMuted }]}>
              TEXT PREVIEW · Location saved by page · Narration comes later
            </Text>
            <Text style={[styles.title, { color: colors.ink }]}>
              {chapter?.title ?? 'Opening chapters…'}
            </Text>
            {chapters.length ? (
              <AppButton
                label={`Choose chapter · ${chapterIndex + 1} of ${
                  chapters.length
                }`}
                variant="secondary"
                onPress={() => setShowChapters(true)}
              />
            ) : null}
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Loading prepared text"
                color={colors.brand}
              />
            ) : null}
            {saveError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.danger }}
              >
                {saveError}
              </Text>
            ) : null}
            {error ? (
              <>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.note, { color: colors.danger }]}
                >
                  {error}
                </Text>
                <AppButton
                  label="Retry loading text"
                  onPress={() => setRetry(value => value + 1)}
                />
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Text
            selectable
            style={[
              item.kind === 'heading' ? styles.heading : styles.paragraph,
              { color: colors.ink },
            ]}
          >
            {fixLigatureSplits(item.text)}
          </Text>
        )}
        ListFooterComponent={
          !loading && !error && page ? (
            <View style={styles.footer}>
              <Text style={[styles.note, { color: colors.inkMuted }]}>
                Blocks {page.offset + 1}–{page.offset + page.blocks.length} of{' '}
                {page.totalBlocks}
              </Text>
              {page.offset > 0 ? (
                <AppButton
                  label="Previous text"
                  variant="secondary"
                  onPress={() => setOffset(Math.max(0, page.offset - 24))}
                />
              ) : null}
              {page.nextOffset !== null ? (
                <AppButton
                  label="Next text"
                  onPress={() => setOffset(page.nextOffset!)}
                />
              ) : null}
              {chapterIndex > 0 ? (
                <AppButton
                  label="Previous chapter"
                  variant="secondary"
                  onPress={() => chooseChapter(chapterIndex - 1)}
                />
              ) : null}
              {chapterIndex + 1 < chapters.length ? (
                <AppButton
                  label="Next chapter"
                  variant="secondary"
                  onPress={() => chooseChapter(chapterIndex + 1)}
                />
              ) : null}
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  footer: { gap: spacing.sm, marginTop: spacing.lg },
  title: typography.pageTitle,
  label: typography.label,
  note: typography.small,
  heading: { ...typography.sectionTitle, marginBottom: spacing.md },
  paragraph: {
    ...typography.body,
    fontSize: 19,
    lineHeight: 31,
    marginBottom: spacing.lg,
  },
  chapter: {
    minHeight: 56,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
});
