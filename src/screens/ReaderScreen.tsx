import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  List,
  Minus,
  Moon,
  Play,
  Plus,
  Search,
  Share2,
  StickyNote,
  Sun,
  Type,
  Volume2,
  X,
} from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bookLibraryService } from '../services/bookLibrary';
import {
  annotationsService,
  type BookAnnotation,
  type HighlightColor,
} from '../services/annotations';
import {
  defaultReaderPreferences,
  readerPreferencesRepository,
  type ReaderPreferences,
} from '../services/readerPreferences';
import {
  narrationPipelineService,
  type ChapterAudioStatus,
  type ChapterPreparationProgress,
} from '../services/narrationPipeline';
import { VoicePickerModal } from '../components/VoicePickerModal';
import { ReaderPlayerBar } from '../components/ReaderPlayerBar';
import { useNarrationPlayer } from '../state/NarrationPlayerProvider';
import { narrationPlayerService } from '../services/narrationPlayer';
import { AppButton } from '../components/AppButton';
import { fixLigatureSplits, isAbbreviationOrInitial } from '../services/textNormalizer';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/tokens';
import type { Book, BookChapter, ChapterPage } from '../types/library';
import type { RootStackParamList } from '../types/navigation';

type RouteProps = NativeStackScreenProps<RootStackParamList, 'Reader'>['route'];

const HIGHLIGHT_COLORS: { key: HighlightColor; label: string; lightBg: string; darkBg: string }[] = [
  { key: 'yellow', label: 'Yellow', lightBg: '#FEF08A', darkBg: '#713F12' },
  { key: 'green', label: 'Green', lightBg: '#BBF7D0', darkBg: '#14532D' },
  { key: 'blue', label: 'Blue', lightBg: '#BFDBFE', darkBg: '#1E3A8A' },
  { key: 'pink', label: 'Pink', lightBg: '#FBCFE8', darkBg: '#831843' },
];

function cleanDisplayText(text: string): string {
  if (!text) return '';
  const cleaned = text
    .replace(/[\u00AD\u200B\uFEFF]/g, '')
    .replace(/([A-Za-z]+)[-\u2010]\s*[\r\n]+\s*([a-z]+)/g, '$1$2')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
  return fixLigatureSplits(cleaned);
}

function parseChapterHeading(title?: string): { chapterTag: string | null; chapterTitle: string } {
  if (!title) return { chapterTag: null, chapterTitle: '' };
  const trimmed = title.trim();
  const match = trimmed.match(/^(chapter\s+\d+|\d+)[.:\-—\s]+(.*)$/i);
  if (match) {
    const rawNum = match[1].replace(/chapter\s+/i, '').trim();
    const rest = match[2].trim();
    if (rest) {
      return {
        chapterTag: `CHAPTER ${rawNum}`,
        chapterTitle: rest,
      };
    }
  }
  return { chapterTag: null, chapterTitle: trimmed };
}

