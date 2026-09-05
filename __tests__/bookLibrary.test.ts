import {
  formatBookBytes,
  normalizeBookImportProgress,
  normalizeBookSelection,
  normalizeImportedBook,
  normalizeChapterPage,
} from '../src/services/bookLibrary';

describe('book library bridge', () => {
  it('preserves safe library metadata, warnings and saved preview location', () => {
    const value = {
      id: 'book',
      title: 'Cover',
      coverImageUri: 'file:///private/cover.jpg',
      coverChoice: -1,
      warnings: ['Layout warning', 42],
      previewChapterId: 'chapter',
      previewBlockOffset: 24,
    };
    const book = normalizeImportedBook(value);
    expect(book.cover.imageUri).toBe(value.coverImageUri);
    expect(book.warnings).toEqual(['Layout warning']);
    expect(book.previewBlockOffset).toBe(24);
    expect(
      normalizeImportedBook({ ...value, coverChoice: 2 }).cover.imageUri,
    ).toBeUndefined();
  });
  it('does not advertise narration when only text has been prepared', () => {
    const book = normalizeImportedBook({
      id: 'ready-book',
      importState: 'ready',
      parserVersion: 'txt-1',
      preparationProgress: 500,
    });
    expect(book.remaining).toBe('Text ready · preview available');
    expect(book.parserVersion).toBe('txt-1');
    expect(book.preparationProgress).toBe(100);
    expect(
      normalizeImportedBook({ id: 'queued-book', importState: 'queued' })
        .remaining,
    ).toBe('Preparing text');
  });

  it('keeps original text and anchors in bounded chapter pages', () => {
    const page = normalizeChapterPage({
      chapterId: 'chapter-1',
      chapterTitle: 'Dawn',
      offset: 0,
      totalBlocks: 30,
      nextOffset: 24,
      blocks: [
        {
          id: 'block-1',
          text: 'नमस्ते, café.\nNext line.',
          kind: 'paragraph',
          ordinal: 0,
          sourceAnchor: 'txt:utf16:12-39',
        },
      ],
    });
    expect(page.nextOffset).toBe(24);
    expect(page.blocks[0].text).toBe('नमस्ते, café.\nNext line.');
    expect(page.blocks[0].sourceAnchor).toBe('txt:utf16:12-39');
  });

  it('rejects malformed pages and cannot loop on a backwards next offset', () => {
    expect(() =>
      normalizeChapterPage({ chapterId: 'x', blocks: [{ id: 'b' }] }),
    ).toThrow();
    expect(() => normalizeChapterPage({ blocks: [] })).toThrow();
    expect(
      normalizeChapterPage({
        chapterId: 'x',
        offset: 24,
        totalBlocks: 48,
        nextOffset: 0,
        blocks: [],
      }).nextOffset,
    ).toBeNull();
  });
  it('normalizes a stored book into a library card', () => {
    const book = normalizeImportedBook({
      id: 'book-123',
      title: 'A Local Story',
      author: 'Unknown author',
      format: 'epub',
      sourceFileName: 'A Local Story.epub',
      sourceSizeBytes: 2048,
      importState: 'pending_parse',
      progressPercent: 0,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      duplicate: false,
    });

    expect(book.title).toBe('A Local Story');
    expect(book.format).toBe('epub');
    expect(book.remaining).toBe('Ready to prepare');
    expect(book.cover.mark).toBe('AL');
    expect(book.createdAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('bounds progress values from the native bridge', () => {
    expect(
      normalizeBookImportProgress({
        phase: 'copying',
        progress: 3,
        copiedBytes: -2,
        totalBytes: 100,
        message: 'Copying',
      }),
    ).toEqual({
      phase: 'copying',
      progress: 1,
      copiedBytes: 0,
      totalBytes: 100,
      message: 'Copying',
    });
  });

  it('normalizes picker metadata and formats storage', () => {
    expect(
      normalizeBookSelection({
        uri: 'content://books/story',
        name: 'story.txt',
        size: 1_048_576,
        mimeType: 'text/plain',
      }),
    ).toEqual({
      uri: 'content://books/story',
      name: 'story.txt',
      size: 1_048_576,
      mimeType: 'text/plain',
    });
    expect(formatBookBytes(1_048_576)).toBe('1 MB');
  });
});
