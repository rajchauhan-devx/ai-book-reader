import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import { BookCover } from './BookCover';
import type { Book } from '../types/library';

type Props = {
  book: Book;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
  onMenu?: () => void;
  selecting?: boolean;
  selected?: boolean;
};

export function BookCard({
  book,
  width,
  onPress,
  onLongPress,
  onMenu,
  selecting,
  selected,
}: Props) {
  const { colors } = useAppTheme();
  const coverHeight = Math.round(width * 1.44);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author}, ${book.progress}% complete`}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.78 : 1 }]}
    >
      <BookCover book={book} width={width} height={coverHeight} />
      {selecting ? (
        <Text style={{ color: colors.brand }}>
          {selected ? '☑ Selected' : '☐ Select book'}
        </Text>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
            {book.title}
          </Text>
          <Text
            style={[styles.author, { color: colors.inkMuted }]}
            numberOfLines={1}
          >
            {book.author}
          </Text>
        </View>
        {onMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More options for ${book.title}`}
            onPress={event => {
              event.stopPropagation();
              onMenu();
            }}
            style={styles.menu}
          >
            <MoreHorizontal size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.progress,
            { backgroundColor: colors.listen, width: `${book.progress}%` },
          ]}
        />
      </View>
      <View style={styles.metaRow}>
        {book.genre && book.genre !== 'Uncategorized' ? (
          <View
            style={[
              styles.genreBadge,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}
          >
            <Text
              style={[styles.genreText, { color: colors.inkMuted }]}
              numberOfLines={1}
            >
              {book.genre}
            </Text>
          </View>
        ) : null}
        <Text
          style={[styles.meta, { color: colors.inkMuted }]}
          numberOfLines={1}
        >
          {book.isSample ? 'Sample · ' : ''}
          {book.remaining}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  titleCopy: { flex: 1, gap: 1 },
  title: { ...typography.label, fontSize: 15 },
  author: typography.small,
  track: { height: 4, borderRadius: radius.pill, marginTop: spacing.sm },
  progress: { height: 4, borderRadius: radius.pill },
  metaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  genreBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  genreText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  meta: { ...typography.small, fontSize: 12 },
});
