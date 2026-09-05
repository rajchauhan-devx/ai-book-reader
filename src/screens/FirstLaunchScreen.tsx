import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {BookOpenText, CloudOff, Gift, Headphones, ShieldCheck} from 'lucide-react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AppButton} from '../components/AppButton';
import {useAppTheme} from '../theme/ThemeProvider';
import {radius, spacing, typography} from '../theme/tokens';

type Props = {onContinue: () => void};

const benefits = [
  {icon: ShieldCheck, title: 'Private', body: 'Books and notes stay on your phone.'},
  {icon: CloudOff, title: 'Offline', body: 'Listen anywhere after voice setup.'},
  {icon: Gift, title: 'Free', body: 'No subscriptions, credits, or ads.'},
];

export function FirstLaunchScreen({onContinue}: Props) {
  const {colors} = useAppTheme();

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.canvas}]}>
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, {backgroundColor: colors.brand}]}>
            <BookOpenText size={26} color={colors.white} />
          </View>
          <Text style={[styles.brandName, {color: colors.ink}]}>AI Book Reader</Text>
        </View>

        <View style={styles.hero}>
          <View style={[styles.heroHalo, {backgroundColor: colors.brandSoft}]}>
            <View style={[styles.heroBook, {backgroundColor: colors.brand}]}>
              <Headphones size={48} color={colors.listenSoft} strokeWidth={1.7} />
            </View>
          </View>
          <Text style={[styles.title, {color: colors.ink}]}>Every book can become an audiobook.</Text>
          <Text style={[styles.subtitle, {color: colors.inkMuted}]}>
            Import your own books and listen in a natural voice. Reading and narration happen privately on this device.
          </Text>
        </View>

        <View style={styles.benefits}>
          {benefits.map(benefit => {
            const Icon = benefit.icon;
            return (
              <View key={benefit.title} style={styles.benefit}>
                <View style={[styles.benefitIcon, {backgroundColor: colors.surface}]}>
                  <Icon size={21} color={colors.brand} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.benefitTitle, {color: colors.ink}]}>{benefit.title}</Text>
                  <Text style={[styles.benefitBody, {color: colors.inkMuted}]}>{benefit.body}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <AppButton label="Open my library" fullWidth onPress={onContinue} />
          <Text style={[styles.footerNote, {color: colors.inkMuted}]}>
            Voice setup is optional and can be completed later from Home.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  content: {flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 620, width: '100%', alignSelf: 'center'},
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  brandMark: {width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  brandName: typography.title,
  hero: {alignItems: 'center', marginTop: spacing.xl},
  heroHalo: {width: 154, height: 154, borderRadius: 77, alignItems: 'center', justifyContent: 'center'},
  heroBook: {width: 94, height: 120, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '-4deg'}]},
  title: {...typography.pageTitle, fontSize: 32, lineHeight: 38, textAlign: 'center', marginTop: spacing.xl},
  subtitle: {...typography.body, textAlign: 'center', marginTop: spacing.sm, maxWidth: 520},
  benefits: {gap: spacing.sm, marginTop: spacing.xl},
  benefit: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  benefitIcon: {width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  benefitTitle: typography.label,
  benefitBody: typography.small,
  flex: {flex: 1},
  footer: {marginTop: 'auto', paddingTop: spacing.lg},
  footerNote: {...typography.small, textAlign: 'center', marginTop: spacing.sm},
});

