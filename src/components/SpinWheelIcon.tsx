import React from 'react';
import Svg, { Circle, Path, Polygon, G } from 'react-native-svg';

/**
 * Wheel-of-fortune icon: 8-segment disc with a pointer at the top.
 * Designed for the floating daily-spin FAB on Home.
 *
 * Colors follow the convention: fill = darker (wheel body), stroke = lighter
 * (spokes + pointer). Pass `size` to control diameter.
 */
interface Props {
  size?: number;
  color?: string;         // spoke / pointer color
  background?: string;    // wheel body color
}

export function SpinWheelIcon({ size = 24, color = '#FFFFFF', background = 'rgba(0,0,0,0.2)' }: Props) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 2; // leave room for pointer
  // 8 spokes → every 45°
  const spokes = [] as string[];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4; // 0, 45, 90, ...
    const x2 = cx + Math.cos(angle) * r;
    const y2 = cy + Math.sin(angle) * r;
    spokes.push(`M ${cx} ${cy} L ${x2.toFixed(2)} ${y2.toFixed(2)}`);
  }

  // Pointer triangle at top center
  const ptrW = s * 0.12;
  const ptrH = s * 0.14;
  const pointer = [
    `${cx - ptrW / 2},${1}`,
    `${cx + ptrW / 2},${1}`,
    `${cx},${1 + ptrH}`,
  ].join(' ');

  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {/* Wheel body */}
      <Circle cx={cx} cy={cy} r={r} fill={background} stroke={color} strokeWidth={1.25} />
      {/* Spokes */}
      <G stroke={color} strokeWidth={1.25} strokeLinecap="round">
        {spokes.map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>
      {/* Hub */}
      <Circle cx={cx} cy={cy} r={1.6} fill={color} />
      {/* Pointer triangle */}
      <Polygon points={pointer} fill={color} />
    </Svg>
  );
}
