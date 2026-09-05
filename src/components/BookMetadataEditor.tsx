import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton } from './AppButton';
import { coverPalettes } from '../services/bookLibrary';
import { useLibrary } from '../state/LibraryProvider';
import { useAppTheme } from '../theme/ThemeProvider';
import type { Book } from '../types/library';
import { radius, typography } from '../theme/tokens';
export function BookMetadataEditor({ book }: { book: Book }) {
  const { colors } = useAppTheme();
  const { updateBookMetadata, markBookFinished } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [genre, setGenre] = useState(book.genre ?? 'Uncategorized');
  const [cover, setCover] = useState(book.coverChoice ?? -1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      await updateBookMetadata(book.id, title, author, genre, cover);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Changes could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError('');
    try {
      await markBookFinished(book.id, book.progress !== 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.root}>
      {editing ? (
        <>
          <Text style={[styles.label, { color: colors.ink }]}>Title</Text>
          <TextInput
            accessibilityLabel="Book title"
            maxLength={160}
            value={title}
            onChangeText={setTitle}
            style={[
              styles.input,
              {
                color: colors.ink,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          />
          <Text style={[styles.label, { color: colors.ink }]}>Author</Text>
          <TextInput
            accessibilityLabel="Book author"
            maxLength={120}
            value={author}
            onChangeText={setAuthor}
            style={[
              styles.input,
              {
                color: colors.ink,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          />
          <Text style={[styles.label, { color: colors.ink }]}>Genre</Text>
          <View style={styles.genreChips}>
            {[
              'Fiction',
              'Non-Fiction',
              'Sci-Fi',
              'Fantasy',
              'Mystery',
              'Biography',
              'History',
              'Philosophy',
              'Self-Help',
              'Classics',
            ].map(g => {
              const active = genre === g;
              return (
                <Pressable
                  key={g}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setGenre(g)}
                  style={[
                    styles.genreChip,
                    {
                      backgroundColor: active ? colors.brand : colors.surface,
                      borderColor: active ? colors.brand : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.genreChipText,
                      { color: active ? colors.white : colors.ink },
                    ]}
                  >
                    {g}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="Custom genre"
            placeholder="Or enter custom genre…"
            placeholderTextColor={colors.inkMuted}
            maxLength={60}
            value={genre}
            onChangeText={setGenre}
            style={[
              styles.input,
              {
                color: colors.ink,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          />
          <Text style={[styles.label, { color: colors.ink }]}>Cover style</Text>
          <View style={styles.covers}>
            {[-1, 0, 1, 2, 3, 4].map(value => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={
                  value === -1 ? 'Original cover' : 'Cover color ' + (value + 1)
                }
                accessibilityState={{ selected: cover === value }}
                onPress={() => setCover(value)}
                style={[
                  styles.cover,
                  {
                    backgroundColor:
                      value === -1
                        ? colors.surface
                        : coverPalettes[value].background,
                    borderColor: cover === value ? colors.ink : colors.border,
                  },
                  cover === value
                    ? styles.selectedCover
                    : styles.unselectedCover,
                ]}
              >
                <Text
                  style={{ color: value === -1 ? colors.ink : colors.white }}
                >
                  {value === -1
                    ? 'Original'
                    : cover === value
                    ? '✓'
                    : String(value + 1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <AppButton
            label="Save details"
            loading={busy}
            disabled={!title.trim()}
            onPress={save}
          />
          <AppButton
            label="Cancel editing"
            variant="ghost"
            disabled={busy}
            onPress={() => setEditing(false)}
          />
        </>
      ) : (
        <AppButton
          label="Edit title, author, genre & cover"
          variant="secondary"
          onPress={() => {
            setTitle(book.title);
            setAuthor(book.author);
            setGenre(book.genre ?? 'Uncategorized');
            setCover(book.coverChoice ?? -1);
            setError('');
            setEditing(true);
          }}
        />
      )}
      {book.parserVersion ? (
        <AppButton
          label={book.progress === 100 ? 'Mark as reading' : 'Mark as finished'}
          variant="ghost"
          loading={busy}
          onPress={finish}
        />
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  selectedCover: { borderWidth: 3 },
  unselectedCover: { borderWidth: 1 },
  root: { gap: 10, marginTop: 20 },
  label: typography.label,
  input: {
    ...typography.body,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  covers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cover: {
    minWidth: 64,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    padding: 8,
  },
  genreChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  genreChipText: { fontSize: 13, fontWeight: '600' },
});
