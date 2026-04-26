import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

export interface LineChartPoint {
  x: number;       // ordinal index or timestamp, not drawn — used for spacing
  y: number;       // the value
  label?: string;  // optional x-axis label (e.g. date)
}

interface LineChartProps {
  data: LineChartPoint[];
  width: number;
  height: number;
  color?: string;         // line + point color
  fillGradient?: boolean; // subtle area fill below line
  formatY?: (v: number) => string;
  /** True when lower Y values are better (e.g. run times). Flips the visual trend color. */
  lowerIsBetter?: boolean;
  /** Optional dashed overlay line (e.g. rolling-average trend). Y values share the
   *  same axis as `data` — included in min/max range computation. */
  trendOverlay?: LineChartPoint[];
  /** Color for the trend overlay. Defaults to a muted version of `color`. */
  trendOverlayColor?: string;
}

const PADDING_X = 28;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

/**
 * Minimal line chart — shows progression of a single metric over time.
 * No dependencies beyond react-native-svg.
 */
export function LineChart({
  data,
  width,
  height,
  color,
  fillGradient = true,
  formatY,
  lowerIsBetter = false,
  trendOverlay,
  trendOverlayColor,
}: LineChartProps) {
  const { colors } = useTheme();
  const strokeColor = color ?? colors.gold;
  const overlayStroke = trendOverlayColor ?? colors.textMuted;

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { width, height, backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No data yet</Text>
      </View>
    );
  }

  // Map indices to x-positions (evenly spaced)
  const plotWidth = width - PADDING_X * 2;
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;
  const n = data.length;
  const xStep = n > 1 ? plotWidth / (n - 1) : 0;

  // With very few points the area fill becomes a single triangular block that
  // looks like a broken rectangle, and the dashed trend overlay sitting nearly
  // on top of the solid line just adds visual noise. Hide both until we have
  // enough points to draw a meaningful trend.
  const sparse = n <= 3;
  const showFill = fillGradient && !sparse;
  const showOverlay = !sparse;

  // Find y range — include the overlay so both lines are visible.
  // Add a little padding so neither line touches edges.
  const overlayYs = (trendOverlay ?? []).map((p) => p.y);
  const ys = [...data.map((d) => d.y), ...overlayYs];
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    // Avoid div-by-zero — pad by 10%
    const pad = Math.max(1, Math.abs(minY) * 0.1);
    minY -= pad;
    maxY += pad;
  }
  const yRange = maxY - minY;

  const points = data.map((d, i) => ({
    x: PADDING_X + (n > 1 ? i * xStep : plotWidth / 2),
    y: PADDING_TOP + plotHeight - ((d.y - minY) / yRange) * plotHeight,
    value: d.y,
    label: d.label,
  }));

  // Overlay points — distributed evenly across the same plot width.
  const overlayN = trendOverlay?.length ?? 0;
  const overlayStep = overlayN > 1 ? plotWidth / (overlayN - 1) : 0;
  const overlayPoints = (trendOverlay ?? []).map((d, i) => ({
    x: PADDING_X + (overlayN > 1 ? i * overlayStep : plotWidth / 2),
    y: PADDING_TOP + plotHeight - ((d.y - minY) / yRange) * plotHeight,
  }));
  const overlayPath = overlayPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  // Build SVG path
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  // Area fill path (from line down to baseline)
  const baseline = PADDING_TOP + plotHeight;
  const fillPath = `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;

  // Trend: last point vs first
  const first = data[0].y;
  const last = data[data.length - 1].y;
  const diff = last - first;
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  const trendColor = n >= 2 ? (improved ? colors.success : colors.error) : strokeColor;

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Horizontal gridlines — quarters */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <Line
            key={frac}
            x1={PADDING_X}
            x2={width - PADDING_X}
            y1={PADDING_TOP + plotHeight * frac}
            y2={PADDING_TOP + plotHeight * frac}
            stroke={colors.borderSubtle}
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        ))}

        {/* Subtle area fill */}
        {showFill && (
          <Path d={fillPath} fill={strokeColor} fillOpacity={0.06} />
        )}

        {/* Trend overlay (dashed) — drawn before main line so points sit on top */}
        {showOverlay && overlayPoints.length > 1 && (
          <Path
            d={overlayPath}
            stroke={overlayStroke}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        )}

        {/* Line */}
        <Path
          d={linePath}
          stroke={strokeColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Point dots */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={isLast ? 5 : 3}
              fill={isLast ? trendColor : strokeColor}
              stroke={colors.background}
              strokeWidth={isLast ? 2 : 0}
            />
          );
        })}

        {/* Y-axis labels: min + max */}
        <SvgText x={6} y={PADDING_TOP + 4} fontSize={10} fill={colors.textMuted} fontWeight="600">
          {formatY ? formatY(maxY) : Math.round(maxY).toString()}
        </SvgText>
        <SvgText x={6} y={baseline} fontSize={10} fill={colors.textMuted} fontWeight="600">
          {formatY ? formatY(minY) : Math.round(minY).toString()}
        </SvgText>

        {/* X-axis labels: first + last (dates) */}
        {points[0].label && (
          <SvgText
            x={points[0].x}
            y={height - 10}
            fontSize={9}
            fill={colors.textMuted}
            textAnchor="start"
          >
            {points[0].label}
          </SvgText>
        )}
        {n > 1 && points[points.length - 1].label && (
          <SvgText
            x={points[points.length - 1].x}
            y={height - 10}
            fontSize={9}
            fill={colors.textMuted}
            textAnchor="end"
          >
            {points[points.length - 1].label}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
