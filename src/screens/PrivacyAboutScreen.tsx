import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle,
  Code,
  FileText,
  Lock,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing, typography } from '../theme/tokens';
import { storageBackupService } from '../services/storageBackup';
import type { RootStackParamList } from '../types/navigation';

export function PrivacyAboutScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [isExportingDiag, setIsExportingDiag] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportDiagnostics = async () => {
    setIsExportingDiag(true);
    try {
      await storageBackupService.exportDiagnostics();
    } catch (err: any) {
      Alert.alert(
        'Export Failed',
        err.message ?? 'Could not export diagnostics report.',
      );
    } finally {
      setIsExportingDiag(false);
    }
  };

  const handleExecuteDeleteAll = async () => {
    if (deleteConfirmText.trim() !== 'DELETE') {
      return;
    }

    setIsDeleting(true);
    try {
      await storageBackupService.deleteAllAppData();
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      Alert.alert(
        'Data Deleted',
        'All application data, books, and settings have been permanently wiped.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'MainTabs' }],
              });
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert(
        'Delete Failed',
        err.message ?? 'Could not complete data reset.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteInputThemed = React.useMemo(
    () => ({
      backgroundColor: colors.surfaceMuted,
      color: colors.ink,
      borderColor: colors.border,
    }),
    [colors.surfaceMuted, colors.ink, colors.border],
  );

  const deleteBtnStyle: ViewStyle = React.useMemo(
    () => ({
      ...styles.modalButton,
      backgroundColor:
        deleteConfirmText.trim() === 'DELETE'
          ? '#DC2626'
          : colors.surfaceMuted,
    }),
    [deleteConfirmText, colors.surfaceMuted],
  );

  return (
    <Screen contentStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.brand }]}>
        ZERO TELEMETRY · 100% PRIVATE
      </Text>
      <Text style={[styles.pageTitle, { color: colors.ink }]}>
        Privacy & About
      </Text>

      {/* OFFLINE MANIFESTO */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrapper,
              isDark ? styles.shieldDark : styles.shieldLight,
            ]}
          >
            <ShieldCheck size={22} color="#2E7D32" />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>
              Offline Manifesto
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.inkMuted }]}>
              Our privacy promises to you
            </Text>
          </View>
        </View>

        <View style={styles.manifestoList}>
          <View style={styles.manifestoItem}>
            <CheckCircle size={18} color="#2E7D32" style={styles.checkIcon} />
            <View style={styles.manifestoText}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>
                100% Local Processing
              </Text>
              <Text style={[styles.itemBody, { color: colors.inkMuted }]}>
                Your books, chapters, bookmarks, reading positions, and notes
                never leave your device. All text parsing happens locally in
                native memory.
              </Text>
            </View>
          </View>

          <View style={styles.manifestoItem}>
            <CheckCircle size={18} color="#2E7D32" style={styles.checkIcon} />
            <View style={styles.manifestoText}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>
                Zero Telemetry & Tracking
              </Text>
              <Text style={[styles.itemBody, { color: colors.inkMuted }]}>
                No analytics SDKs, no ad trackers, no user fingerprinting, and no
                background network beacons. We collect zero personal data.
              </Text>
            </View>
          </View>

          <View style={styles.manifestoItem}>
            <CheckCircle size={18} color="#2E7D32" style={styles.checkIcon} />
            <View style={styles.manifestoText}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>
                Local On-Device Speech Synthesis
              </Text>
              <Text style={[styles.itemBody, { color: colors.inkMuted }]}>
                Voice narration runs directly on your phone's processor using
                ONNX Runtime and quantized Chatterbox-Nano neural weights. No
                cloud audio servers or external APIs.
              </Text>
            </View>
          </View>

          <View style={styles.manifestoItem}>
            <CheckCircle size={18} color="#2E7D32" style={styles.checkIcon} />
            <View style={styles.manifestoText}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>
                Air-Gapped Operation
              </Text>
              <Text style={[styles.itemBody, { color: colors.inkMuted }]}>
                The entire app functions completely offline in Airplane Mode.
                Network connectivity is only optionally utilized if you download
                a voice model package.
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* SANITIZED DIAGNOSTICS */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <FileText size={22} color={colors.brand} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>
              Diagnostics Export
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.inkMuted }]}>
              Zero-leakage technical report
            </Text>
          </View>
        </View>

        <Text style={[styles.cardBody, { color: colors.inkMuted }]}>
          Need help troubleshooting? Generate a sanitized diagnostic file.
          This report strictly includes device specs, Android version, storage
          allocation, and audio engine metrics.
        </Text>

        <View
          style={[
            styles.guaranteeBox,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <Lock size={16} color={colors.inkMuted} />
          <Text style={[styles.guaranteeText, { color: colors.inkMuted }]}>
            Zero personal data guarantee: Book titles, author names, reading
            passages, and personal notes are completely excluded.
          </Text>
        </View>

        <AppButton
          label="Export Diagnostics"
          icon={FileText}
          variant="secondary"
          disabled={isExportingDiag}
          loading={isExportingDiag}
          fullWidth
          onPress={handleExportDiagnostics}
        />
      </View>

      {/* OPEN SOURCE & LICENSES */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <Code size={22} color={colors.brand} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>
              Open Source & Credits
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.inkMuted }]}>
              Third-party libraries & models
            </Text>
          </View>
        </View>

        <View style={styles.licenseRow}>
          <View style={styles.licenseInfo}>
            <Text style={[styles.licenseName, { color: colors.ink }]}>
              Chatterbox-Nano ONNX
            </Text>
            <Text style={[styles.licenseDetail, { color: colors.inkMuted }]}>
              Neural speech synthesis weights · MIT / Apache 2.0
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.licenseRow,
            { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          ]}
        >
          <View style={styles.licenseInfo}>
            <Text style={[styles.licenseName, { color: colors.ink }]}>
              ONNX Runtime Mobile
            </Text>
            <Text style={[styles.licenseDetail, { color: colors.inkMuted }]}>
              Cross-platform high-performance ML inference · MIT
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.licenseRow,
            { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          ]}
        >
          <View style={styles.licenseInfo}>
            <Text style={[styles.licenseName, { color: colors.ink }]}>
              React Native & Android Jetpack
            </Text>
            <Text style={[styles.licenseDetail, { color: colors.inkMuted }]}>
              Core architecture, Room SQLite & MediaSession · MIT / Apache 2.0
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.licenseRow,
            { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          ]}
        >
          <View style={styles.licenseInfo}>
            <Text style={[styles.licenseName, { color: colors.ink }]}>
              Lucide Icons
            </Text>
            <Text style={[styles.licenseDetail, { color: colors.inkMuted }]}>
              Beautiful & consistent typography iconography · ISC License
            </Text>
          </View>
        </View>
      </View>

      {/* DANGER ZONE: DELETE ALL APP DATA */}
      <View
        style={[
          styles.dangerCard,
          isDark ? styles.dangerCardDark : styles.dangerCardLight,
        ]}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrapper,
              isDark ? styles.dangerIconDark : styles.dangerIconLight,
            ]}
          >
            <AlertTriangle size={22} color="#DC2626" />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text style={[styles.dangerCardTitle, styles.dangerText]}>
              Danger Zone
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.inkMuted }]}>
              Irreversible factory data wipe
            </Text>
          </View>
        </View>

        <Text style={[styles.cardBody, { color: colors.ink }]}>
          Permanently delete all imported books, reading progress, bookmarks,
          annotations, generated audio cache, and voice model files. This
          action cannot be reversed.
        </Text>

        <AppButton
          label="Delete All App Data..."
          icon={Trash2}
          variant="secondary"
          fullWidth
          onPress={() => setShowDeleteModal(true)}
          style={styles.dangerButton}
        />
      </View>

      <Text style={[styles.version, { color: colors.inkMuted }]}>
        AI Book Reader · Phase 7 (Offline Completeness)
      </Text>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <AlertTriangle size={22} color="#DC2626" />
                <Text style={[styles.modalTitle, { color: colors.ink }]}>
                  Confirm Full Reset
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDeleteModal(false)}
                hitSlop={12}
              >
                <X size={20} color={colors.inkMuted} />
              </Pressable>
            </View>

            <Text style={[styles.modalWarning, { color: colors.inkMuted }]}>
              This will erase all books, reading positions, bookmarks, notes,
              and downloaded voice models from this device.
            </Text>

            <Text style={[styles.modalPrompt, { color: colors.ink }]}>
              Type <Text style={styles.deleteKeyword}>DELETE</Text> below to
              confirm:
            </Text>

            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.deleteInput,
                deleteInputThemed,
                deleteConfirmText === 'DELETE' && styles.deleteInputActive,
              ]}
            />

            <View style={styles.modalActions}>
              <AppButton
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                style={styles.modalButton}
              />
              <AppButton
                label={isDeleting ? 'Deleting...' : 'Delete Everything'}
                variant="primary"
                loading={isDeleting}
                disabled={deleteConfirmText.trim() !== 'DELETE' || isDeleting}
                onPress={handleExecuteDeleteAll}
                style={deleteBtnStyle}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: 160,
  },
  eyebrow: {
    ...typography.small,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  pageTitle: {
    ...typography.pageTitle,
    marginBottom: spacing.lg,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    ...typography.title,
    fontSize: 17,
  },
  cardSubtitle: {
    ...typography.small,
    fontSize: 12,
  },
  cardBody: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  manifestoList: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  manifestoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkIcon: {
    marginTop: 2,
  },
  manifestoText: {
    flex: 1,
  },
  itemTitle: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  itemBody: {
    ...typography.small,
    fontSize: 13,
    lineHeight: 18,
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  guaranteeText: {
    flex: 1,
    ...typography.small,
    fontSize: 12,
    lineHeight: 16,
  },
  diagButton: {
    width: '100%',
  },
  licenseRow: {
    paddingVertical: spacing.sm,
  },
  licenseInfo: {
    gap: 2,
  },
  licenseName: {
    ...typography.label,
    fontSize: 14,
  },
  licenseDetail: {
    ...typography.small,
    fontSize: 12,
  },
  dangerCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  dangerCardTitle: {
    ...typography.title,
    fontSize: 17,
    fontWeight: '800',
  },
  dangerButton: {
    width: '100%',
    borderColor: 'rgba(220, 38, 38, 0.4)',
  },
  version: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modalTitle: {
    ...typography.title,
    fontSize: 18,
    fontWeight: '800',
  },
  modalWarning: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  modalPrompt: {
    ...typography.label,
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  deleteKeyword: {
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 1,
  },
  deleteInput: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
  shieldDark: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  shieldLight: {
    backgroundColor: '#E8F5E9',
  },
  dangerCardDark: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  dangerCardLight: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  dangerIconDark: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  dangerIconLight: {
    backgroundColor: '#FEE2E2',
  },
  dangerText: {
    color: '#DC2626',
  },
  deleteInputActive: {
    borderColor: '#DC2626',
  },
  deleteBtnActive: {
    backgroundColor: '#DC2626',
  },
});
