import AsyncStorage from '@react-native-async-storage/async-storage';

export type AnnotationType = 'bookmark' | 'highlight' | 'note';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export type BookAnnotation = {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  sentenceId?: string;
  sentenceIndex: number;
  text: string;
  type: AnnotationType;
  color?: HighlightColor;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type AnnotationFilter = {
  bookId?: string;
  type?: AnnotationType;
};

const STORAGE_KEY = '@ai-book-reader/annotations';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAnnotation(value: unknown): BookAnnotation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const bookId = typeof record.bookId === 'string' ? record.bookId : '';
  const bookTitle = typeof record.bookTitle === 'string' ? record.bookTitle : '';
  const chapterId = typeof record.chapterId === 'string' ? record.chapterId : '';
  const chapterTitle =
    typeof record.chapterTitle === 'string' ? record.chapterTitle : '';
  const text = typeof record.text === 'string' ? record.text : '';
  const type =
    record.type === 'bookmark' ||
    record.type === 'highlight' ||
    record.type === 'note'
      ? record.type
      : null;

  if (!id || !bookId || !chapterId || !type) return null;

  const sentenceIndex =
    typeof record.sentenceIndex === 'number' &&
    Number.isFinite(record.sentenceIndex)
      ? Math.max(0, Math.floor(record.sentenceIndex))
      : 0;

  const color =
    record.color === 'yellow' ||
    record.color === 'green' ||
    record.color === 'blue' ||
    record.color === 'pink'
      ? record.color
      : undefined;

  const now = new Date().toISOString();
  const createdAt =
    typeof record.createdAt === 'string' ? record.createdAt : now;
  const updatedAt =
    typeof record.updatedAt === 'string' ? record.updatedAt : createdAt;

  return {
    id,
    bookId,
    bookTitle,
    chapterId,
    chapterTitle,
    sentenceId:
      typeof record.sentenceId === 'string' ? record.sentenceId : undefined,
    sentenceIndex,
    text,
    type,
    color,
    note: typeof record.note === 'string' ? record.note : undefined,
    createdAt,
    updatedAt,
  };
}

async function loadAll(): Promise<BookAnnotation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAnnotation)
      .filter((item): item is BookAnnotation => item !== null);
  } catch {
    return [];
  }
}

async function saveAll(items: BookAnnotation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const annotationsService = {
  async list(filter?: AnnotationFilter): Promise<BookAnnotation[]> {
    const items = await loadAll();
    return items
      .filter(item => {
        if (filter?.bookId && item.bookId !== filter.bookId) return false;
        if (filter?.type && item.type !== filter.type) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  },

  async findBySentence(
    bookId: string,
    chapterId: string,
    sentenceIndex: number,
  ): Promise<BookAnnotation[]> {
    const items = await loadAll();
    return items.filter(
      item =>
        item.bookId === bookId &&
        item.chapterId === chapterId &&
        item.sentenceIndex === sentenceIndex,
    );
  },

  async add(
    data: Omit<BookAnnotation, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<BookAnnotation> {
    const items = await loadAll();
    const now = new Date().toISOString();
    const created: BookAnnotation = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    items.push(created);
    await saveAll(items);
    return created;
  },

  async update(
    id: string,
    updates: Partial<Pick<BookAnnotation, 'note' | 'color' | 'type'>>,
  ): Promise<BookAnnotation | null> {
    const items = await loadAll();
    const index = items.findIndex(item => item.id === id);
    if (index < 0) return null;
    const existing = items[index];
    const updated: BookAnnotation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    items[index] = updated;
    await saveAll(items);
    return updated;
  },

  async remove(id: string): Promise<boolean> {
    const items = await loadAll();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) return false;
    await saveAll(filtered);
    return true;
  },

  async removeForBook(bookId: string): Promise<void> {
    const items = await loadAll();
    const filtered = items.filter(item => item.bookId !== bookId);
    await saveAll(filtered);
  },

  async exportToMarkdown(bookId?: string): Promise<string> {
    const items = await this.list(bookId ? { bookId } : undefined);
    if (!items.length) {
      return '# Saved Passages\n\nNo bookmarks, highlights, or notes yet.';
    }

    const books = new Map<string, BookAnnotation[]>();
    for (const item of items) {
      const title = item.bookTitle || 'Unknown Book';
      const existing = books.get(title) || [];
      existing.push(item);
      books.set(title, existing);
    }

    const sections: string[] = ['# Saved Passages\n'];
    for (const [title, bookItems] of books.entries()) {
      sections.push(`## ${title}\n`);
      for (const item of bookItems) {
        const typeLabel =
          item.type.charAt(0).toUpperCase() + item.type.slice(1);
        sections.push(`### ${typeLabel} — ${item.chapterTitle}`);
        if (item.text) {
          sections.push(`> ${item.text.trim()}\n`);
        }
        if (item.note) {
          sections.push(`**Note:** ${item.note.trim()}\n`);
        }
        sections.push(
          `*Saved on ${new Date(item.createdAt).toLocaleDateString()}*\n`,
        );
      }
    }
    return sections.join('\n');
  },
};
