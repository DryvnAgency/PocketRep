// PocketRep design tokens — Bloomberg meets luxury car interior
const T = {
  // Background hierarchy
  base: '#0c0c0e',
  ink2: '#141418',
  ink3: '#1c1c22',
  ink4: '#23232b',
  surface2: '#18181f',

  // Gold accent
  gold: '#d4a843',
  gold2: '#f0c060',
  goldBg: 'rgba(212,168,67,0.10)',
  goldBorder: 'rgba(212,168,67,0.22)',
  goldBorderStrong: 'rgba(212,168,67,0.45)',

  // Status
  red: '#e05252',
  orange: '#e08c52',
  green: '#42b883',

  // Text
  white: '#ffffff',
  grey3: '#b4bac8',
  grey2: '#8a90a0',
  ghost: '#5a6070',

  // Type
  font: '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

// Small shared atoms
function Label({ children, color, style }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1.0,
      textTransform: 'uppercase', color: color || T.gold,
      fontFamily: T.font,
      ...style,
    }}>{children}</div>
  );
}

function Pill({ children, color = T.gold, bg, border, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 7px', borderRadius: 999,
      fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
      textTransform: 'uppercase', color,
      background: bg || `color-mix(in oklab, ${color} 10%, transparent)`,
      border: `1px solid ${border || `color-mix(in oklab, ${color} 25%, transparent)`}`,
      fontFamily: T.font,
      ...style,
    }}>{children}</span>
  );
}

function HeatStripe({ color, style }) {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, bottom: 0,
      width: 3, background: color, ...style,
    }} />
  );
}

// Avatar with initials, gold bg
function Avatar({ name, size = 36, color }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: color || T.goldBg,
      border: `1px solid ${T.goldBorder}`,
      color: T.gold, fontWeight: 700, fontSize: size * 0.36,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.font, letterSpacing: 0.5, flexShrink: 0,
    }}>{initials}</div>
  );
}

// Big dashboard-style number
function StatNumber({ value, color = T.white, size = 28, prefix, suffix }) {
  return (
    <div style={{
      fontSize: size, fontWeight: 800, color,
      letterSpacing: -0.8, lineHeight: 1,
      fontFamily: T.font,
      fontVariantNumeric: 'tabular-nums',
    }}>
      {prefix && <span style={{ fontSize: size * 0.7, opacity: 0.75 }}>{prefix}</span>}
      {value}
      {suffix && <span style={{ fontSize: size * 0.55, opacity: 0.6, marginLeft: 2 }}>{suffix}</span>}
    </div>
  );
}

// Section header — ALL CAPS label with count badge
function SectionHead({ label, count, color = T.gold, icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '18px 16px 10px',
    }}>
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: 'uppercase', color,
        fontFamily: T.font,
      }}>{label}</span>
      {count !== undefined && (
        <span style={{
          fontSize: 9, fontWeight: 700, color,
          background: `color-mix(in oklab, ${color} 10%, transparent)`,
          border: `1px solid color-mix(in oklab, ${color} 25%, transparent)`,
          padding: '2px 6px', borderRadius: 999,
          fontFamily: T.font, letterSpacing: 0.5,
          fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </div>
  );
}

// Heat tier helpers
const TIERS = {
  hot:   { color: T.red,    label: 'HOT',   icon: '🔥' },
  warm:  { color: T.orange, label: 'WARM',  icon: '☀️' },
  watch: { color: T.grey2,  label: 'WATCH', icon: '👁' },
};

// Days-since-contact color
function stalenessColor(days) {
  if (days > 7) return T.red;
  if (days > 3) return T.orange;
  return T.green;
}

Object.assign(window, {
  T, Label, Pill, HeatStripe, Avatar, StatNumber, SectionHead, TIERS, stalenessColor,
});
