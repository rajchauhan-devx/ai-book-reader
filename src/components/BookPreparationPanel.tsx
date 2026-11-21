import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { BookOpen, FileText, Headphones, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppButton } from './AppButton';
import { useLibrary } from '../state/LibraryProvider';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import type { Book } from '../types/library';
import type { RootStackParamList } from '../types/navigation';

export function BookPreparationPanel({ book }: { book: Book }) {
  const { colors } = useAppTheme();
  const { prepareBook, cancelPreparation, reprocessBook } = useLibrary();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !!book.parserVersion;
  const preparing =
    book.importState === 'queued' || book.importState === 'parsing';
  const supported = ['txt', 'epub', 'pdf'].includes(book.format ?? '');
  const percent = book.preparationProgress ?? 0;

  async function runAction(cancel: boolean, reprocess = false) {
    setActionBusy(true);
    setError(null);
    try {
      if (cancel) await cancelPreparation(book.id);
      else if (reprocess) await reprocessBook(book.id);
      else await prepareBook(book.id);
    } catch (reason) {
      setError(
        reason && typeof reason === 'object' && 'message' in reason
          ? String(reason.message)
          : 'Please try again.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.brandSoft, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.ink }]}>
          {preparing
            ? 'Preparing your book'
            : ready
            ? 'Your text is ready'
            : 'Safely stored on this phone'}
        </Text>
        <Text style={[styles.body, { color: colors.inkMuted }]}>
          {preparing
            ? `${
                book.preparationMessage ?? 'Waiting to prepare text'
              } · ${percent}%`
            : ready
            ? 'Read the extracted text with automatic page and chapter saving. Full-book narration is the next major step.'
            : supported
            ? 'Prepare this book into readable text privately on your phone. Scanned PDFs require OCR and protected books are not supported.'
            : 'This file format is not supported.'}
        </Text>
        {preparing ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Text preparation"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
          >
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.brand, width: `${percent}%` },
              ]}
            />
          </View>
        ) : null}
        {book.failureMessage || error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.body,
              {
                color:
                  error || book.importState === 'failed'
                    ? colors.danger
                    : colors.inkMuted,
              },
            ]}
          >
            {error ?? book.failureMessage}
          </Text>
        ) : null}
      </View>
      {ready ? (
        <View style={styles.actionGroup}>
          <AppButton
            label="Listen (Audiobook)"
            icon={Headphones}
            fullWidth
            onPress={() =>
              navigation.navigate('Reader', {
                bookId: book.id,
                mode: 'audiobook',
              })
            }
          />
          <AppButton
            label="Read Book"
            icon={BookOpen}
            variant="secondary"
            fullWidth
            onPress={() =>
              navigation.navigate('Reader', { bookId: book.id, mode: 'read' })
            }
          />
        </View>
      ) : null}
      {book.warnings?.map(warning => (
        <Text key={warning} style={[styles.body, { color: colors.inkMuted }]}>
          {warning}
        </Text>
      ))}
      {preparing ? (
        <AppButton
          label="Stop preparation"
          icon={X}
          variant="secondary"
          fullWidth
          loading={actionBusy}
          onPress={() => runAction(true)}
        />
      ) : !ready ? (
        <AppButton
          label={book.failureCode ? 'Retry preparation' : 'Prepare text'}
          icon={FileText}
          fullWidth
          disabled={!supported}
          loading={actionBusy}
          onPress={() => runAction(false)}
        />
      ) : (
        <AppButton
          label="Prepare text again"
          variant="ghost"
          loading={actionBusy}
          onPress={() =>
            Alert.alert(
              'Prepare again?',
              'Your existing text remains available until the new extraction is saved. Matching reading locations are retained; changed locations may reset.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Prepare again',
                  onPress: () => runAction(false, true),
                },
              ],
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  card: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  title: typography.sectionTitle,
  body: { ...typography.small, marginTop: spacing.xs },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  fill: { height: '100%' },
  actionGroup: { gap: spacing.sm },
  modeCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  modeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeTextCol: {
    flex: 1,
  },
  modeTitle: {
    ...typography.title,
    fontSize: 15,
  },
  modeDesc: {
    ...typography.small,
    fontSize: 12,
  },
});
