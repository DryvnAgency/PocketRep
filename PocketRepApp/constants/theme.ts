export const colors = {
  ink: '#0d1117',
  ink2: '#111827',
  ink3: '#1e293b',
  ink4: '#374151',
  gold: '#e94560',        // Primary Red — buttons, logo, accent
  gold2: '#e94560',       // Same primary red
  goldBg: 'rgba(233,69,96,0.10)',
  goldBorder: 'rgba(233,69,96,0.22)',
  white: '#e5e7eb',
  grey: '#6b7280',
  grey2: '#9ca3af',
  grey3: '#e5e7eb',
  surface: '#111827',
  surface2: '#0d1117',
  red: '#e94560',         // Primary Red
  redBg: 'rgba(233,69,96,0.12)',
  redBorder: 'rgba(233,69,96,0.25)',
  orange: '#e08c52',
  orangeBg: 'rgba(224,140,82,0.12)',
  orangeBorder: 'rgba(224,140,82,0.25)',
  green: '#42b883',
  greenBg: 'rgba(66,184,131,0.10)',
  greenBorder: 'rgba(66,184,131,0.22)',
  deepBlue: '#0f3460',    // Deep Blue — gradient endpoint
  errorBg: '#7f1d1d',
  errorText: '#fca5a5',
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
