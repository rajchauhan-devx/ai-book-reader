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

  const renderSpineEffects = () => (
    <>
      {/* Book spine highlight and fold crease */}
      <View style={styles.spineHighlight} pointerEvents="none" />
      <View style={styles.spineShadow} pointerEvents="none" />
      <View style={styles.spineSheen} pointerEvents="none" />
    </>
  );

  if (imageUri && imageUri !== failedUri) {
    return (
      <View
        style={[
          styles.container,
          { width, height, backgroundColor: book.cover.background },
        ]}
      >
        <Image
          source={{ uri: imageUri }}
          accessibilityLabel={`${book.title} book cover`}
          accessibilityRole="image"
          onError={() => setFailedUri(imageUri)}
          resizeMode="cover"
          style={[styles.image, { width, height }]}
        />
        {renderSpineEffects()}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${book.title} book cover`}
      style={[
        styles.container,
        styles.fallbackCover,
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
      {renderSpineEffects()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  image: {
    borderRadius: 8,
  },
  fallbackCover: {
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  spineHighlight: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  spineShadow: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.20)',
  },
  spineSheen: {
    position: 'absolute',
    left: 7,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
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
