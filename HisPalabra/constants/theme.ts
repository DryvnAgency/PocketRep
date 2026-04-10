/**
 * His Palabra — Design System
 * Scripture first. Dark theme. Gold accent.
 */

export const Colors = {
  bg: '#080810',
  s1: '#10101C',
  s2: '#181828',
  s3: '#202035',
  border: '#252540',
  text: '#EEEDF8',
  muted: '#6868A0',
  dim: '#383858',

  gold: '#F5C842',
  green: '#4ADE80',
  red: '#F87171',
  orange: '#FB923C',
  blue: '#60A5FA',
  purple: '#C084FC',
  pink: '#F472B6',
  teal: '#2DD4BF',
} as const;

export const Fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayItalic: 'PlayfairDisplay_400Regular_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  bodyBlack: 'Inter_900Black',
  mono: 'JetBrainsMono_400Regular',
} as const;

export const FontSizes = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const Radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;
