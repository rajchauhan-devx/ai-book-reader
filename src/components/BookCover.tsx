import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../theme/tokens';
import type { Book } from '../types/library';

type Props = {
  book: Book;
  width?: number;
  height?: number;
};

export function BookCover({ book, width = 132, height = 190 }: Props) {
  const [failedUri, setFailedUri] = useState<string>();
  const imageUri = book.cover.imageUri;
  if (imageUri && imageUri !== failedUri)
    return (
      <Image
        source={{ uri: imageUri }}
        accessibilityLabel={`${book.title} book cover`}
        accessibilityRole="image"
        onError={() => setFailedUri(imageUri)}
        resizeMode="cover"
        style={[
          styles.cover,
          { width, height, backgroundColor: book.cover.background },
        ]}
      />
    );
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${book.title} book cover`}
      style={[
        styles.cover,
        { width, height, backgroundColor: book.cover.background },
      ]}
    >
      <View style={[styles.rule, { backgroundColor: book.cover.accent }]} />
      <Text style={[styles.mark, { color: book.cover.accent }]}>
        {book.cover.mark}
      </Text>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={3}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {book.author}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    padding: spacing.md,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  rule: { width: 28, height: 3, borderRadius: 3 },
  mark: {
    position: 'absolute',
    right: -4,
    top: 42,
    fontSize: 46,
    fontWeight: '800',
    opacity: 0.14,
  },
  copy: { gap: 6 },
  title: { color: '#FFFFFF', fontSize: 15, lineHeight: 18, fontWeight: '700' },
  author: { color: 'rgba(255,255,255,0.74)', fontSize: 10, lineHeight: 13 },
});
