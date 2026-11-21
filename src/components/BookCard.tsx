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
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <BookCover book={book} width={width} height={coverHeight} />
      {selecting ? (
        <Text style={[styles.selectingTag, { color: colors.brand }]}>
          {selected ? '☑ Selected' : '☐ Select book'}
        </Text>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
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
            <MoreHorizontal size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {book.progress > 0 ? (
        <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
          <View
            style={[
              styles.progress,
              { backgroundColor: colors.listen, width: `${book.progress}%` },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <View
          style={[
            styles.formatBadge,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.formatText, { color: colors.inkMuted }]}>
            {(book.format ?? 'epub').toUpperCase()}
          </Text>
        </View>
        <Text
          style={[styles.meta, { color: colors.inkMuted }]}
          numberOfLines={1}
        >
          {book.progress > 0 ? `${book.progress}%` : 'New'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  selectingTag: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontWeight: '600',
  },
  titleRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  titleCopy: { flex: 1, gap: 2 },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  author: {
    fontSize: 12,
    lineHeight: 16,
  },
  track: { height: 3, borderRadius: radius.pill, marginTop: spacing.xs },
  progress: { height: 3, borderRadius: radius.pill },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  formatText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  meta: { fontSize: 11, fontWeight: '500' },
});
