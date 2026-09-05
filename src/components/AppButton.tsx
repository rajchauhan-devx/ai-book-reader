import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useAppTheme} from '../theme/ThemeProvider';
import {radius, spacing, typography} from '../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function AppButton({
  label,
  onPress,
  icon: Icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: Props) {
  const {colors} = useAppTheme();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const foreground = isPrimary ? colors.white : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: disabled || loading, busy: loading}}
      disabled={disabled || loading}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: isPrimary
            ? pressed
              ? colors.brandPressed
              : colors.brand
            : isSecondary
              ? colors.surface
              : 'transparent',
          borderColor: isSecondary ? colors.border : 'transparent',
          opacity: disabled ? 0.48 : 1,
        },
        style,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : Icon ? (
          <Icon size={18} strokeWidth={2.2} color={foreground} />
        ) : null}
        <Text style={[styles.label, {color: foreground}]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {width: '100%'},
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  label: typography.label,
});
