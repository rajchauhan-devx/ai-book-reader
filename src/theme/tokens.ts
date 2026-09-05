export const lightColors = {
  canvas: '#F6F2E9',
  surface: '#FFFCF6',
  surfaceMuted: '#ECE6DA',
  ink: '#20241F',
  inkMuted: '#6D7068',
  brand: '#315C4C',
  brandPressed: '#264A3D',
  brandSoft: '#DCE8E1',
  listen: '#D69A45',
  listenSoft: '#F5E5C7',
  danger: '#A8443A',
  success: '#39745A',
  border: '#D9D2C5',
  white: '#FFFFFF',
  overlay: 'rgba(32, 36, 31, 0.42)',
  tabBar: '#FFFCF6',
} as const;

export const darkColors = {
  canvas: '#141815',
  surface: '#1D231F',
  surfaceMuted: '#29302B',
  ink: '#F3EFE6',
  inkMuted: '#AFB5AC',
  brand: '#79AD96',
  brandPressed: '#8FC0A9',
  brandSoft: '#273B32',
  listen: '#E0AC61',
  listenSoft: '#493B27',
  danger: '#E17C72',
  success: '#79AD96',
  border: '#39423C',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.62)',
  tabBar: '#1D231F',
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

