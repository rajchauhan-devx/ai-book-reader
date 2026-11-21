export const lightColors = {
  canvas: '#FAF7F0',
  surface: '#FFFFFF',
  surfaceMuted: '#F2ECE1',
  ink: '#1C201D',
  inkMuted: '#686D65',
  brand: '#245241',
  brandPressed: '#1B3E31',
  brandSoft: '#D7E7DE',
  listen: '#C88728',
  listenSoft: '#F6E8CE',
  highlight: '#FBE8B6',
  danger: '#A8443A',
  success: '#2E7D5B',
  border: '#E2DBD0',
  white: '#FFFFFF',
  overlay: 'rgba(28, 32, 29, 0.45)',
  tabBar: '#FFFFFF',
  bookCoverBg: '#E9E2D4',
} as const;

export const darkColors = {
  canvas: '#111412',
  surface: '#1A1E1C',
  surfaceMuted: '#242B27',
  ink: '#F5F2EB',
  inkMuted: '#9DA49C',
  brand: '#64B692',
  brandPressed: '#78C5A3',
  brandSoft: '#20392E',
  listen: '#E5A548',
  listenSoft: '#45351E',
  highlight: '#48371C',
  danger: '#E57368',
  success: '#64B692',
  border: '#2E3832',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.70)',
  tabBar: '#1A1E1C',
  bookCoverBg: '#242B27',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const typography = {
  display: {fontSize: 36, lineHeight: 40, fontWeight: '700' as const},
  pageTitle: {fontSize: 30, lineHeight: 36, fontWeight: '700' as const},
  sectionTitle: {fontSize: 20, lineHeight: 26, fontWeight: '700' as const},
  title: {fontSize: 17, lineHeight: 23, fontWeight: '700' as const},
  body: {fontSize: 16, lineHeight: 24, fontWeight: '400' as const},
  label: {fontSize: 14, lineHeight: 20, fontWeight: '600' as const},
  small: {fontSize: 13, lineHeight: 18, fontWeight: '400' as const},
  reader: {fontSize: 20, lineHeight: 34, fontWeight: '400' as const},
} as const;

export type AppColors = typeof lightColors | typeof darkColors;
export type ThemePreference = 'system' | 'light' | 'dark';

