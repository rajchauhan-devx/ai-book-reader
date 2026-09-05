import React from 'react';
import {
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppTheme} from '../theme/ThemeProvider';

type Props = ScrollViewProps & {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
};

export function Screen({children, contentStyle, scroll = true, ...props}: Props) {
  const {colors} = useAppTheme();

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.canvas}]} edges={['top']}>
      {scroll ? (
        <ScrollView
          {...props}
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {flexGrow: 1},
});
