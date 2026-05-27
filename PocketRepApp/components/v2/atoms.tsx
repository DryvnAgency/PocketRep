import { View, Text, Image, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { colors } from '@/constants/theme';

export function Label({
  children,
  color = colors.gold,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.label, { color }, style]}>{children}</Text>;
}

export function Pill({
  children,
  color = colors.gold,
  bg,
  border,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
  border?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: bg ?? rgbaTint(color, 0.10),
          borderColor: border ?? rgbaTint(color, 0.25),
        },
        style,
      ]}
    >
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

export function HeatStripe({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.heatStripe, { backgroundColor: color }, style]} />;
}

export function Avatar({
  name,
  size = 36,
  bg,
  photoUrl,
}: {
  name: string;
  size?: number;
  bg?: string;
  photoUrl?: string | null;
}) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors.goldBorder,
        } as any}
      />
    );
  }
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg ?? colors.goldBg,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

export function StatNumber({
  value,
  color = colors.white,
  size = 28,
  prefix,
  suffix,
}: {
  value: string | number;
  color?: string;
  size?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <View style={styles.statRow}>
      {prefix ? (
        <Text style={{ fontSize: size * 0.7, opacity: 0.75, color, fontWeight: '800' }}>
          {prefix}
        </Text>
      ) : null}
      <Text
        style={{
          fontSize: size,
          fontWeight: '800',
          color,
          letterSpacing: -0.8,
          lineHeight: size,
        }}
      >
        {value}
      </Text>
      {suffix ? (
        <Text
          style={{
            fontSize: size * 0.55,
            opacity: 0.6,
            color,
            fontWeight: '800',
            marginLeft: 2,
          }}
        >
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

export function SectionHead({
  label,
  count,
  color = colors.gold,
  icon,
}: {
  label: string;
  count?: number;
  color?: string;
  icon?: string;
}) {
  return (
    <View style={styles.sectionHead}>
      {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
      <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
      {count !== undefined ? (
        <View
          style={[
            styles.sectionCount,
            { backgroundColor: rgbaTint(color, 0.10), borderColor: rgbaTint(color, 0.25) },
          ]}
        >
          <Text style={[styles.sectionCountText, { color }]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Quick tint helper since RN doesn't support CSS color-mix(). Hex `#rrggbb`
// → `rgba(r, g, b, a)`. Falls back to the input string if it isn't 6-digit hex
// (lets us pass rgba() through unchanged).
export function rgbaTint(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heatStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  avatarText: {
    color: colors.gold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionIcon: {
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionCount: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionCountText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
