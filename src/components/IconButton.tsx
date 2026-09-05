import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';
import {useAppTheme} from '../theme/ThemeProvider';
import {radius} from '../theme/tokens';

type Props = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  filled?: boolean;
  size?: number;
};

export function IconButton({icon: Icon, label, onPress, filled, size = 22}: Props) {
  const {colors} = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor: filled ? colors.brand : colors.surfaceMuted,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <Icon
        size={size}
        strokeWidth={2}
        color={filled ? colors.white : colors.ink}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

