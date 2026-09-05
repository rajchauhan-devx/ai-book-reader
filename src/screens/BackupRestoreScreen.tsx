import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertCircle,
  Archive,
  CheckCircle,
  DownloadCloud,
  FileCheck,
  UploadCloud,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import {
  storageBackupService,
  type BackupPreviewResult,
  type StorageBreakdown,
} from '../services/storageBackup';
import { annotationsService } from '../services/annotations';

export function BackupRestoreScreen() {
  const { colors } = useAppTheme();
  const [includeAudio, setIncludeAudio] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [restoreUriInput, setRestoreUriInput] = useState('');
  const [previewResult, setPreviewResult] = useState<BackupPreviewResult | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<'merge' | 'replace'>('merge');
  const [storageInfo, setStorageInfo] = useState<StorageBreakdown | null>(null);
  const [notesCount, setNotesCount] = useState(0);

  const refreshData = useCallback(async () => {
    try {
      const [breakdown, annotations] = await Promise.all([
        storageBackupService.getStorageBreakdown(),
        annotationsService.list().catch(() => []),
      ]);
      setStorageInfo(breakdown);
      setNotesCount(annotations.length);
    } catch {
      // Non-blocking
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData]),
  );

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const result = await storageBackupService.exportBackup(includeAudio);
      Alert.alert(
        'Backup Created',
        `Successfully exported ${result.bookCount} book(s) (${(result.sizeBytes / (1024 * 1024)).toFixed(1)} MB). Use the Android share menu to save the file to your desired storage location.`,
      );
    } catch (err: any) {
      Alert.alert('Export Failed', err.message ?? 'Could not create backup archive.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleInspectBackup = async (uri: string) => {
    if (!uri.trim()) {
      Alert.alert('File Required', 'Please enter or select a valid backup file path or URI.');
      return;
    }
    setIsPreviewing(true);
    try {
      const preview = await storageBackupService.previewBackup(uri.trim());
      setPreviewResult(preview);
    } catch (err: any) {
      Alert.alert('Invalid Backup', err.message ?? 'Could not read this backup file.');
      setPreviewResult(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreUriInput.trim()) return;
    setIsRestoring(true);
    try {
      const result = await storageBackupService.restoreBackup(
        restoreUriInput.trim(),
        conflictStrategy,
      );
      Alert.alert(
        'Restore Complete',
        `Restored ${result.restoredBooks} book(s) and ${result.annotationsRestored} note(s)/bookmark(s) into your library.`,
      );
      setPreviewResult(null);
      setRestoreUriInput('');
      await refreshData();
    } catch (err: any) {
      Alert.alert('Restore Failed', err.message ?? 'Could not restore backup archive.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      {/* Overview Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Archive size={22} color={colors.brand} />
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Private Backup & Restore</Text>
        </View>
        <Text style={[styles.cardBody, { color: colors.inkMuted }]}>
          Your library is 100% offline. Export your books, notes, highlights, and reading progress
          into a single archive file that you can save to Google Drive, an SD card, or another phone.
        </Text>
      </View>

      {/* Export Section */}
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Export backup</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.statsRow}>
          <Text style={[styles.statsText, { color: colors.ink }]}>
            {storageInfo ? storageInfo.books.length : 0} book(s) · {notesCount} note(s) & bookmark(s)
          </Text>
        </View>

        {/* Audio Toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={[styles.toggleLabel, { color: colors.ink }]}>Include speech audio</Text>
            <Text style={[styles.toggleHint, { color: colors.inkMuted }]}>
              {includeAudio
                ? 'Backups will be much larger (audio included).'
                : 'Recommended: Audio is omitted so backups stay small (<5 MB). Audio can be regenerated anytime.'}
            </Text>
          </View>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel="Include speech audio in backup"
            value={includeAudio}
            onValueChange={setIncludeAudio}
            trackColor={{ false: colors.surfaceMuted, true: colors.brand }}
          />
        </View>

        <AppButton
          label={isExporting ? 'Creating backup…' : 'Export private backup (.aireader.zip)'}
          icon={UploadCloud}
          onPress={handleExportBackup}
          fullWidth
          disabled={isExporting}
        />
      </View>

      {/* Restore Section */}
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Restore backup</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.fieldLabel, { color: colors.ink }]}>Backup file path or URI</Text>
        <TextInput
          accessibilityRole="none"
          accessibilityLabel="Backup file path input"
          placeholder="/storage/emulated/0/Download/backup.aireader.zip"
          placeholderTextColor={colors.inkMuted}
          value={restoreUriInput}
          onChangeText={setRestoreUriInput}
          style={[
            styles.input,
            {
              backgroundColor: colors.canvas,
              borderColor: colors.border,
              color: colors.ink,
            },
          ]}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <AppButton
          label={isPreviewing ? 'Inspecting archive…' : 'Preview backup contents'}
          icon={DownloadCloud}
          variant="secondary"
          onPress={() => handleInspectBackup(restoreUriInput)}
          fullWidth
          disabled={isPreviewing || !restoreUriInput.trim()}
        />

        {/* Restore Preview Card */}
        {previewResult && (
          <View
            style={[
              styles.previewCard,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}
          >
            <View style={styles.previewRow}>
              <FileCheck size={18} color={colors.brand} />
              <Text style={[styles.previewHeading, { color: colors.ink }]}>Backup Verified</Text>
            </View>

            <Text style={[styles.previewDetail, { color: colors.ink }]}>
              • Books in backup: {previewResult.bookCount}
            </Text>
            <Text style={[styles.previewDetail, { color: colors.ink }]}>
              • Audio included: {previewResult.hasAudio ? 'Yes' : 'No (Text & Notes only)'}
            </Text>
            <Text style={[styles.previewDetail, { color: colors.ink }]}>
              • Required storage: {(previewResult.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB
            </Text>
            {previewResult.createdAt ? (
              <Text style={[styles.previewDetail, { color: colors.inkMuted }]}>
                • Created: {new Date(previewResult.createdAt).toLocaleString()}
              </Text>
            ) : null}

            {/* Conflict Warnings */}
            {previewResult.conflicts.length > 0 ? (
              <View style={styles.conflictBox}>
                <AlertCircle size={16} color="#B91C1C" />
                <Text style={styles.conflictText}>
                  {previewResult.conflicts.length} book(s) already exist in your library.
                </Text>
              </View>
            ) : null}

            {/* Strategy Options */}
            <View style={styles.strategyRow}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: conflictStrategy === 'merge' }}
                onPress={() => setConflictStrategy('merge')}
                style={[
                  styles.strategyOption,
                  conflictStrategy === 'merge' && { backgroundColor: colors.brandSoft },
                ]}
              >
                <Text
                  style={[
                    styles.strategyText,
                    { color: conflictStrategy === 'merge' ? colors.brand : colors.ink },
                  ]}
                >
                  Merge notes & progress
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: conflictStrategy === 'replace' }}
                onPress={() => setConflictStrategy('replace')}
                style={[
                  styles.strategyOption,
                  conflictStrategy === 'replace' && { backgroundColor: colors.brandSoft },
                ]}
              >
                <Text
                  style={[
                    styles.strategyText,
                    { color: conflictStrategy === 'replace' ? colors.brand : colors.ink },
                  ]}
                >
                  Replace existing
                </Text>
              </Pressable>
            </View>

            <AppButton
              label={isRestoring ? 'Restoring library…' : 'Confirm and restore'}
              icon={CheckCircle}
              onPress={handleConfirmRestore}
              fullWidth
              disabled={isRestoring}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { ...typography.title },
  cardBody: { ...typography.small, lineHeight: 18 },
  sectionTitle: { ...typography.sectionTitle, marginTop: spacing.md, marginBottom: spacing.sm },
  statsRow: { marginBottom: spacing.md },
  statsText: { ...typography.label, fontSize: 13 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  toggleCopy: { flex: 1 },
  toggleLabel: { ...typography.label, fontSize: 13 },
  toggleHint: { ...typography.small, fontSize: 11, marginTop: 2 },
  fieldLabel: { ...typography.label, fontSize: 12, marginBottom: spacing.xxs },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  previewCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  previewHeading: { ...typography.label, fontSize: 14, fontWeight: '700' },
  previewDetail: { ...typography.small, fontSize: 12 },
  conflictBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    marginTop: 4,
  },
  conflictText: { fontSize: 11, color: '#B91C1C', fontWeight: '600' },
  strategyRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  strategyOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  strategyText: { fontSize: 11, fontWeight: '600' },
});
