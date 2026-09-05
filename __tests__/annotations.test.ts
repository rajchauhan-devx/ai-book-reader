import AsyncStorage from '@react-native-async-storage/async-storage';
import { annotationsService } from '../src/services/annotations';

describe('annotationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists empty array when no annotations exist', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
    const result = await annotationsService.list();
    expect(result).toEqual([]);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('@ai-book-reader/annotations');
  });

  it('adds a new bookmark and persists it', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
    const created = await annotationsService.add({
      bookId: 'book-1',
      bookTitle: 'Test Book',
      chapterId: 'chap-1',
      chapterTitle: 'Chapter 1',
      sentenceIndex: 3,
      text: 'First test sentence.',
      type: 'bookmark',
    });

    expect(created.id).toBeDefined();
    expect(created.type).toBe('bookmark');
    expect(created.text).toBe('First test sentence.');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@ai-book-reader/annotations',
      expect.stringContaining('First test sentence.'),
    );
  });

  it('filters annotations by bookId and type', async () => {
    const existing = [
      {
        id: '1',
        bookId: 'book-1',
        bookTitle: 'Book 1',
        chapterId: 'chap-1',
        chapterTitle: 'Chapter 1',
        sentenceIndex: 0,
        text: 'Sentence 1',
        type: 'bookmark',
        createdAt: '2026-09-04T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
      {
        id: '2',
        bookId: 'book-1',
        bookTitle: 'Book 1',
        chapterId: 'chap-1',
        chapterTitle: 'Chapter 1',
        sentenceIndex: 1,
        text: 'Sentence 2',
        type: 'highlight',
        color: 'yellow',
        createdAt: '2026-09-04T10:05:00.000Z',
        updatedAt: '2026-09-04T10:05:00.000Z',
      },
      {
        id: '3',
        bookId: 'book-2',
        bookTitle: 'Book 2',
        chapterId: 'chap-2',
        chapterTitle: 'Chapter 2',
        sentenceIndex: 0,
        text: 'Sentence from book 2',
        type: 'note',
        note: 'My personal note',
        createdAt: '2026-09-04T10:10:00.000Z',
        updatedAt: '2026-09-04T10:10:00.000Z',
      },
    ];
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(existing));

    const book1Only = await annotationsService.list({ bookId: 'book-1' });
    expect(book1Only).toHaveLength(2);

    const highlightsOnly = await annotationsService.list({ type: 'highlight' });
    expect(highlightsOnly).toHaveLength(1);
    expect(highlightsOnly[0].text).toBe('Sentence 2');

    const notesForBook2 = await annotationsService.list({
      bookId: 'book-2',
      type: 'note',
    });
    expect(notesForBook2).toHaveLength(1);
    expect(notesForBook2[0].note).toBe('My personal note');
  });

  it('updates an annotation note', async () => {
    const existing = [
      {
        id: 'ann-1',
        bookId: 'book-1',
        bookTitle: 'Book 1',
        chapterId: 'chap-1',
        chapterTitle: 'Chapter 1',
        sentenceIndex: 2,
        text: 'Important quote',
        type: 'note',
        note: 'Old note',
        createdAt: '2026-09-04T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ];
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(existing));

    const updated = await annotationsService.update('ann-1', {
      note: 'Updated note text',
    });
    expect(updated?.note).toBe('Updated note text');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@ai-book-reader/annotations',
      expect.stringContaining('Updated note text'),
    );
  });

  it('removes an annotation by id', async () => {
    const existing = [
      {
        id: 'ann-1',
        bookId: 'book-1',
        bookTitle: 'Book 1',
        chapterId: 'chap-1',
        chapterTitle: 'Chapter 1',
        sentenceIndex: 0,
        text: 'Delete me',
        type: 'bookmark',
        createdAt: '2026-09-04T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ];
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(existing));

    const removed = await annotationsService.remove('ann-1');
    expect(removed).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@ai-book-reader/annotations',
      '[]',
    );
  });

  it('exports annotations to markdown correctly', async () => {
    const existing = [
      {
        id: 'ann-1',
        bookId: 'book-1',
        bookTitle: 'Pride and Prejudice',
        chapterId: 'chap-1',
        chapterTitle: 'Chapter 1',
        sentenceIndex: 0,
        text: 'It is a truth universally acknowledged...',
        type: 'highlight',
        color: 'yellow',
        createdAt: '2026-09-04T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ];
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(existing));

    const md = await annotationsService.exportToMarkdown();
    expect(md).toContain('# Saved Passages');
    expect(md).toContain('## Pride and Prejudice');
    expect(md).toContain('It is a truth universally acknowledged...');
  });
});
