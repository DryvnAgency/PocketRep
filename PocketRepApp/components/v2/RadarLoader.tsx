import { useEffect, useRef } from 'react';
import { View, Animated, Easing, Platform } from 'react-native';
import { colors } from '@/constants/theme';
import { rgbaTint } from './atoms';

// Radar-sweep loader — concentric rings with a rotating gold beam. Matches the
// app's radar brand language and replaces the generic spinner so a load reads as
// "Rex is scanning" instead of a blank circle. Pure Views + Animated, so it runs
// on web and native.
export default function RadarLoader({
  size = 32,
  color = colors.gold,
}: {
  size?: number;
  color?: string;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const Ring = ({ scale, opacity }: { scale: number; opacity: number }) => {
    const d = size * scale;
    return (
      <View
        style={{
          position: 'absolute',
          width: d,
          height: d,
          borderRadius: d / 2,
          top: (size - d) / 2,
          left: (size - d) / 2,
          borderWidth: 1,
          borderColor: color,
          opacity,
        }}
      />
    );
  };

  const wedgeBase = size * 0.52;

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Ring scale={1} opacity={0.45} />
      <Ring scale={0.64} opacity={0.3} />
      <Ring scale={0.28} opacity={0.22} />

      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          transform: [{ rotate }],
        }}
      >
        {/* translucent sweep sector (wide at the rim, narrowing to the hub) */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: (size - wedgeBase) / 2,
            width: 0,
            height: 0,
            borderLeftWidth: wedgeBase / 2,
            borderRightWidth: wedgeBase / 2,
            borderBottomWidth: size / 2,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: rgbaTint(color, 0.22),
          }}
        />
        {/* crisp leading beam line from hub to rim */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: size / 2 - 1,
            width: 2,
            height: size / 2,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      </Animated.View>

      {/* center hub */}
      <View
        style={{
          position: 'absolute',
          top: size / 2 - 2,
          left: size / 2 - 2,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
