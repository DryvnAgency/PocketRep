import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '@/constants/theme';

export type OrbState = 'idle' | 'listening' | 'processing' | 'saved';

export default function HeyRexOrb({
  state = 'idle',
  onPress,
}: {
  state?: OrbState;
  onPress?: () => void;
}) {
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    wave1.stopAnimation();
    wave2.stopAnimation();
    spin.stopAnimation();
    bloom.stopAnimation();
    Animated.timing(scale, {
      toValue: state === 'listening' ? 1.05 : 1,
      duration: 180,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    if (state === 'listening') {
      const loop = (v: Animated.Value, delay: number) => Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      );
      loop(wave1, 0).start();
      loop(wave2, 450).start();
    }
    if (state === 'processing') {
      Animated.loop(Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })).start();
    }
    if (state === 'saved') {
      bloom.setValue(0);
      Animated.timing(bloom, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [state, wave1, wave2, spin, bloom, scale]);

  const renderWave = (v: Animated.Value) => (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wave,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] }) }],
        },
      ]}
    />
  );

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      {state === 'listening' ? <>{renderWave(wave1)}{renderWave(wave2)}</> : null}

      {state === 'processing' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.spinner, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
        >
          <Svg width={58} height={58} viewBox="0 0 58 58">
            <Defs>
              <RadialGradient id="ring" cx="50%" cy="50%" r="50%">
                <Stop offset="60%" stopColor={colors.gold} stopOpacity={0} />
                <Stop offset="100%" stopColor={colors.gold} stopOpacity={1} />
              </RadialGradient>
            </Defs>
            <Path d="M29 4 A25 25 0 0 1 54 29" stroke={colors.gold} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      ) : null}

      {state === 'saved' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bloom,
            {
              opacity: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
              transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
            },
          ]}
        />
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={state === 'listening' ? 'Rex, listening' : state === 'processing' ? 'Rex, thinking' : 'Rex, online and ready'}
        hitSlop={4}
        style={({ pressed }) => pressed ? styles.pressed : undefined}
      >
        <Animated.View style={[styles.orbShadow, { transform: [{ scale }] }]}>
          <LinearGradient colors={[colors.gold2, colors.gold, '#9a7530']} start={{ x: 0.35, y: 0.3 }} end={{ x: 1, y: 1 }} style={styles.orb}>
            <View style={styles.highlight} />
            <Text style={styles.r}>R</Text>
            {state === 'idle' ? <View style={styles.onlineDot} /> : null}
          </LinearGradient>
        </Animated.View>
      </Pressable>

      {state === 'saved' ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>✓ Saved</Text>
        </View>
      ) : null}
    </View>
  );
}

const ORB = 50;

const styles = StyleSheet.create({
  anchor: {
    width: 64,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  onlineDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
    borderWidth: 1.5,
    borderColor: colors.gold2,
  },
  wave: {
    position: 'absolute',
    width: ORB + 10,
    height: ORB + 10,
    borderRadius: (ORB + 10) / 2,
    borderWidth: 1.2,
    borderColor: colors.gold,
  },
  spinner: {
    position: 'absolute',
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloom: {
    position: 'absolute',
    width: ORB + 12,
    height: ORB + 12,
    borderRadius: (ORB + 12) / 2,
    backgroundColor: colors.gold,
  },
  orbShadow: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    shadowColor: colors.gold,
    shadowOpacity: 0.26,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.gold2,
  },
  highlight: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 12,
    height: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
    opacity: 0.62,
  },
  r: {
    fontSize: 17,
    fontWeight: '900',
    color: 'rgba(20,15,5,0.72)',
    letterSpacing: -0.4,
  },
  toast: {
    position: 'absolute',
    bottom: 56,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.ink3,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: 999,
  },
  toastText: { fontSize: 11, fontWeight: '700', color: colors.gold },
});
