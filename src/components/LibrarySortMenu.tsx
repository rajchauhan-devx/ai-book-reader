import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppButton } from './AppButton';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, typography } from '../theme/tokens';
import type { LibrarySort } from '../services/libraryView';

export const librarySortOptions: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Recently read' },
  { value: 'added', label: 'Newest added' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'author', label: 'Author A–Z' },
];

/** Android Alert supports only three buttons; use a real list for sort choices. */
export function LibrarySortMenu({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: LibrarySort;
  onSelect: (value: LibrarySort) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: colors.surface }]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.ink }]}
            >
              Sort books
            </Text>
            {librarySortOptions.map(option => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: value === option.value }}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                style={[
                  styles.option,
                  {
                    backgroundColor:
                      value === option.value
                        ? colors.brandSoft
                        : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.label, { color: colors.ink }]}>
                  {option.label}
                </Text>
                {value === option.value ? (
                  <Text style={{ color: colors.brand }}>✓</Text>
                ) : null}
              </Pressable>
            ))}
            <AppButton
              label="Cancel sorting"
              variant="ghost"
              onPress={onClose}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: radius.lg,
  },
  content: { padding: 20, gap: 12 },
  title: typography.sectionTitle,
  label: { ...typography.body, flex: 1 },
  option: {
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
