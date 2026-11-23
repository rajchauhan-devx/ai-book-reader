export const lightColors = {
  canvas: '#FBF9F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F2EDE4',
  ink: '#1A1816',
  inkMuted: '#78716C',
  brand: '#059669',
  brandPressed: '#047857',
  brandSoft: 'rgba(5, 150, 105, 0.12)',
  listen: '#D97706',
  listenSoft: 'rgba(217, 119, 6, 0.14)',
  highlight: '#FEF08A',
  danger: '#DC2626',
  success: '#059669',
  border: '#E8E2D7',
  white: '#FFFFFF',
  overlay: 'rgba(26, 24, 22, 0.50)',
  tabBar: '#FFFFFF',
  bookCoverBg: '#EDE7DC',
} as const;

export const darkColors = {
  canvas: '#0E1013',
  surface: '#16191F',
  surfaceElevated: '#1D222A',
  surfaceMuted: '#222832',
  ink: '#F4F4F6',
  inkMuted: '#969CA6',
  brand: '#10B981',
  brandPressed: '#059669',
  brandSoft: 'rgba(16, 185, 129, 0.15)',
  listen: '#F59E0B',
  listenSoft: 'rgba(245, 158, 11, 0.16)',
  highlight: 'rgba(245, 158, 11, 0.22)',
  danger: '#EF4444',
  success: '#10B981',
  border: '#242A34',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.75)',
  tabBar: '#121419',
  bookCoverBg: '#1B2028',
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
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.5 },
  pageTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.2 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  small: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '500' as const },
  reader: { fontSize: 19, lineHeight: 32, fontWeight: '400' as const },
} as const;

export type AppColors = typeof lightColors | typeof darkColors;
export type ThemePreference = 'system' | 'light' | 'dark';
