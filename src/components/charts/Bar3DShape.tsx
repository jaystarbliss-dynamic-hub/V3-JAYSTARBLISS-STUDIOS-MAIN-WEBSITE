import React from 'react';

interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

function parseColor(color: string | undefined): ColorRGB {
  const fallback: ColorRGB = { r: 30, g: 41, b: 59 };
  if (!color || typeof color !== 'string') return fallback;
  const trimmed = color.trim();

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return { r, g, b };
    } else if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return { r, g, b };
    }
  }

  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  return fallback;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function lightenColor(color: string | undefined, factor = 0.28): string {
  const { r, g, b } = parseColor(color);
  return `rgb(${clampByte(r + (255 - r) * factor)}, ${clampByte(g + (255 - g) * factor)}, ${clampByte(b + (255 - b) * factor)})`;
}

function darkenColor(color: string | undefined, factor = 0.32): string {
  const { r, g, b } = parseColor(color);
  return `rgb(${clampByte(r * (1 - factor))}, ${clampByte(g * (1 - factor))}, ${clampByte(b * (1 - factor))})`;
}

export interface Bar3DShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  depth?: number;
}

/**
 * Isometric 3D extruded vertical bar shape for Recharts <Bar shape={<Bar3DShape />} />.
 * Renders a crisp front face with subtle specular edge, lighter 3D top face,
 * and darker extruded right side face.
 */
export const Bar3DShape: React.FC<Bar3DShapeProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill = '#1E293B',
  depth,
}) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0.5 || Math.abs(height) <= 0.5) {
    return null;
  }

  const normalizedY = height < 0 ? y + height : y;
  const normalizedH = Math.abs(height);
  const dx = depth ?? Math.max(4, Math.min(9, width * 0.26));
  const dy = Math.round(dx * 0.62 * 10) / 10;

  const frontColor = fill;
  const topColor = lightenColor(fill, 0.36);
  const sideColor = darkenColor(fill, 0.36);
  const edgeHighlight = lightenColor(fill, 0.5);
  const rimStroke = lightenColor(fill, 0.22);

  const topPath = `M ${x},${normalizedY} L ${x + dx},${normalizedY - dy} L ${x + width + dx},${normalizedY - dy} L ${x + width},${normalizedY} Z`;
  const rightPath = `M ${x + width},${normalizedY} L ${x + width + dx},${normalizedY - dy} L ${x + width + dx},${normalizedY + normalizedH - dy} L ${x + width},${normalizedY + normalizedH} Z`;

  return (
    <g>
      {/* Front Face */}
      <rect
        x={x}
        y={normalizedY}
        width={width}
        height={normalizedH}
        fill={frontColor}
        stroke={rimStroke}
        strokeOpacity={0.35}
        strokeWidth={0.75}
      />
      {/* Subtle vertical front sheen */}
      <rect
        x={x}
        y={normalizedY}
        width={Math.max(1.5, width * 0.24)}
        height={normalizedH}
        fill="#FFFFFF"
        fillOpacity={0.12}
      />
      {/* 3D Extruded Top Face */}
      <path d={topPath} fill={topColor} />
      {/* 3D Extruded Right Side Face */}
      <path d={rightPath} fill={sideColor} />
      {/* Crisp top-front specular ridge */}
      <line
        x1={x}
        y1={normalizedY + 0.5}
        x2={x + width}
        y2={normalizedY + 0.5}
        stroke={edgeHighlight}
        strokeOpacity={0.65}
        strokeWidth={1}
      />
    </g>
  );
};

/**
 * Isometric 3D extruded horizontal bar shape for Recharts layout="vertical"
 * <Bar shape={<HorizontalBar3DShape />} />.
 */
export const HorizontalBar3DShape: React.FC<Bar3DShapeProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill = '#B91C1C',
  depth,
}) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || Math.abs(width) <= 0.5 || height <= 0.5) {
    return null;
  }

  const normalizedX = width < 0 ? x + width : x;
  const normalizedW = Math.abs(width);
  const d = depth ?? Math.max(3.5, Math.min(7, height * 0.28));
  const dy = Math.round(d * 0.65 * 10) / 10;

  const frontColor = fill;
  const topColor = lightenColor(fill, 0.36);
  const endCapColor = darkenColor(fill, 0.36);
  const edgeHighlight = lightenColor(fill, 0.5);
  const rimStroke = lightenColor(fill, 0.22);

  const topPath = `M ${normalizedX},${y} L ${normalizedX + d},${y - dy} L ${normalizedX + normalizedW + d},${y - dy} L ${normalizedX + normalizedW},${y} Z`;
  const rightCapPath = `M ${normalizedX + normalizedW},${y} L ${normalizedX + normalizedW + d},${y - dy} L ${normalizedX + normalizedW + d},${y + height - dy} L ${normalizedX + normalizedW},${y + height} Z`;

  return (
    <g>
      {/* Front Horizontal Face */}
      <rect
        x={normalizedX}
        y={y}
        width={normalizedW}
        height={height}
        fill={frontColor}
        stroke={rimStroke}
        strokeOpacity={0.35}
        strokeWidth={0.75}
      />
      {/* Subtle horizontal upper sheen */}
      <rect
        x={normalizedX}
        y={y}
        width={normalizedW}
        height={Math.max(1.5, height * 0.28)}
        fill="#FFFFFF"
        fillOpacity={0.11}
      />
      {/* 3D Extruded Top Bevel */}
      <path d={topPath} fill={topColor} />
      {/* 3D Extruded Right End-Cap */}
      <path d={rightCapPath} fill={endCapColor} />
      {/* Crisp top ridge highlight */}
      <line
        x1={normalizedX}
        y1={y + 0.5}
        x2={normalizedX + normalizedW}
        y2={y + 0.5}
        stroke={edgeHighlight}
        strokeOpacity={0.6}
        strokeWidth={1}
      />
    </g>
  );
};

export default Bar3DShape;
