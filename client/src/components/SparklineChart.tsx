import { useMemo } from "react";

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
}

export default function SparklineChart({
  data,
  width = 80,
  height = 28,
  color = "var(--g-accent)",
  showDots = false,
}: SparklineChartProps) {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return null;

    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => ({
      x: padding + (i / (data.length - 1)) * chartWidth,
      y: padding + chartHeight - ((val - min) / range) * chartHeight,
    }));

    // Smooth curve using cubic bezier
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpx1 = curr.x + (next.x - curr.x) / 3;
      const cpx2 = curr.x + (2 * (next.x - curr.x)) / 3;
      path += ` C ${cpx1} ${curr.y}, ${cpx2} ${next.y}, ${next.x} ${next.y}`;
    }

    // Area fill path
    const areaPath = `${path} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { line: path, area: areaPath, points, lastPoint: points[points.length - 1] };
  }, [data, width, height]);

  if (!pathData) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height, color: "var(--g-text-tertiary)", fontSize: 10 }}
      >
        —
      </div>
    );
  }

  const isUpward = data.length >= 2 && data[data.length - 1] >= data[0];
  const lineColor = color;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path
        d={pathData.area}
        fill={`url(#spark-grad-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      {/* Line */}
      <path
        d={pathData.line}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {showDots && pathData.lastPoint && (
        <circle
          cx={pathData.lastPoint.x}
          cy={pathData.lastPoint.y}
          r={2.5}
          fill={lineColor}
          stroke="var(--g-bg-card)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
