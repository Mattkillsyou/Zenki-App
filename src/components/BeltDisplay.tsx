import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BeltLevel, BELT_DISPLAY_COLORS, BELT_LABELS } from '../data/members';
import { useTheme } from '../context/ThemeContext';

interface BeltDisplayProps {
  belt: BeltLevel;
  stripes: number; // 0-4
  showLabel?: boolean;
  width?: number;
}

/**
 * Slim horizontal belt with BJJ-style stripes at the right end.
 * A real BJJ belt has a black band near the end where stripes are taped;
 * white belts have a black band and black belts have a red band.
 */
export function BeltDisplay({ belt, stripes, showLabel = true, width = 280 }: BeltDisplayProps) {
  const { colors } = useTheme();
  const beltColor = BELT_DISPLAY_COLORS[belt];
  const height = Math.round(width * 0.11); // slim belt proportions

  // N/A belt: show outlined placeholder
  if (belt === 'none') {
    return (
      <View style={[styles.wrapper, { width }]}>
        <View
          style={[
            styles.belt,
            {
              width,
              height,
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.border,
              borderWidth: 1.5,
              borderStyle: 'dashed',
            },
          ]}
        />
        {showLabel && (
          <Text style={[styles.label, { color: colors.textMuted }]}>
            No belt assigned
          </Text>
        )}
      </View>
    );
  }

  // BJJ belt convention:
  // - White/Blue/Purple/Brown belts: BLACK band near the end where stripes go
  // - Black belt: RED band near the end
  const bandColor = belt === 'black' ? '#C41E2A' : '#000000';
  const bandWidth = Math.max(44, width * 0.2);
  const stripeColor = '#FFFFFF';
  const stripeThickness = Math.max(3, Math.round(height * 0.22));
  const clampedStripes = Math.max(0, Math.min(4, stripes));

  return (
    <View style={[styles.wrapper, { width }]}>
      <View
        style={[
          styles.belt,
          {
            width,
            height,
            backgroundColor: beltColor,
            // subtle shadow for depth
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 3,
          },
        ]}
      >
        {/* Stripe band near right end */}
        <View
          style={[
            styles.band,
            {
              width: bandWidth,
              height: '100%',
              backgroundColor: bandColor,
              right: width * 0.08,
            },
          ]}
        >
          {/* Stripe marks on the band */}
          <View style={styles.stripesContainer}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={{
                  width: stripeThickness,
                  height: '70%',
                  borderRadius: 1,
                  backgroundColor: s <= clampedStripes ? stripeColor : 'transparent',
                }}
              />
            ))}
          </View>
        </View>
      </View>
      {showLabel && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {BELT_LABELS[belt]}
          {clampedStripes > 0 ? ` · ${clampedStripes} stripe${clampedStripes === 1 ? '' : 's'}` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 8,
  },
  belt: {
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  stripesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    height: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
