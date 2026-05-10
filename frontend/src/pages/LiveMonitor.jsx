import { useState, useEffect } from "react";
import { Thermometer, Droplets, Leaf, FlaskConical, AlertTriangle, Sun } from "lucide-react";
import { useFarmStore } from "../store/farmStore";
import { api } from "../lib/api";
import { LiveChart, SingleSensorChart } from "../components/charts/LiveChart";
import { Tabs } from "../components/ui/Tabs";
import { format } from "date-fns";

const SENSORS = [
  { key: "temperature", label: "Temperature", field: "temperature_c", unit: "°C", color: "#F97316", icon: Thermometer,
    optimalMin: 18, optimalMax: 26, warnHigh: 32 },
  { key: "humidity", label: "Humidity", field: "humidity_pct", unit: "%", color: "#60A5FA", icon: Droplets,
    optimalMin: 50, optimalMax: 77, warnHigh: 85 },
  { key: "soil_moisture", label: "Soil Moisture", field: "soil_moisture_pct", unit: "%", color: "#00D68F", icon: Leaf,
    optimalMin: 20, optimalMax: 40, warnLow: 25 },
  { key: "ph", label: "pH Level", field: "ph_level", unit: "", color: "#A78BFA", icon: FlaskConical,
    optimalMin: 5.5, optimalMax: 7.4 },
  { key: "light", label: "Light %", field: "light_pct", unit: "%", color: "#F59E0B", icon: Sun,
    optimalMin: 40, optimalMax: 80, warnLow: 25 },
];

function statusLabel(value, sensor) {
  if (value === null || value === undefined) return { label: "UNKNOWN", color: "#8B9CC3" };
  if (sensor.warnHigh && value > sensor.warnHigh) return { label: "WARNING", color: "var(--warn)" };
  if (sensor.warnLow && value < sensor.warnLow) return { label: "WARNING", color: "var(--warn)" };
  if (value < sensor.optimalMin || value > sensor.optimalMax) return { label: "BORDERLINE", color: "var(--warn)" };
  return { label: "OPTIMAL", color: "var(--primary)" };
}

function StatBox({ label, value, unit }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-xs mb-1" style={{ color: "#4B5A7A" }}>{label}</p>
      <p className="font-bold tabular" style={{ color: "#F1F5F9" }}>{value}{unit}</p>
    </div>
  );
}

