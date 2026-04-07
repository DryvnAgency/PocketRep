export const colors = {
  ink: '#0c0c0e',
  ink2: '#141418',
  ink3: '#1c1c22',
  ink4: '#23232b',
  gold: '#d4a843',
  gold2: '#f0c060',
  goldBg: 'rgba(212,168,67,0.10)',
  goldBorder: 'rgba(212,168,67,0.22)',
  white: '#ffffff',
  grey: '#5a6070',
  grey2: '#8a90a0',
  grey3: '#b4bac8',
  surface: '#111116',
  surface2: '#18181f',
  red: '#e05252',
  redBg: 'rgba(224,82,82,0.12)',
  redBorder: 'rgba(224,82,82,0.25)',
  orange: '#e08c52',
  orangeBg: 'rgba(224,140,82,0.12)',
  orangeBorder: 'rgba(224,140,82,0.25)',
  green: '#42b883',
  greenBg: 'rgba(66,184,131,0.10)',
  greenBorder: 'rgba(66,184,131,0.22)',
} as const;

export const radius = {
  sm: 7,
  md: 10,
  lg: 14,
  xl: 18,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Heat tier config used across Heat Sheet + Contact cards
export const heatConfig = {
  hot: {
    label: 'HOT',
    color: colors.red,
    bg: colors.redBg,
    border: colors.redBorder,
    icon: '🔥',
  },
  warm: {
    label: 'WARM',
    color: colors.orange,
    bg: colors.orangeBg,
    border: colors.orangeBorder,
    icon: '☀️',
  },
  watch: {
    label: 'WATCH',
    color: colors.gold,
    bg: colors.goldBg,
    border: colors.goldBorder,
    icon: '👁',
  },
} as const;
