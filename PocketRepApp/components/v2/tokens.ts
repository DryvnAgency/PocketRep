import { colors } from '@/constants/theme';

export const TIERS = {
  hot: { color: colors.red, label: 'HOT', icon: '🔥' },
  warm: { color: colors.orange, label: 'WARM', icon: '☀️' },
  watch: { color: colors.grey2, label: 'WATCH', icon: '👁' },
} as const;

export type TierKey = keyof typeof TIERS;

export function stalenessColor(days: number): string {
  if (days > 7) return colors.red;
  if (days > 3) return colors.orange;
  return colors.green;
}

export const fonts = {
  regular: 'System',
  mono: 'Menlo',
} as const;