function SensorDetail({ sensor, farmId }) {
  const buffer = useFarmStore((s) => s.historyBuffer);
  const latest = useFarmStore((s) => s.latest);
  const [stats, setStats] = useState(null);
  const [hours, setHours] = useState(24);

  const currentVal = latest?.[sensor.field];
  const { label: statusLbl, color: statusColor } = statusLabel(currentVal, sensor);

  // Linear regression for predictive alert
  let trend = null;
  if (buffer.length >= 6) {
    const recent = buffer.slice(-6);
    const vals = recent.map((r) => r[sensor.field] || 0);
    const n = vals.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = vals.reduce((a, b) => a + b, 0);
    const sumXY = vals.reduce((a, v, i) => a + i * v, 0);
    const sumX2 = vals.reduce((a, _, i) => a + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    trend = slope;
  }

  useEffect(() => {
    api.sensors.stats(hours, farmId).then(setStats).catch(() => {});
  }, [hours, farmId]);

  const sensorStats = stats?.[sensor.key === "ph" ? "ph" : sensor.key === "soil_moisture" ? "soil_moisture" : sensor.key];

  let predictiveMsg = null;
  if (trend !== null && currentVal !== undefined) {
    if (sensor.warnHigh && trend > 0.05) {
      const stepsToThresh = (sensor.warnHigh - currentVal) / (trend);
      const minsToThresh = stepsToThresh * 0.5;
      if (minsToThresh < 60 && minsToThresh > 0) {
        predictiveMsg = `Trending upward +${(trend * 2).toFixed(2)}${sensor.unit}/min. Projected to reach warning threshold in ~${Math.round(minsToThresh)} min.`;
      }
    }
    if (sensor.warnLow && trend < -0.05) {
      const stepsToThresh = (currentVal - sensor.warnLow) / Math.abs(trend);
      const minsToThresh = stepsToThresh * 0.5;
      if (minsToThresh < 60 && minsToThresh > 0) {
        predictiveMsg = `Trending downward ${(trend * 2).toFixed(2)}${sensor.unit}/min. Projected to reach warning threshold in ~${Math.round(minsToThresh)} min.`;
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero value */}
      <div className="card flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#4B5A7A" }}>{sensor.label}</p>
          <p className="tabular font-bold" style={{ fontSize: 52, color: "#F1F5F9", lineHeight: 1 }}>
            {currentVal?.toFixed(sensor.key === "ph" ? 2 : 1) ?? "—"}
            <span className="text-xl font-normal ml-1" style={{ color: "#8B9CC3" }}>{sensor.unit}</span>
          </p>
          {trend !== null && (
            <p className="text-xs mt-2" style={{ color: "#8B9CC3" }}>
              {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend * 2).toFixed(2)}{sensor.unit}/min
            </p>
          )}
        </div>
        <span
          className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: `${statusColor}20`, color: statusColor }}
        >
          ● {statusLbl}
        </span>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {[1, 6, 24, 168].map((h) => (
          <button
            key={h}
            onClick={() => setHours(h)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: hours === h ? "var(--primary)" : "var(--bg-elevated)",
              color: hours === h ? "#0B0E1A" : "#8B9CC3",
              border: "1px solid var(--border)",
            }}
          >
            {h === 1 ? "1H" : h === 6 ? "6H" : h === 24 ? "24H" : "7D"}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <SingleSensorChart
          buffer={buffer}
          sensor={sensor.key}
          color={sensor.color}
          height={280}
          optimalMin={sensor.optimalMin}
          optimalMax={sensor.optimalMax}
        />
        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: "#4B5A7A" }}>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block rounded" style={{ background: sensor.color }} />
            {sensor.label}
          </span>
          <span>Optimal: {sensor.optimalMin}–{sensor.optimalMax}{sensor.unit}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatBox label="Min" value={sensorStats?.min ?? "—"} unit={sensor.unit} />
        <StatBox label="Max" value={sensorStats?.max ?? "—"} unit={sensor.unit} />
        <StatBox label="Average" value={sensorStats?.avg ?? "—"} unit={sensor.unit} />
        <StatBox label="Readings" value={stats?.readings_count ?? "—"} unit="" />
      </div>

      {/* Optimal range ref */}
      <div className="card" style={{ borderLeft: `3px solid ${sensor.color}` }}>
        <p className="text-xs font-semibold mb-1" style={{ color: "#8B9CC3" }}>Optimal Range Reference</p>
        <div className="flex items-center gap-4 text-sm">
          <span style={{ color: "#F1F5F9" }}>Optimal: <strong>{sensor.optimalMin}–{sensor.optimalMax}{sensor.unit}</strong></span>
          {currentVal !== undefined && (
            <span style={{ color: statusColor }}>
              {currentVal.toFixed(2)}{sensor.unit} — {statusLbl}
            </span>
          )}
        </div>
      </div>

      {/* Predictive alert */}
      {predictiveMsg && (
        <div
          className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
        >
          <AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--warn)" }}>⚡ Trend Alert</p>
            <p className="text-sm" style={{ color: "#F1F5F9" }}>{predictiveMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Overview() {
  const buffer = useFarmStore((s) => s.historyBuffer);
  const latest = useFarmStore((s) => s.latest);

  return (
    <div className="space-y-5">
      {/* Live Sensor Feed chart — moved from Dashboard */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Live Sensor Feed</h3>
        <LiveChart buffer={buffer} height={260} />
      </div>

      {/* 4-quadrant mini charts (first 4 sensors only) */}
      <div className="grid grid-cols-2 gap-4">
        {SENSORS.slice(0, 4).map((s) => {
          const val = latest?.[s.field];
          const { label: stLbl, color: stColor } = statusLabel(val, s);
          return (
            <div key={s.key} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <s.icon size={16} style={{ color: s.color }} />
                  <span className="font-medium text-sm" style={{ color: "#F1F5F9" }}>{s.label}</span>
                </div>
                <span className="tabular font-bold" style={{ color: s.color }}>
                  {val?.toFixed(s.key === "ph" ? 2 : 1) ?? "—"}{s.unit}
                </span>
              </div>
              <SingleSensorChart buffer={buffer} sensor={s.key} color={s.color} height={150} />
              <div className="mt-2 text-xs flex justify-between" style={{ color: "#4B5A7A" }}>
                <span>Optimal: {s.optimalMin}–{s.optimalMax}{s.unit}</span>
                <span style={{ color: stColor }}>● {stLbl}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Raw data table */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Raw Sensor Data</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Timestamp", "Temp °C", "Humidity %", "Soil Moisture %", "pH", "Light %", "Health Score"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 text-xs font-semibold" style={{ color: "#4B5A7A" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...buffer].reverse().slice(0, 20).map((r, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid var(--border)" }}
                  className="hover:bg-bg-elevated transition-colors"
                >
                  <td className="py-2 pr-4 tabular" style={{ color: "#8B9CC3" }}>
                    {r.timestamp ? format(new Date(r.timestamp), "HH:mm:ss") : "—"}
                  </td>
                  <td className="py-2 pr-4 tabular" style={{ color: "#F97316" }}>{r.temperature_c?.toFixed(1)}</td>
                  <td className="py-2 pr-4 tabular" style={{ color: "#60A5FA" }}>{r.humidity_pct?.toFixed(1)}</td>
                  <td className="py-2 pr-4 tabular" style={{ color: "#00D68F" }}>{r.soil_moisture_pct?.toFixed(1)}</td>
                  <td className="py-2 pr-4 tabular" style={{ color: "#A78BFA" }}>{r.ph_level?.toFixed(2)}</td>
                  <td className="py-2 pr-4 tabular" style={{ color: "#F59E0B" }}>{r.light_pct?.toFixed(1) ?? "—"}</td>
                  <td className="py-2 pr-4 tabular" style={{ color: "#F1F5F9" }}>{r.health_score?.toFixed(0) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {buffer.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: "#4B5A7A" }}>No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LiveMonitor() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const TABS = [
    { key: "overview", label: "Overview" },
    ...SENSORS.map((s) => ({ key: s.key, label: s.label })),
  ];

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: "#F1F5F9" }}>Live Monitor</h1>
      <Tabs tabs={TABS}>
        {(active) => active === "overview"
          ? <Overview />
          : <SensorDetail sensor={SENSORS.find((s) => s.key === active)} farmId={selectedFarmId} />
        }
      </Tabs>
    </div>
  );
}
