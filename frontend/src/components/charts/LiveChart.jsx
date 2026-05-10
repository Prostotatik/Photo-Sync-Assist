/**
 * uPlot-based real-time multi-sensor chart.
 * Receives a historyBuffer array from Zustand; appends new points without re-mounting.
 */
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

const SERIES_CONFIG = [
  { label: "Temperature °C", stroke: "#F97316", width: 2 },
  { label: "Humidity %",     stroke: "#60A5FA", width: 2 },
  { label: "Soil Moisture %",stroke: "#00D68F", width: 2 },
  { label: "pH Level",       stroke: "#A78BFA", width: 2 },
  { label: "Light %",        stroke: "#F59E0B", width: 2 },
];

function buildData(buffer) {
  const ts   = buffer.map((r) => new Date(r.timestamp).getTime() / 1000);
  const temp = buffer.map((r) => r.temperature_c);
  const hum  = buffer.map((r) => r.humidity_pct);
  const sm   = buffer.map((r) => r.soil_moisture_pct);
  const ph   = buffer.map((r) => r.ph_level);
  const lgt  = buffer.map((r) => r.light_pct ?? null);
  return [ts, temp, hum, sm, ph, lgt];
}

export function LiveChart({ buffer, height = 280 }) {
  const containerRef = useRef(null);
  const plotRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || buffer.length < 2) return;

    const data = buildData(buffer);

    if (plotRef.current) {
      plotRef.current.setData(data);
      return;
    }

    const w = containerRef.current.clientWidth || 600;
    const opts = {
      width: w,
      height,
      class: "agro-uplot",
      cursor: { show: true },
      legend: { show: false },
      axes: [
        {
          stroke: "#4B5A7A",
          grid: { stroke: "#252A3D", width: 1 },
          ticks: { stroke: "#252A3D" },
        },
        {
          stroke: "#4B5A7A",
          grid: { stroke: "#252A3D", width: 1 },
          ticks: { stroke: "#252A3D" },
          label: "% / °C",
          labelFont: "11px Inter",
          font: "11px Inter",
        },
      ],
      series: [
        {},
        ...SERIES_CONFIG.map((s) => ({
          label: s.label,
          stroke: s.stroke,
          width: s.width,
          points: { show: false },
          spanGaps: true,
        })),
      ],
      scales: {
        x: { time: true },
        y: { range: [0, 100] },
      },
    };

    plotRef.current = new uPlot(opts, data, containerRef.current);

    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [buffer]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (plotRef.current && containerRef.current) {
        plotRef.current.setSize({ width: containerRef.current.clientWidth, height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  return (
    <div>
      {/* Legend */}
      <div className="flex gap-4 mb-3 flex-wrap">
        {SERIES_CONFIG.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs" style={{ color: "#8B9CC3" }}>
            <span className="w-3 h-0.5 inline-block rounded" style={{ background: s.stroke }} />
            {s.label}
          </div>
        ))}
      </div>
      <div ref={containerRef} style={{ width: "100%" }} />
      {buffer.length < 2 && (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: "#4B5A7A" }}>
          Waiting for sensor data...
        </div>
      )}
    </div>
  );
}

// Single-sensor chart for Live Monitor tabs
export function SingleSensorChart({ buffer, sensor, color, height = 300, optimalMin, optimalMax }) {
  const containerRef = useRef(null);
  const plotRef = useRef(null);

  const SENSOR_KEY = {
    temperature:   "temperature_c",
    humidity:      "humidity_pct",
    soil_moisture: "soil_moisture_pct",
    ph:            "ph_level",
    light:         "light_pct",
  };
  const key = SENSOR_KEY[sensor] || sensor;

  useEffect(() => {
    if (!containerRef.current || buffer.length < 2) return;
    const ts   = buffer.map((r) => new Date(r.timestamp).getTime() / 1000);
    const vals = buffer.map((r) => r[key] ?? null);
    const data = [ts, vals];
    const w = containerRef.current.clientWidth || 600;

    if (plotRef.current) {
      plotRef.current.setData(data);
      return;
    }

    const series = [{}, { label: sensor, stroke: color, width: 2, points: { show: false }, spanGaps: true }];

    const opts = {
      width: w, height,
      axes: [
        { stroke: "#4B5A7A", grid: { stroke: "#252A3D" }, ticks: { stroke: "#252A3D" } },
        { stroke: "#4B5A7A", grid: { stroke: "#252A3D" }, ticks: { stroke: "#252A3D" }, font: "11px Inter" },
      ],
      series,
      cursor: { show: true },
      legend: { show: false },
    };

    plotRef.current = new uPlot(opts, data, containerRef.current);
    return () => { plotRef.current?.destroy(); plotRef.current = null; };
  }, []);

  useEffect(() => {
    if (plotRef.current && buffer.length >= 2) {
      const ts   = buffer.map((r) => new Date(r.timestamp).getTime() / 1000);
      const vals = buffer.map((r) => r[key] ?? null);
      plotRef.current.setData([ts, vals]);
    }
  }, [buffer]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (plotRef.current && containerRef.current)
        plotRef.current.setSize({ width: containerRef.current.clientWidth, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  return <div ref={containerRef} style={{ width: "100%" }} />;
}