export function ReaderScreen() {
  const { colors, isDark, preference, setPreference } = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { bookId, initialChapterId, initialSentenceIndex, mode } = route.params;
  const [readerMode, setReaderMode] = useState<'read' | 'audiobook'>(
    mode ?? 'read',
  );

  // Book & Chapter state
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ChapterPage | null>(null);

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

      const endsWithTerm = /[.!?”"’»]$/.test(p) && !isAbbreviationOrInitial(p);
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
          if (/[a-zA-Z0-9]$/.test(p) || isAbbreviationOrInitial(p)) return true;
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
          const mergedSentences = [
            ...(last.sentences || []),
            ...(block.sentences || []),
          ];
          result[result.length - 1] = {
            ...last,
            text: mergedText,
            sentences: mergedSentences,
          };
        } else {
          result.push(block);
        }
      }
    }
    return result;
  }, [page?.blocks]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Reader state
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(
    initialSentenceIndex ?? 0,
  );
  const [preferences, setPreferences] = useState<ReaderPreferences>(
    defaultReaderPreferences,
  );
  const [annotations, setAnnotations] = useState<BookAnnotation[]>([]);

  // Modals & Panels
  const [showChapters, setShowChapters] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSentence, setSelectedSentence] = useState<{
    id: string;
    text: string;
    index: number;
    blockId: string;
  } | null>(null);
  const [showSentenceModal, setShowSentenceModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Narration state
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [isListeningSentence, setIsListeningSentence] = useState(false);
  const [chapterAudioStatus, setChapterAudioStatus] = useState<ChapterAudioStatus | null>(null);
  const [chapterPrepProgress, setChapterPrepProgress] = useState<ChapterPreparationProgress | null>(null);

  // Narration player integration
  const { playerState, isPlaying, play, pause } = useNarrationPlayer();

  const handleToggleMode = useCallback(async () => {
    if (readerMode === 'read') {
      setReaderMode('audiobook');
    } else {
      if (isPlaying) {
        await pause();
      }
      setReaderMode('read');
    }
  }, [readerMode, isPlaying, pause]);

  const [userScrolledAway, setUserScrolledAway] = useState(false);
  const scrollPauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listRef = useRef<FlatList>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChapter = chapters[currentChapterIndex];

  const isNarrationActive =
    playerState.bookId === bookId &&
    playerState.chapterId === currentChapter?.id &&
    (playerState.state === 'playing' ||
      playerState.state === 'buffering' ||
      playerState.state === 'paused');

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (scrollPauseTimeoutRef.current) clearTimeout(scrollPauseTimeoutRef.current);
    };
  }, []);

  // Save exact sentence position
  const persistSentencePosition = useCallback(
    async (sentenceIndex: number) => {
      if (!currentChapter) return;
      try {
        await bookLibraryService.saveReadingPosition({
          bookId,
          chapterId: currentChapter.id,
          sentenceIndex,
          audioOffsetMs: 0,
          updatedAt: new Date().toISOString(),
        });
        setSaveStatus('Saved');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => setSaveStatus(''), 2000);
      } catch {
        // Non-blocking
      }
    },
    [bookId, currentChapter],
  );

  // Sync reading position and highlight with active audio sentence
  useEffect(() => {
    if (
      readerMode === 'audiobook' &&
      isNarrationActive &&
      playerState.sentenceIndex !== undefined
    ) {
      setActiveSentenceIndex(playerState.sentenceIndex);
      persistSentencePosition(playerState.sentenceIndex);
    }
  }, [
    readerMode,
    isNarrationActive,
    playerState.sentenceIndex,
    persistSentencePosition,
  ]);

  // Auto-scroll to center the currently spoken sentence
  useEffect(() => {
    if (
      readerMode !== 'audiobook' ||
      !isNarrationActive ||
      !isPlaying ||
      userScrolledAway ||
      !page
    )
      return;
    const blockIdx = displayBlocks.findIndex(b =>
      b.sentences?.some(s => s.index === playerState.sentenceIndex),
    );
    if (blockIdx >= 0 && listRef.current) {
      try {
        listRef.current.scrollToIndex({
          index: blockIdx,
          viewPosition: 0.35,
          animated: true,
        });
      } catch {
        // Non-fatal
      }
    }
  }, [
    readerMode,
    isNarrationActive,
    isPlaying,
    userScrolledAway,
    page,
    playerState.sentenceIndex,
  ]);

  // Auto-advance page when audio advances past the visible page
  useEffect(() => {
    if (
      readerMode !== 'audiobook' ||
      !isNarrationActive ||
      !page ||
      page.blocks.length === 0
    ) {
      return;
    }

    const currentSentences = page.blocks.flatMap(b => b.sentences || []);
    if (currentSentences.length === 0) return;

    const minIdx = currentSentences[0].index;
    const maxIdx = currentSentences[currentSentences.length - 1].index;

    // If audio moved beyond current page and there is a next page
    if (playerState.sentenceIndex > maxIdx && page.nextOffset !== null) {
      setOffset(page.nextOffset);
    } else if (playerState.sentenceIndex < minIdx && page.offset > 0) {
      setOffset(Math.max(0, page.offset - 24));
    }
  }, [
    readerMode,
    isNarrationActive,
    page,
    playerState.sentenceIndex,
  ]);

  const currentPageSentenceCount = useMemo(() => {
    if (!page) return 20;
    const count = page.blocks.reduce((acc, b) => acc + (b.sentences?.length || 0), 0);
    return count > 0 ? count : 20;
  }, [page]);

  const handleScrollBeginDrag = () => {
    setUserScrolledAway(true);
    if (scrollPauseTimeoutRef.current) clearTimeout(scrollPauseTimeoutRef.current);
    scrollPauseTimeoutRef.current = setTimeout(() => {
      setUserScrolledAway(false);
    }, 10000);
  };

  const handleReturnToNarration = () => {
    setUserScrolledAway(false);
    if (scrollPauseTimeoutRef.current) clearTimeout(scrollPauseTimeoutRef.current);
    const blockIdx = page?.blocks.findIndex(b =>
      b.sentences?.some(s => s.index === playerState.sentenceIndex),
    );
    if (blockIdx !== undefined && blockIdx >= 0 && listRef.current) {
      try {
        listRef.current.scrollToIndex({
          index: blockIdx,
          viewPosition: 0.35,
          animated: true,
        });
      } catch {
        // Non-fatal
      }
    }
  };

  const returnChipThemed = useMemo(
    () => ({
      backgroundColor: colors.listen,
      shadowColor: isDark ? '#000' : '#854D0E',
    }),
    [colors.listen, isDark],
  );

  const playActionLabelStyle = useMemo(
    () => ({
      color: colors.listen,
      fontWeight: '700' as const,
    }),
    [colors.listen],
  );

  // 1. Load preferences
  useEffect(() => {
    readerPreferencesRepository.get().then(setPreferences).catch(() => undefined);
  }, []);

  // 2. Load annotations for this book
  const refreshAnnotations = useCallback(async () => {
    try {
      const items = await annotationsService.list({ bookId });
      setAnnotations(items);
    } catch {
      // Non-fatal
    }
  }, [bookId]);

  useEffect(() => {
    refreshAnnotations();
  }, [refreshAnnotations]);

  // Chapter audio status & preparation progress
  const refreshAudioStatus = useCallback(async () => {
    if (!currentChapter) {
      setChapterAudioStatus(null);
      return;
    }
    try {
      const status = await narrationPipelineService.getChapterAudioStatus(
        bookId,
        currentChapter.id,
      );
      setChapterAudioStatus(status);
    } catch {
      // Non-fatal
    }
  }, [bookId, currentChapter]);

  useEffect(() => {
    refreshAudioStatus();
  }, [refreshAudioStatus]);

  useEffect(() => {
    const unsub = narrationPipelineService.subscribeChapterProgress(progress => {
      if (
        progress.bookId === bookId &&
        (!currentChapter || progress.chapterId === currentChapter.id)
      ) {
        setChapterPrepProgress(progress);
        if (
          progress.state === 'ready' ||
          progress.state === 'failed' ||
          progress.state === 'cancelled'
        ) {
          refreshAudioStatus();
          if (progress.state === 'ready') {
            setTimeout(() => setChapterPrepProgress(null), 4000);
          }
        }
      }
    });
    return unsub;
  }, [bookId, currentChapter, refreshAudioStatus]);

  // 3. Initial load: Book, Chapters, and Reading Position
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      bookLibraryService.getBook(bookId),
      bookLibraryService.listChapters(bookId),
      bookLibraryService.getReadingPosition(bookId),
    ])
      .then(([bookResult, chaptersResult, positionResult]) => {
        if (!active) return;
        if (!chaptersResult.length) {
          throw new Error('No prepared chapters found. Prepare this book before reading.');
        }

        setBook(bookResult);
        setChapters(chaptersResult);

        // Determine starting chapter & offset
        let targetChapterIndex = 0;
        let targetOffset = 0;
        let targetSentenceIndex = 0;

        if (initialChapterId) {
          const idx = chaptersResult.findIndex(c => c.id === initialChapterId);
          targetChapterIndex = Math.max(0, idx);
          targetSentenceIndex = initialSentenceIndex ?? 0;
          targetOffset = Math.floor(targetSentenceIndex / 24) * 24;
        } else if (positionResult) {
          const idx = chaptersResult.findIndex(c => c.id === positionResult.chapterId);
          targetChapterIndex = Math.max(0, idx);
          targetSentenceIndex = positionResult.sentenceIndex;
          if (bookResult && bookResult.previewChapterId === positionResult.chapterId) {
            targetOffset = bookResult.previewBlockOffset ?? 0;
          }
        }

        setCurrentChapterIndex(targetChapterIndex);
        setOffset(targetOffset);
        setActiveSentenceIndex(targetSentenceIndex);
      })
      .catch(reason => {
        if (active) {
          setError(reason.message ?? 'Failed to open book.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId, initialChapterId, initialSentenceIndex]);

  // 4. Load page text when chapter or offset changes
  useEffect(() => {
    if (!currentChapter) return;
    let active = true;
    setLoading(true);
    setError(null);

    bookLibraryService
      .getChapterPage(bookId, currentChapter.id, offset)
      .then(result => {
        if (!active) return;
        setPage(result);
        setLoading(false);

        // Save preview position for quick continue
        bookLibraryService
          .savePreviewPosition(bookId, result.chapterId, result.offset)
          .catch(() => undefined);

        // On-device ligature normalization for cleaner display & TTS
        const currentSentences = result.blocks
          .flatMap(b => b.sentences || [])
          .map(s => ({ index: s.index, text: s.text, id: s.id }));

        if (currentSentences.length > 0) {
          const dbUpdates = currentSentences
            .map(s => {
              const fixed = fixLigatureSplits(s.text);
              return fixed !== s.text ? { id: s.id, normalizedText: fixed } : null;
            })
            .filter((u): u is { id: string; normalizedText: string } => u !== null && u.id.length > 0);

          if (dbUpdates.length > 0) {
            bookLibraryService.updateSentencesBatch(dbUpdates).catch(() => undefined);
          }
        }

        // Proactively normalize next page if available
        if (result.nextOffset !== null && result.nextOffset !== undefined) {
          const nextOffset = result.nextOffset;
          bookLibraryService
            .getChapterPage(bookId, currentChapter.id, nextOffset)
            .then(nextPageResult => {
              if (!active) return;
              const nextSentences = nextPageResult.blocks
                .flatMap(b => b.sentences || [])
                .map(s => ({ index: s.index, text: s.text, id: s.id }));
              if (nextSentences.length > 0) {
                const nextDbUpdates = nextSentences
                  .map(s => {
                    const fixed = fixLigatureSplits(s.text);
                    return fixed !== s.text ? { id: s.id, normalizedText: fixed } : null;
                  })
                  .filter((u): u is { id: string; normalizedText: string } => u !== null && u.id.length > 0);

                if (nextDbUpdates.length > 0) {
                  bookLibraryService.updateSentencesBatch(nextDbUpdates).catch(() => undefined);
                }
              }
            })
            .catch(() => undefined);
        }
      })
      .catch(reason => {
        if (active) {
          setError(reason.message ?? 'This chapter could not be loaded.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId, currentChapter, offset]);

  // Sentence tap handler
  const handleSentencePress = (sentence: {
    id: string;
    text: string;
    index: number;
    blockId: string;
  }) => {
    setActiveSentenceIndex(sentence.index);
    setSelectedSentence(sentence);
    setShowSentenceModal(true);
    persistSentencePosition(sentence.index);
  };

  const handleListenSentence = async () => {
    if (!selectedSentence || !currentChapter) return;
    setIsListeningSentence(true);
    try {
      const result = await narrationPipelineService.generateSentenceAudio(
        bookId,
        currentChapter.id,
        selectedSentence.index,
      );
      setShowSentenceModal(false);
      refreshAudioStatus();
      Alert.alert(
        'Playing Narration',
        `Sentence ${selectedSentence.index + 1} (${result.isCached ? 'cached' : 'generated'} with ${
          result.engine === 'kokoro' || result.engine === 'natural' ? 'Kokoro Neural' : 'System Voice'
        }, ${Math.max(1, Math.round(result.durationMs / 1000))}s)`,
      );
    } catch (err: any) {
      Alert.alert(
        'Narration Error',
        err.message ?? 'Could not generate sentence audio.',
      );
    } finally {
      setIsListeningSentence(false);
    }
  };

  const handlePrepareChapterAudio = async () => {
    if (!currentChapter) return;
    try {
      const started = await narrationPipelineService.prepareChapterAudio(
        bookId,
        currentChapter.id,
      );
      if (started) {
        Alert.alert(
          'Narration Started',
          'The chapter is being generated in the background. Audio will be ready for offline listening.',
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Preparation Notice',
        err.message ?? 'Could not start background narration.',
      );
    }
  };

  const handleCancelChapterAudio = async () => {
    if (!currentChapter) return;
    await narrationPipelineService.cancelChapterPreparation(
      bookId,
      currentChapter.id,
    );
    setChapterPrepProgress(null);
  };

  // Annotations lookup for current chapter
  const chapterAnnotations = useMemo(() => {
    if (!currentChapter) return new Map<number, BookAnnotation[]>();
    const map = new Map<number, BookAnnotation[]>();
    for (const ann of annotations) {
      if (ann.chapterId === currentChapter.id) {
        const list = map.get(ann.sentenceIndex) || [];
        list.push(ann);
        map.set(ann.sentenceIndex, list);
      }
    }
    return map;
  }, [annotations, currentChapter]);

  // Bookmark toggle on active sentence
  const handleToggleBookmark = async (sentenceIndex: number, sentenceText: string) => {
    if (!currentChapter || !book) return;
    const existing = (chapterAnnotations.get(sentenceIndex) || []).find(
      a => a.type === 'bookmark',
    );
    if (existing) {
      await annotationsService.remove(existing.id);
    } else {
      await annotationsService.add({
        bookId,
        bookTitle: book.title,
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        sentenceIndex,
        text: sentenceText,
        type: 'bookmark',
      });
    }
    await refreshAnnotations();
  };

  // Highlight color handler
  const handleSetHighlight = async (
    sentenceIndex: number,
    sentenceText: string,
    color: HighlightColor,
  ) => {
    if (!currentChapter || !book) return;
    const existing = (chapterAnnotations.get(sentenceIndex) || []).find(
      a => a.type === 'highlight',
    );
    if (existing && existing.color === color) {
      await annotationsService.remove(existing.id);
    } else if (existing) {
      await annotationsService.update(existing.id, { color });
    } else {
      await annotationsService.add({
        bookId,
        bookTitle: book.title,
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        sentenceIndex,
        text: sentenceText,
        type: 'highlight',
        color,
      });
    }
    await refreshAnnotations();
  };

  // Note save handler
  const handleSaveNote = async () => {
    if (!selectedSentence || !currentChapter || !book || !noteText.trim()) return;
    const existing = (chapterAnnotations.get(selectedSentence.index) || []).find(
      a => a.type === 'note',
    );
    if (existing) {
      await annotationsService.update(existing.id, { note: noteText.trim() });
    } else {
      await annotationsService.add({
        bookId,
        bookTitle: book.title,
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        sentenceIndex: selectedSentence.index,
        text: selectedSentence.text,
        type: 'note',
        note: noteText.trim(),
      });
    }
    setShowNoteModal(false);
    setNoteText('');
    await refreshAnnotations();
  };

  // Appearance controls
  const updateFontFamily = (family: 'serif' | 'sans') => {
    const updated = { ...preferences, fontFamily: family };
    setPreferences(updated);
    readerPreferencesRepository.set(updated).catch(() => undefined);
  };

  const adjustFontSize = (delta: number) => {
    const next = Math.min(28, Math.max(16, preferences.fontSize + delta));
    const updated = { ...preferences, fontSize: next };
    setPreferences(updated);
    readerPreferencesRepository.set(updated).catch(() => undefined);
  };

  const adjustLineHeight = (delta: number) => {
    const next = Math.min(2.0, Math.max(1.4, Math.round((preferences.lineHeight + delta) * 10) / 10));
    const updated = { ...preferences, lineHeight: next };
    setPreferences(updated);
    readerPreferencesRepository.set(updated).catch(() => undefined);
  };

  // Search filter
  const matchingSentenceIndices = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2 || !page) {
      return new Set<number>();
    }
    const query = searchQuery.trim().toLowerCase();
    const set = new Set<number>();
    for (const block of page.blocks) {
      for (const s of block.sentences) {
        if (s.text.toLowerCase().includes(query)) {
          set.add(s.index);
        }
      }
    }
    return set;
  }, [page, searchQuery]);

  const activeSentenceBookmarked = Boolean(
    (chapterAnnotations.get(activeSentenceIndex) || []).some(
      a => a.type === 'bookmark',
    ),
  );

  // Selected sentence annotations
  const selectedAnnotations = selectedSentence
    ? chapterAnnotations.get(selectedSentence.index) || []
    : [];
  const selectedHighlight = selectedAnnotations.find(a => a.type === 'highlight');
  const selectedBookmark = selectedAnnotations.find(a => a.type === 'bookmark');
  const selectedNote = selectedAnnotations.find(a => a.type === 'note');

  if (loading && !page) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={[styles.loadingText, { color: colors.inkMuted }]}>
            Opening reader…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !page) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}>
        <View style={styles.topbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={styles.topIcon}
          >
            <ChevronLeft size={24} color={colors.ink} />
          </Pressable>
        </View>
        <View style={[styles.center, { padding: spacing.xl }]}>
          <Text style={[styles.errorTitle, { color: colors.danger }]}>
            Unable to load book
          </Text>
          <Text style={[styles.errorText, { color: colors.inkMuted }]}>
            {error}
          </Text>
          <AppButton
            label="Return to Library"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]}>
      {/* Top Navigation Bar */}
      <View style={[styles.topbar, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          style={styles.topIcon}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>

        <View style={styles.headingCopy}>
          <Text style={[styles.bookTitle, { color: colors.ink }]} numberOfLines={1}>
            {book?.title ?? 'AI Book Reader'}
          </Text>
          <Text style={[styles.chapterLabel, { color: colors.inkMuted }]} numberOfLines={1}>
            {currentChapter?.title ?? 'Chapter'}
            {saveStatus ? ` · ${saveStatus}` : ''}
          </Text>
        </View>

        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activeSentenceBookmarked ? 'Remove bookmark' : 'Bookmark this sentence'
            }
            onPress={() => {
              if (page && page.blocks.length > 0) {
                const s = page.blocks[0].sentences[0];
                handleToggleBookmark(
                  activeSentenceIndex,
                  s ? s.text : 'Bookmarked sentence',
                );
              }
            }}
            style={styles.topIcon}
          >
            <Bookmark
              size={22}
              color={activeSentenceBookmarked ? colors.listen : colors.ink}
              fill={activeSentenceBookmarked ? colors.listen : 'transparent'}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              readerMode === 'read'
                ? 'Switch to Audiobook mode'
                : 'Switch to Reading mode'
            }
            onPress={handleToggleMode}
            style={[
              styles.topIcon,
              readerMode === 'audiobook' && { backgroundColor: colors.brandSoft },
            ]}
          >
            {readerMode === 'read' ? (
              <Headphones size={22} color={colors.ink} />
            ) : (
              <BookOpen size={22} color={colors.brand} />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search in chapter"
            onPress={() => setShowSearch(v => !v)}
            style={styles.topIcon}
          >
            <Search size={22} color={colors.ink} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Appearance settings"
            onPress={() => setShowAppearance(true)}
            style={styles.topIcon}
          >
            <Type size={22} color={colors.ink} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chapters"
            onPress={() => setShowChapters(true)}
            style={styles.topIcon}
          >
            <List size={22} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {/* In-Book Search Bar */}
      {showSearch && (
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.canvas, borderBottomColor: colors.border },
          ]}
        >
          <Search size={18} color={colors.inkMuted} style={styles.searchIcon} />
          <TextInput
            accessibilityLabel="Search text in chapter"
            placeholder="Search this chapter…"
            placeholderTextColor={colors.inkMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.ink }]}
            autoFocus
          />
          {searchQuery ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearchQuery('')}
              style={styles.searchAction}
            >
              <X size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close search"
            onPress={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            style={styles.searchAction}
          >
            <Text style={[styles.searchCloseText, { color: colors.brand }]}>
              Done
            </Text>
          </Pressable>
        </View>
      )}

      {/* Search results summary */}
      {showSearch && searchQuery.trim().length >= 2 && (
        <View style={[styles.searchSummary, { backgroundColor: colors.canvas }]}>
          <Text style={[styles.searchSummaryText, { color: colors.inkMuted }]}>
            {matchingSentenceIndices.size === 0
              ? 'No matches in this page'
              : `${matchingSentenceIndices.size} matching sentence${
                  matchingSentenceIndices.size > 1 ? 's' : ''
                }`}
          </Text>
        </View>
      )}

      {/* Background preparation progress banner */}
      {readerMode === 'audiobook' &&
        chapterPrepProgress &&
        chapterPrepProgress.state !== 'idle' &&
        chapterPrepProgress.state !== 'ready' && (
          <View
            style={[
              styles.prepBanner,
              {
                backgroundColor:
                  chapterPrepProgress.state === 'failed'
                    ? (isDark ? '#3D1C19' : '#FDE8E7')
                    : colors.listenSoft,
                borderBottomColor:
                  chapterPrepProgress.state === 'failed'
                    ? colors.danger
                    : colors.listen,
              },
            ]}
          >
            <View style={styles.prepBannerContent}>
              <View style={styles.prepBannerInfo}>
                <Text style={[styles.prepBannerTitle, { color: colors.ink }]}>
                  {chapterPrepProgress.state === 'failed'
                    ? 'Narration stopped'
                    : `Generating Audio (${chapterPrepProgress.readySegments}/${chapterPrepProgress.totalSegments})`}
                </Text>
                {chapterPrepProgress.message ? (
                  <Text
                    style={[styles.prepBannerSub, { color: colors.inkMuted }]}
                    numberOfLines={1}
                  >
                    {chapterPrepProgress.message}
                  </Text>
                ) : null}
              </View>
              {(chapterPrepProgress.state === 'generating' ||
                chapterPrepProgress.state === 'preparing') && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel chapter audio preparation"
                  onPress={handleCancelChapterAudio}
                  style={[styles.prepCancelBtn, { borderColor: colors.danger }]}
                >
                  <Text style={[styles.prepCancelText, { color: colors.danger }]}>
                    Cancel
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

      {/* Page-level audio preparation banner */}
      {readerMode === 'audiobook' &&
        isNarrationActive &&
        playerState.state === 'buffering' && (
          <View
            style={[
              styles.prepBanner,
              {
                backgroundColor: colors.listenSoft,
                borderBottomColor: colors.listen,
              },
            ]}
          >
            <View style={styles.prepBannerContent}>
              <ActivityIndicator
                size="small"
                color={colors.listen}
                style={{ marginRight: spacing.sm }}
              />
              <View style={styles.prepBannerInfo}>
                <Text style={[styles.prepBannerTitle, { color: colors.ink }]}>
                  {playerState.pagePreparationTotal && playerState.pagePreparationTotal > 0
                    ? `Preparing Page Narration (${playerState.pagePreparationReady || 0}/${playerState.pagePreparationTotal} ready)`
                    : 'Preparing page audio for continuous narration…'}
                </Text>
                <Text style={[styles.prepBannerSub, { color: colors.inkMuted }]}>
                  Synthesizing page upfront so it plays without stuttering
                </Text>
              </View>
            </View>
          </View>
        )}

      {/* Reader Content */}
      <FlatList<ChapterPage['blocks'][number]>
        ref={listRef}
        data={displayBlocks}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.contentList,
          readerMode === 'read'
            ? styles.readModePadding
            : styles.audioModePadding,
        ]}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollToIndexFailed={info => {
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
        }}
        ListHeaderComponent={
          (() => {
            const { chapterTag, chapterTitle } = parseChapterHeading(currentChapter?.title);
            return (
              <View style={styles.chapterHeader}>
                {chapterTag ? (
                  <Text style={[styles.chapterTag, { color: colors.listen }]}>
                    {chapterTag}
                  </Text>
                ) : null}
                <Text style={[styles.chapterHeading, { color: colors.ink }]}>
                  {chapterTitle || currentChapter?.title}
                </Text>
                {readerMode === 'audiobook' &&
                  chapterAudioStatus &&
                  chapterAudioStatus.totalSegments > 0 && (
                  <View style={styles.audioStatusRow}>
                    <View
                      style={[
                        styles.audioBadge,
                        {
                          backgroundColor: chapterAudioStatus.isComplete
                            ? colors.brandSoft
                            : colors.listenSoft,
                        },
                      ]}
                    >
                      <Headphones
                        size={13}
                        color={
                          chapterAudioStatus.isComplete ? colors.brand : colors.listen
                        }
                      />
                      <Text
                        style={[
                          styles.audioBadgeText,
                          {
                            color: chapterAudioStatus.isComplete
                              ? colors.brand
                              : colors.listen,
                          },
                        ]}
                      >
                        {chapterAudioStatus.isComplete
                          ? 'Audio Ready'
                          : `${chapterAudioStatus.readySegments} / ${chapterAudioStatus.totalSegments} prepared`}
                      </Text>
                    </View>

                    {!chapterAudioStatus.isComplete &&
                      (!chapterPrepProgress ||
                        chapterPrepProgress.state === 'idle' ||
                        chapterPrepProgress.state === 'cancelled' ||
                        chapterPrepProgress.state === 'failed') && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Prepare entire chapter audio"
                          onPress={handlePrepareChapterAudio}
                          style={[styles.prepHeaderBtn, { borderColor: colors.listen }]}
                        >
                          <Volume2 size={13} color={colors.listen} />
                          <Text
                            style={[
                              styles.prepHeaderBtnText,
                              { color: colors.listen },
                            ]}
                          >
                            Prepare Chapter
                          </Text>
                        </Pressable>
                      )}
                  </View>
                )}
              </View>
            );
          })()
        }
        renderItem={({ item: block }) => {
          const isHeading = block.kind === 'heading';

          return (
            <View style={styles.blockWrapper}>
              <Text
                style={[
                  isHeading ? styles.headingBlock : styles.paragraphBlock,
                  preferences.fontFamily === 'serif'
                    ? styles.serifFont
                    : styles.sansFont,
                  {
                    fontSize: isHeading
                      ? preferences.fontSize + 4
                      : preferences.fontSize,
                    lineHeight: Math.round(
                      (isHeading
                        ? preferences.fontSize + 4
                        : preferences.fontSize) * preferences.lineHeight,
                    ),
                    color: colors.ink,
                  },
                ]}
              >
                {block.sentences && block.sentences.length > 0
                  ? block.sentences.map((sentence: ChapterPage['blocks'][number]['sentences'][number]) => {
                      const isPlayingSentence =
                        isNarrationActive && sentence.index === playerState.sentenceIndex;
                      const isActive = sentence.index === activeSentenceIndex;
                      const isMatchingSearch = matchingSentenceIndices.has(
                        sentence.index,
                      );
                      const sentenceAnns =
                        chapterAnnotations.get(sentence.index) || [];
                      const highlight = sentenceAnns.find(
                        a => a.type === 'highlight',
                      );
                      const isBookmarked = sentenceAnns.some(
                        a => a.type === 'bookmark',
                      );
                      const hasNote = sentenceAnns.some(a => a.type === 'note');

                      let bg = 'transparent';
                      if (isMatchingSearch) {
                        bg = isDark ? '#6B501A' : '#FDE68A';
                      } else if (isPlayingSentence) {
                        bg = isDark ? 'rgba(224, 172, 97, 0.28)' : 'rgba(200, 135, 40, 0.20)';
                      } else if (isActive) {
                        bg = isDark ? 'rgba(224, 172, 97, 0.16)' : 'rgba(200, 135, 40, 0.10)';
                      } else if (highlight) {
                        const colorSpec = HIGHLIGHT_COLORS.find(
                          c => c.key === highlight.color,
                        );
                        bg = colorSpec
                          ? isDark
                            ? colorSpec.darkBg
                            : colorSpec.lightBg
                          : isDark
                          ? '#713F12'
                          : '#FEF08A';
                      }

                      return (
                        <Text
                          key={sentence.id}
                          onPress={() =>
                            handleSentencePress({
                              id: sentence.id,
                              text: sentence.text,
                              index: sentence.index,
                              blockId: block.id,
                            })
                          }
                          style={[
                            styles.sentence,
                            { backgroundColor: bg },
                            isPlayingSentence && styles.spokenSentence,
                            isBookmarked && styles.bookmarkedSentence,
                            hasNote && styles.notedSentence,
                          ]}
                        >
                          {cleanDisplayText(sentence.text).trim()}{' '}
                        </Text>
                      );
                    })
                  : cleanDisplayText(block.text)}
              </Text>
            </View>
          );
        }}
        ListFooterComponent={
          page ? (
            <View style={styles.footerContainer}>
              <View style={styles.paginationRow}>
                {page.offset > 0 ? (
                  <AppButton
                    label="Previous page"
                    variant="secondary"
                    onPress={() => setOffset(Math.max(0, page.offset - 24))}
                  />
                ) : currentChapterIndex > 0 ? (
                  <AppButton
                    label="Previous chapter"
                    variant="secondary"
                    onPress={() => {
                      setCurrentChapterIndex(v => v - 1);
                      setOffset(0);
                    }}
                  />
                ) : null}

                <Text style={[styles.pageIndicator, { color: colors.inkMuted }]}>
                  Blocks {page.offset + 1}–
                  {Math.min(page.offset + page.blocks.length, page.totalBlocks)} of{' '}
                  {page.totalBlocks}
                </Text>

                {page.nextOffset !== null ? (
                  <AppButton
                    label="Next page"
                    variant="secondary"
                    onPress={() => setOffset(page.nextOffset ?? page.offset + 24)}
                  />
                ) : currentChapterIndex < chapters.length - 1 ? (
                  <AppButton
                    label="Next chapter"
                    variant="secondary"
                    onPress={() => {
                      setCurrentChapterIndex(v => v + 1);
                      setOffset(0);
                    }}
                  />
                ) : null}
              </View>
            </View>
          ) : undefined
        }
      />

      {/* Floating Return to Narration Chip */}
      {readerMode === 'audiobook' && isNarrationActive && userScrolledAway && (
        <View style={styles.returnChipWrapper} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to spoken sentence"
            onPress={handleReturnToNarration}
            style={[styles.returnToNarrationChip, returnChipThemed]}
          >
            <Headphones size={15} color="#FFFFFF" />
            <Text style={styles.returnToNarrationText}>Return to narration</Text>
          </Pressable>
        </View>
      )}

      {/* Reader Bottom Player Bar */}
      {currentChapter && readerMode === 'audiobook' && (
        <ReaderPlayerBar
          bookId={bookId}
          chapterId={currentChapter.id}
          chapterTitle={currentChapter.title}
          bookTitle={book?.title}
          activeSentenceIndex={activeSentenceIndex}
          totalSentences={
            chapterAudioStatus?.totalSegments ||
            (page?.blocks.reduce((acc, b) => acc + (b.sentences?.length || 0), 0) || 1)
          }
          pageSize={currentPageSentenceCount}
          onOpenVoicePicker={() => setShowVoicePicker(true)}
          hasPrevChapter={currentChapterIndex > 0}
          hasNextChapter={currentChapterIndex < chapters.length - 1}
          onPrevChapter={() => {
            setCurrentChapterIndex(v => v - 1);
            setOffset(0);
          }}
          onNextChapter={() => {
            setCurrentChapterIndex(v => v + 1);
            setOffset(0);
          }}
        />
      )}

      {/* Sentence Action Modal */}
      <Modal
        visible={showSentenceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSentenceModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSentenceModal(false)}
        >
          <Pressable
            style={[
              styles.actionSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text
                style={[styles.sheetExcerpt, { color: colors.ink }]}
                numberOfLines={3}
              >
                “{cleanDisplayText(selectedSentence?.text || '')}”
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close actions"
                onPress={() => setShowSentenceModal(false)}
                style={styles.closeBtn}
              >
                <X size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            {/* Note Display if existing */}
            {selectedNote?.note ? (
              <View
                style={[
                  styles.noteExcerptBox,
                  { backgroundColor: colors.canvas, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.noteExcerptLabel, { color: colors.brand }]}>
                  YOUR NOTE:
                </Text>
                <Text style={[styles.noteExcerptContent, { color: colors.ink }]}>
                  {selectedNote.note}
                </Text>
              </View>
            ) : null}

            {/* Highlight color picker */}
            <View style={styles.actionSection}>
              <Text style={[styles.sectionHeading, { color: colors.inkMuted }]}>
                HIGHLIGHT
              </Text>
              <View style={styles.colorRow}>
                {HIGHLIGHT_COLORS.map(c => {
                  const isSelected = selectedHighlight?.color === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Highlight ${c.label}`}
                      onPress={() => {
                        if (selectedSentence) {
                          handleSetHighlight(
                            selectedSentence.index,
                            selectedSentence.text,
                            c.key,
                          );
                        }
                      }}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: isDark ? c.darkBg : c.lightBg },
                        isSelected && [
                          styles.selectedColorCircle,
                          { borderColor: colors.brand },
                        ],
                      ]}
                    >
                      {isSelected ? (
                        <Check size={16} color={isDark ? '#FFF' : '#000'} />
                      ) : null}
                    </Pressable>
                  );
                })}
                {selectedHighlight ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove highlight"
                    onPress={() => {
                      if (selectedHighlight) {
                        annotationsService
                          .remove(selectedHighlight.id)
                          .then(refreshAnnotations);
                      }
                    }}
                    style={[
                      styles.removeHighlightBtn,
                      { borderColor: colors.border },
                    ]}
                  >
                    <X size={14} color={colors.inkMuted} />
                    <Text
                      style={[styles.removeHighlightText, { color: colors.inkMuted }]}
                    >
                      Clear
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Actions Grid */}
            <View style={styles.sheetActionsGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Play continuous narration from here"
                onPress={async () => {
                  if (selectedSentence && currentChapter) {
                    setShowSentenceModal(false);
                    setReaderMode('audiobook');
                    await play(
                      bookId,
                      currentChapter.id,
                      selectedSentence.index,
                      undefined,
                      undefined,
                      undefined,
                      currentPageSentenceCount,
                    );
                  }
                }}
                style={[
                  styles.sheetActionItem,
                  {
                    backgroundColor: colors.listenSoft,
                    borderColor: colors.listen,
                  },
                ]}
              >
                <Play size={20} color={colors.listen} fill={colors.listen} />
                <Text style={[styles.sheetActionLabel, playActionLabelStyle]}>
                  Play
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Listen to sentence"
                disabled={isListeningSentence}
                onPress={handleListenSentence}
                style={[
                  styles.sheetActionItem,
                  {
                    backgroundColor: colors.canvas,
                    borderColor: colors.border,
                  },
                ]}
              >
                {isListeningSentence ? (
                  <ActivityIndicator size="small" color={colors.listen} />
                ) : (
                  <Volume2 size={20} color={colors.listen} />
                )}
                <Text
                  style={[
                    styles.sheetActionLabel,
                    { color: colors.listen },
                  ]}
                >
                  {isListeningSentence ? 'Generating…' : 'Listen'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  selectedBookmark ? 'Remove bookmark' : 'Bookmark sentence'
                }
                onPress={() => {
                  if (selectedSentence) {
                    handleToggleBookmark(
                      selectedSentence.index,
                      selectedSentence.text,
                    );
                  }
                }}
                style={[
                  styles.sheetActionItem,
                  {
                    backgroundColor: colors.canvas,
                    borderColor: selectedBookmark ? colors.listen : colors.border,
                  },
                ]}
              >
                <Bookmark
                  size={20}
                  color={selectedBookmark ? colors.listen : colors.ink}
                  fill={selectedBookmark ? colors.listen : 'transparent'}
                />
                <Text
                  style={[
                    styles.sheetActionLabel,
                    { color: selectedBookmark ? colors.listen : colors.ink },
                  ]}
                >
                  {selectedBookmark ? 'Bookmarked' : 'Bookmark'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectedNote ? 'Edit note' : 'Add note'}
                onPress={() => {
                  setNoteText(selectedNote?.note ?? '');
                  setShowNoteModal(true);
                  setShowSentenceModal(false);
                }}
                style={[styles.sheetActionItem, { backgroundColor: colors.canvas }]}
              >
                <StickyNote size={20} color={colors.ink} />
                <Text style={[styles.sheetActionLabel, { color: colors.ink }]}>
                  {selectedNote ? 'Edit note' : 'Add note'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share passage"
                onPress={() => {
                  if (selectedSentence) {
                    Share.share({ message: cleanDisplayText(selectedSentence.text) });
                  }
                }}
                style={[styles.sheetActionItem, { backgroundColor: colors.canvas }]}
              >
                <Share2 size={20} color={colors.ink} />
                <Text style={[styles.sheetActionLabel, { color: colors.ink }]}>
                  Share
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note Editor Modal */}
      <Modal
        visible={showNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNoteModal(false)}
      >
        <SafeAreaView style={styles.noteModalContainer}>
          <View
            style={[
              styles.noteModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>
                {selectedNote ? 'Edit Note' : 'Add Note'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setShowNoteModal(false)}
              >
                <X size={22} color={colors.inkMuted} />
              </Pressable>
            </View>

            <Text
              style={[styles.noteExcerptPreview, { color: colors.inkMuted }]}
              numberOfLines={2}
            >
              “{cleanDisplayText(selectedSentence?.text || '')}”
            </Text>

            <TextInput
              accessibilityLabel="Note text"
              placeholder="Write your note here…"
              placeholderTextColor={colors.inkMuted}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              style={[
                styles.noteInput,
                {
                  color: colors.ink,
                  backgroundColor: colors.canvas,
                  borderColor: colors.border,
                },
              ]}
              autoFocus
            />

            <View style={styles.noteModalButtons}>
              <AppButton
                label="Cancel"
                variant="secondary"
                onPress={() => setShowNoteModal(false)}
                style={styles.modalBtnFlex}
              />
              <AppButton
                label="Save note"
                onPress={handleSaveNote}
                disabled={!noteText.trim()}
                style={styles.modalBtnFlex}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Table of Contents Modal */}
      <Modal
        visible={showChapters}
        animationType="slide"
        onRequestClose={() => setShowChapters(false)}
      >
        <SafeAreaView
          style={[styles.fullModalSafe, { backgroundColor: colors.canvas }]}
        >
          <View
            style={[
              styles.modalTopBar,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.modalHeading, { color: colors.ink }]}>
              Table of Contents
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close table of contents"
              onPress={() => setShowChapters(false)}
              style={styles.topIcon}
            >
              <X size={24} color={colors.ink} />
            </Pressable>
          </View>

          <FlatList
            data={chapters}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => {
              const isCurrent = index === currentChapterIndex;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Chapter ${index + 1}: ${item.title}`}
                  onPress={() => {
                    setCurrentChapterIndex(index);
                    setOffset(0);
                    setShowChapters(false);
                  }}
                  style={[
                    styles.tocItem,
                    {
                      backgroundColor: isCurrent ? colors.brandSoft : colors.surface,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tocNumber,
                      { color: isCurrent ? colors.brand : colors.inkMuted },
                    ]}
                  >
                    {index + 1}
                  </Text>
                  <Text
                    style={[
                      styles.tocTitle,
                      { color: colors.ink },
                      isCurrent
                        ? styles.currentTocTitle
                        : styles.regularTocTitle,
                    ]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {isCurrent ? (
                    <Check size={18} color={colors.brand} />
                  ) : (
                    <ChevronRight size={18} color={colors.inkMuted} />
                  )}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Appearance Modal */}
      <Modal
        visible={showAppearance}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAppearance(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAppearance(false)}
        >
          <Pressable
            style={[
              styles.appearanceCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>
                Reading Appearance
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close appearance"
                onPress={() => setShowAppearance(false)}
              >
                <X size={22} color={colors.inkMuted} />
              </Pressable>
            </View>

            {/* Font Family Selection */}
            <View style={styles.prefRow}>
              <Text style={[styles.prefLabel, { color: colors.ink }]}>
                Font Family
              </Text>
              <View style={styles.toggleGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Serif font"
                  onPress={() => updateFontFamily('serif')}
                  style={[
                    styles.toggleBtn,
                    preferences.fontFamily === 'serif' && {
                      backgroundColor: colors.brand,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      styles.serifFont,
                      {
                        color:
                          preferences.fontFamily === 'serif'
                            ? colors.white
                            : colors.ink,
                      },
                    ]}
                  >
                    Serif
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sans font"
                  onPress={() => updateFontFamily('sans')}
                  style={[
                    styles.toggleBtn,
                    preferences.fontFamily === 'sans' && {
                      backgroundColor: colors.brand,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      styles.sansFont,
                      {
                        color:
                          preferences.fontFamily === 'sans'
                            ? colors.white
                            : colors.ink,
                      },
                    ]}
                  >
                    Sans
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Font Size Controls */}
            <View style={styles.prefRow}>
              <Text style={[styles.prefLabel, { color: colors.ink }]}>
                Font Size
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease font size"
                  onPress={() => adjustFontSize(-2)}
                  disabled={preferences.fontSize <= 16}
                  style={[
                    styles.stepperBtn,
                    { borderColor: colors.border },
                    preferences.fontSize <= 16 && styles.disabledButton,
                  ]}
                >
                  <Minus size={18} color={colors.ink} />
                </Pressable>
                <Text style={[styles.stepperValue, { color: colors.ink }]}>
                  {preferences.fontSize} sp
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase font size"
                  onPress={() => adjustFontSize(2)}
                  disabled={preferences.fontSize >= 28}
                  style={[
                    styles.stepperBtn,
                    { borderColor: colors.border },
                    preferences.fontSize >= 28 && styles.disabledButton,
                  ]}
                >
                  <Plus size={18} color={colors.ink} />
                </Pressable>
              </View>
            </View>

            {/* Line Spacing Controls */}
            <View style={styles.prefRow}>
              <Text style={[styles.prefLabel, { color: colors.ink }]}>
                Line Spacing
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease line spacing"
                  onPress={() => adjustLineHeight(-0.1)}
                  disabled={preferences.lineHeight <= 1.4}
                  style={[
                    styles.stepperBtn,
                    { borderColor: colors.border },
                    preferences.lineHeight <= 1.4 && styles.disabledButton,
                  ]}
                >
                  <Minus size={18} color={colors.ink} />
                </Pressable>
                <Text style={[styles.stepperValue, { color: colors.ink }]}>
                  {preferences.lineHeight.toFixed(1)}×
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase line spacing"
                  onPress={() => adjustLineHeight(0.1)}
                  disabled={preferences.lineHeight >= 2.0}
                  style={[
                    styles.stepperBtn,
                    { borderColor: colors.border },
                    preferences.lineHeight >= 2.0 && styles.disabledButton,
                  ]}
                >
                  <Plus size={18} color={colors.ink} />
                </Pressable>
              </View>
            </View>

            {/* Theme Toggle */}
            <View style={styles.prefRow}>
              <Text style={[styles.prefLabel, { color: colors.ink }]}>Theme</Text>
              <View style={styles.toggleGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Light warm theme"
                  onPress={() => setPreference('light')}
                  style={[
                    styles.toggleBtn,
                    preference === 'light' && { backgroundColor: colors.brand },
                  ]}
                >
                  <Sun
                    size={16}
                    color={preference === 'light' ? colors.white : colors.ink}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      {
                        color:
                          preference === 'light' ? colors.white : colors.ink,
                      },
                    ]}
                  >
                    Warm
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dark theme"
                  onPress={() => setPreference('dark')}
                  style={[
                    styles.toggleBtn,
                    preference === 'dark' && { backgroundColor: colors.brand },
                  ]}
                >
                  <Moon
                    size={16}
                    color={preference === 'dark' ? colors.white : colors.ink}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      {
                        color:
                          preference === 'dark' ? colors.white : colors.ink,
                      },
                    ]}
                  >
                    Dark
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voice and Narration Picker Modal */}
      <VoicePickerModal
        visible={showVoicePicker}
        onClose={() => {
          setShowVoicePicker(false);
          refreshAudioStatus();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: spacing.md, fontSize: 15 },
  errorTitle: { fontSize: 20, fontWeight: '700', marginBottom: spacing.xs },
  errorText: { fontSize: 14, textAlign: 'center', maxWidth: 300 },
  topbar: {
    height: 56,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  topIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingCopy: { flex: 1, paddingHorizontal: spacing.xs, alignItems: 'center' },
  bookTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1, textAlign: 'center' },
  chapterLabel: { fontSize: 11, marginTop: 1, textAlign: 'center' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  searchIcon: { marginRight: spacing.xxs },
  searchInput: { flex: 1, height: 40, fontSize: 15 },
  searchAction: { padding: spacing.xs },
  searchCloseText: { fontSize: 14, fontWeight: '700' },
  searchSummary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  searchSummaryText: { fontSize: 12 },
  content: { paddingHorizontal: 22, paddingTop: spacing.md },
  chapterHeader: {
    marginTop: spacing.xs,
    marginBottom: 28,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  chapterTag: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  chapterHeading: {
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  blockWrapper: { marginBottom: 18 },
  headingBlock: { fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.xs },
  paragraphBlock: { textAlign: 'left' },
  sentence: { borderRadius: 4, paddingVertical: 1 },
  bookmarkedSentence: { textDecorationLine: 'underline' },
  notedSentence: { borderBottomWidth: 1, borderBottomColor: '#D69A45' },
  footerContainer: { marginTop: spacing.xl, paddingBottom: spacing.xxl },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  pageIndicator: { fontSize: 12, textAlign: 'center', flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetExcerpt: { flex: 1, fontSize: 15, fontStyle: 'italic', marginRight: spacing.sm },
  closeBtn: { padding: spacing.xxs },
  noteExcerptBox: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.xxs,
  },
  noteExcerptLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  noteExcerptContent: { fontSize: 13 },
  actionSection: { gap: spacing.xs },
  sectionHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeHighlightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 4,
  },
  removeHighlightText: { fontSize: 12 },
  sheetActionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sheetActionItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  sheetActionLabel: { fontSize: 12, fontWeight: '600' },
  noteModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  noteModalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  noteExcerptPreview: { fontSize: 13, fontStyle: 'italic' },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  noteModalButtons: { flexDirection: 'row', gap: spacing.sm },
  modalBtnFlex: { flex: 1 },
  fullModalSafe: { flex: 1 },
  modalTopBar: {
    height: 60,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  modalHeading: { fontSize: 18, fontWeight: '700' },
  tocItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  tocNumber: { fontSize: 14, fontWeight: '700', minWidth: 28 },
  tocTitle: { flex: 1, fontSize: 15 },
  appearanceCard: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prefLabel: { fontSize: 15, fontWeight: '600' },
  toggleGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#D9D2C5',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: 6,
  },
  toggleBtnText: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 15, fontWeight: '700', minWidth: 54, textAlign: 'center' },
  contentList: { paddingHorizontal: 22, paddingTop: spacing.md },
  readModePadding: { paddingBottom: 50 },
  audioModePadding: { paddingBottom: 130 },
  selectedColorCircle: { borderWidth: 2.5 },
  currentTocTitle: { fontWeight: '700' },
  regularTocTitle: { fontWeight: '400' },
  serifFont: { fontFamily: 'serif' },
  sansFont: { fontFamily: 'sans-serif' },
  disabledButton: { opacity: 0.4 },
  audioStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  audioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  audioBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  prepHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  prepHeaderBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  prepBanner: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  prepBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  prepBannerInfo: {
    flex: 1,
  },
  prepBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  prepBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  prepCancelBtn: {
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  prepCancelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  spokenSentence: {
    borderRadius: 3,
  },
  returnChipWrapper: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  returnToNarrationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  returnToNarrationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
