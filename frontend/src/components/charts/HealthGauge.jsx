/**
 * SVG circular gauge for Farm Health Score (0–100).
 */
export function HealthGauge({ score = 0, subScores = {} }) {
  const r = 70;
  const cx = 90;
  const cy = 90;
  const sweep = 270; // degrees
  const startAngle = 135;
  const circumference = 2 * Math.PI * r;
  const arc = (circumference * sweep) / 360;

  const clampedScore = Math.max(0, Math.min(100, score));
  const fillArc = (clampedScore / 100) * arc;

  const color = clampedScore >= 70 ? "var(--primary)" : clampedScore >= 50 ? "var(--warn)" : "var(--danger)";
  const status = clampedScore >= 70 ? "GOOD" : clampedScore >= 50 ? "AT RISK" : "CRITICAL";

  function polarToXY(angle, radius) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function describeArc(startDeg, endDeg) {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const endAngle = startAngle + sweep;
  const fillEnd = startAngle + (sweep * clampedScore) / 100;

  const subEntries = [
    { label: "Temperature", key: "temperature", color: "#F97316" },
    { label: "Humidity",    key: "humidity",    color: "#60A5FA" },
    { label: "Soil Moist.", key: "soil_moisture",color: "#00D68F" },
    { label: "pH Level",    key: "ph",          color: "#A78BFA" },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={180}>
        {/* Track */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={describeArc(startAngle, Math.max(startAngle + 0.5, fillEnd))}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
        {/* Center score */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={36} fontWeight={700} fill="#F1F5F9" fontFamily="Inter">
          {Math.round(clampedScore)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#8B9CC3" fontFamily="Inter">
          /100
        </text>
        <text x={cx} y={cy + 32} textAnchor="middle" fontSize={12} fontWeight={600} fill={color} fontFamily="Inter">
          {status}
        </text>
      </svg>

      {/* Sub-scores */}
      <div className="w-full mt-2 space-y-2">
        {subEntries.map(({ label, key, color: c }) => {
          const val = subScores[key] ?? 0;
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1" style={{ color: "#8B9CC3" }}>
                <span>{label}</span>
                <span className="tabular" style={{ color: c }}>{Math.round(val)}%</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "var(--bg-elevated)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${val}%`, background: c }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs mt-3 text-center" style={{ color: "#4B5A7A" }}>
        Calculated by AI · Updated live
      </p>
    </div>
  );
}
