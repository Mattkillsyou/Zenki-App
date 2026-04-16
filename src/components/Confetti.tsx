import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = ['#D4A017', '#C41E2A', '#FFFFFF', '#FF6B35', '#FFD60A'];
const PARTICLE_COUNT = 40;

interface Piece {
  startX: number;
  endX: number;        // drift horizontally during fall
  size: number;
  color: string;
  startRotate: number;
  endRotate: number;
  duration: number;
  delay: number;
  shape: 'square' | 'rect';
}

function randomPiece(): Piece {
  return {
    startX: Math.random() * SCREEN_WIDTH,
    endX: (Math.random() - 0.5) * 240,
    size: 6 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    startRotate: Math.random() * 360,
    endRotate: (Math.random() - 0.5) * 1080,
    duration: 1600 + Math.random() * 1800,
    delay: Math.random() * 600,
    shape: Math.random() > 0.5 ? 'rect' : 'square',
  };
}

interface Props {
  /** When `active` transitions false→true, launches a confetti burst.
   *  Set back to false once the host consumes the animation. */
  active: boolean;
}

export function Confetti({ active }: Props) {
  // Regenerate pieces each time the burst fires so colors/positions vary
  const piecesRef = useRef<Piece[]>(
    Array.from({ length: PARTICLE_COUNT }, randomPiece),
  );
  const animsRef = useRef<Animated.Value[]>(
    Array.from({ length: PARTICLE_COUNT }, () => new Animated.Value(0)),
  );

  useEffect(() => {
    if (!active) return;
    // Reshuffle pieces on each fire
    piecesRef.current = Array.from({ length: PARTICLE_COUNT }, randomPiece);
    animsRef.current.forEach((a, i) => {
      a.setValue(0);
      Animated.timing(a, {
        toValue: 1,
        duration: piecesRef.current[i].duration,
        delay: piecesRef.current[i].delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [active]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {piecesRef.current.map((p, i) => {
        const anim = animsRef.current[i];
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-60, SCREEN_HEIGHT + 60],
        });
        const translateX = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.endX],
        });
        const rotate = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [`${p.startRotate}deg`, `${p.startRotate + p.endRotate}deg`],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.1, 0.85, 1],
          outputRange: [0, 1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                left: p.startX,
                width: p.shape === 'rect' ? p.size * 0.5 : p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  piece: {
    position: 'absolute',
    top: 0,
    borderRadius: 1,
  },
});
