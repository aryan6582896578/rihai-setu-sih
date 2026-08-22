export interface Series {
  label: string;
  color: string;
  points: number[];
  dashed?: boolean;
}

export default function LineChart({
  series,
  height = 220,
  yLabel,
}: {
  series: Series[];
  height?: number;
  yLabel?: string;
}) {
  const width = 720;
  const padL = 42;
  const padR = 12;
  const padT = 14;
  const padB = 26;

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const maxLen = Math.max(...series.map((s) => s.points.length));
  const maxY = Math.max(...all) * 1.08 || 1;
  const minY = Math.max(0, Math.min(...all) * 0.92);

  const x = (i: number) => padL + (i / Math.max(1, maxLen - 1)) * (width - padL - padR);
  const y = (v: number) => padT + (1 - (v - minY) / (maxY - minY || 1)) * (height - padT - padB);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => minY + f * (maxY - minY));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={4} y={y(g) + 3} fontSize="10" fill="#94a3b8">
            {Math.round(g)}
          </text>
        </g>
      ))}
      {yLabel && (
        <text x={4} y={padT - 2} fontSize="9" fill="#94a3b8">
          {yLabel}
        </text>
      )}
      {series.map((s) => {
        const pts = s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        return s.dashed ? (
          <polyline
            key={s.label}
            points={pts}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray="6 4"
          />
        ) : (
          <polyline key={s.label} points={pts} fill="none" stroke={s.color} strokeWidth="2.5" />
        );
      })}
      <g>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(${padL + i * 190}, ${height - 6})`}>
            <rect width="14" height="3" y="-4" fill={s.color} rx="1" />
            <text x="20" fontSize="11" fill="#475569">
              {s.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
