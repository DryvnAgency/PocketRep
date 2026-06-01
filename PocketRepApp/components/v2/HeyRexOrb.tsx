import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '@/constants/theme';

export type OrbState = 'idle' | 'listening' | 'processing' | 'saved';

export default function HeyRexOrb({
  state = 'idle',
  onPress,
}: {
  state?: OrbState;
  onPress?: () => void;
}) {
  // Listening: two concentric rings scale-up + fade-out, offset by 0.5s.
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  // Processing: full-rotation indicator.
  const spin = useRef(new Animated.Value(0)).current;
  // Saved: one-shot bloom (scale + fade).
  const bloom = useRef(new Animated.Value(0)).current;
  // Resting orb scale (listening boosts to 1.08).
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    wave1.stopAnimation();
    wave2.stopAnimation();
    spin.stopAnimation();
    bloom.stopAnimation();
    Animated.timing(scale, {
      toValue: state === 'listening' ? 1.08 : 1,
      duration: 200,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    if (state === 'listening') {
      const loop = (v: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(v, {
              toValue: 1,
              duration: 1400,
              easing: Easing.out(Easing.ease),
              useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          ]),
        );
      loop(wave1, 0).start();
      loop(wave2, 500).start();
    }
    if (state === 'processing') {
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 1100,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ).start();
    }
    if (state === 'saved') {
      bloom.setValue(0);
      Animated.timing(bloom, {
        toValue: 1,
        duration: 700,
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
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.6] }) }],
        },
      ]}
    />
  );

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      {state === 'listening' ? (
        <>
          {renderWave(wave1)}
          {renderWave(wave2)}
        </>
      ) : null}

      {state === 'processing' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.spinner,
            {
              transform: [
                { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              ],
            },
          ]}
        >
          <Svg width={68} height={68} viewBox="0 0 68 68">
            <Defs>
              <RadialGradient id="ring" cx="50%" cy="50%" r="50%">
                <Stop offset="60%" stopColor={colors.gold} stopOpacity={0} />
                <Stop offset="100%" stopColor={colors.gold} stopOpacity={1} />
              </RadialGradient>
            </Defs>
            <Path
              d="M34 4 A30 30 0 0 1 64 34"
              stroke={colors.gold}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      ) : null}

      {state === 'saved' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bloom,
            {
              opacity: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
            },
          ]}
        />
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          state === 'listening' ? 'Rex, listening'
          : state === 'processing' ? 'Rex, thinking'
          : 'Open Rex coach'
        }
      >
        <Animated.View style={[styles.orbShadow, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={[colors.gold2, colors.gold, '#9a7530']}
            start={{ x: 0.35, y: 0.3 }}
            end={{ x: 1, y: 1 }}
            style={styles.orb}
          >
            <View style={styles.highlight} />
            <Text style={styles.r}>R</Text>
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

const ORB = 56;

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    top: -28,
    left: '50%',
    marginLeft: -ORB / 2,
    width: ORB,
    height: ORB,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  wave: {
    position: 'absolute',
    width: ORB + 16,
    height: ORB + 16,
    borderRadius: (ORB + 16) / 2,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  spinner: {
    position: 'absolute',
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloom: {
    position: 'absolute',
    width: ORB + 20,
    height: ORB + 20,
    borderRadius: (ORB + 20) / 2,
    backgroundColor: colors.gold,
  },
  orbShadow: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    shadowColor: colors.gold,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
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
    top: 10,
    left: 12,
    width: 14,
    height: 10,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.55)',
    opacity: 0.7,
  },
  r: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(20,15,5,0.7)',
    letterSpacing: -0.5,
  },
  toast: {
    position: 'absolute',
    top: -34,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.ink3,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 999,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gold,
    letterSpacing: -0.1,
  },
});
