import { useEffect, useState } from "react";
import {
  Zap, Leaf, Sun, SkipForward, CheckCircle, Wind, Battery, CloudRain,
  ThermometerSun, ThermometerSnowflake, FlaskConical, Droplets, Droplet,
} from "lucide-react";
import { useFarmStore } from "../store/farmStore";
import { api } from "../lib/api";
import { format } from "date-fns";

// ─── Event type config ────────────────────────────────────────────────────────
const EVENT_CONFIG = {
  irrigation_triggered: {
    label: "Irrigation Triggered",
    icon: CheckCircle,
    color: "var(--primary)",
    bg: "rgba(0,214,143,0.12)",
  },
  irrigation_skipped: {
    label: "Irrigation Skipped",
    icon: SkipForward,
    color: "var(--warn)",
    bg: "rgba(245,158,11,0.12)",
  },
  light_increased: {
    label: "Lights Boosted",
    icon: Sun,
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
  },
  light_decreased: {
    label: "Lights Dimmed",
    icon: Zap,
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.12)",
  },
  ph_adjusted_up: {
    label: "pH+ Dosed",
    icon: FlaskConical,
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.12)",
  },
  ph_adjusted_down: {
    label: "pH− Dosed",
    icon: FlaskConical,
    color: "#F472B6",
    bg: "rgba(244,114,182,0.12)",
  },
  temperature_increased: {
    label: "Heating On",
    icon: ThermometerSun,
    color: "#F97316",
    bg: "rgba(249,115,22,0.12)",
  },
  temperature_decreased: {
    label: "Cooling On",
    icon: ThermometerSnowflake,
    color: "#38BDF8",
    bg: "rgba(56,189,248,0.12)",
  },
  soil_moisture_low: {
    label: "Soil Moisture Low",
    icon: Droplets,
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.12)",
  },
  soil_moisture_high: {
    label: "Soil Moisture High",
    icon: Droplets,
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.12)",
  },
  humidity_high: {
    label: "Ventilation On",
    icon: Wind,
    color: "#38BDF8",
    bg: "rgba(56,189,248,0.12)",
  },
  humidity_low: {
    label: "Humidification On",
    icon: Droplet,
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.12)",
  },
};

// ─── Environmental Impact Card ────────────────────────────────────────────────
function ImpactCard({ icon: Icon, label, value, unit, color, description }) {
  return (
    <div className="card text-center space-y-2" style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex justify-center">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4B5A7A" }}>{label}</p>
      <p className="tabular font-bold text-2xl" style={{ color: "#F1F5F9" }}>
        {value ?? "—"}
        <span className="text-sm font-normal ml-1" style={{ color: "#8B9CC3" }}>{unit}</span>
      </p>
      <p className="text-xs" style={{ color: "#4B5A7A" }}>{description}</p>
    </div>
  );
}

// ─── Event Table ──────────────────────────────────────────────────────────────
function EventTable({ events, title, types }) {
  const filtered = events.filter((e) => types.includes(e.event_type));

  return (
    <div className="card">
      <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>{title}</h3>
      {filtered.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "#4B5A7A" }}>No events recorded yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Time", "Type", "Trigger Condition", "Details"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 text-xs font-semibold" style={{ color: "#4B5A7A" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => {
                const c = EVENT_CONFIG[ev.event_type] || {};
                const Icon = c.icon || CheckCircle;
                const tv = ev.trigger_values || {};
                const details = Object.entries(tv)
                  .filter(([k]) => k !== "rule")
                  .map(([k, v]) => {
                    const label = k.replace(/_pct|_level/, "").replace(/_/g, " ");
                    const num = typeof v === "number" ? v.toFixed(1) : v;
                    return `${label}: ${num}`;
                  })
                  .join(" · ");

                return (
                  <tr key={ev.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="py-2.5 pr-4 tabular text-xs" style={{ color: "#8B9CC3" }}>
                      {format(new Date(ev.timestamp), "MMM d HH:mm")}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: c.bg, color: c.color }}
                      >
                        <Icon size={12} />
                        {c.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs" style={{ color: "#F1F5F9" }}>
                      {ev.reason || "—"}
                    </td>
                    <td className="py-2.5 text-xs tabular" style={{ color: "#8B9CC3" }}>
                      {details || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Automation() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const [impact, setImpact] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const load = () => {
      api.automation.getEnvironmentalImpact(selectedFarmId).then(setImpact).catch(() => {});
      api.automation.getEvents(selectedFarmId).then(setEvents).catch(() => {});
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [selectedFarmId]);

  const soilEvents = events.filter((e) =>
    ["soil_moisture_low", "soil_moisture_high"].includes(e.event_type)
  );
  const irrigationEvents = events.filter((e) =>
    ["irrigation_triggered", "irrigation_skipped"].includes(e.event_type)
  );
  const lightEvents = events.filter((e) =>
    ["light_increased", "light_decreased"].includes(e.event_type)
  );
  const phEvents = events.filter((e) =>
    ["ph_adjusted_up", "ph_adjusted_down"].includes(e.event_type)
  );
  const humidityEvents = events.filter((e) =>
    ["humidity_high", "humidity_low"].includes(e.event_type)
  );
  const tempEvents = events.filter((e) =>
    ["temperature_increased", "temperature_decreased"].includes(e.event_type)
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: "#F1F5F9" }}>Automation</h1>

      {/* ── Environmental Impact ───────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          Environmental Impact
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <ImpactCard
            icon={CloudRain}
            label="Water Used"
            value={impact?.total_water_liters?.toFixed(1)}
            unit="L"
            color="#60A5FA"
            description="Total irrigation delivered"
          />
          <ImpactCard
            icon={Leaf}
            label="Water Saved"
            value={impact?.water_saved_liters?.toFixed(1)}
            unit="L"
            color="var(--primary)"
            description="Prevented by smart skip logic"
          />
          <ImpactCard
            icon={Battery}
            label="Energy Saved"
            value={impact?.energy_saved_kwh?.toFixed(2)}
            unit="kWh"
            color="#F59E0B"
            description="Estimated from light adjustments"
          />
          <ImpactCard
            icon={Wind}
            label="CO₂ Saved"
            value={impact?.co2_saved_kg?.toFixed(3)}
            unit="kg"
            color="var(--primary)"
            description="Carbon footprint reduction"
          />
        </div>

        {impact && (
          <div className="mt-3 px-4 py-3 rounded-xl text-sm" style={{ background: "var(--bg-elevated)", color: "#8B9CC3" }}>
            Smart automation has prevented{" "}
            <span style={{ color: "var(--primary)", fontWeight: 600 }}>
              {impact.irrigation_skipped_count} unnecessary irrigation event{impact.irrigation_skipped_count !== 1 ? "s" : ""}
            </span>
            , saving an estimated{" "}
            <span style={{ color: "#60A5FA", fontWeight: 600 }}>
              {impact.water_saved_liters.toFixed(1)} L
            </span>{" "}
            of water. Light adjustments have been logged{" "}
            <span style={{ color: "#F59E0B", fontWeight: 600 }}>
              {impact.light_events_count} time{impact.light_events_count !== 1 ? "s" : ""}
            </span>
            , saving approximately{" "}
            <span style={{ color: "#F59E0B", fontWeight: 600 }}>
              {impact.energy_saved_kwh.toFixed(2)} kWh
            </span>{" "}
            of energy.
          </div>
        )}
      </div>

      {/* ── Soil Moisture Reports ─────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          Soil Moisture Reports
          <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#4B5A7A" }}>
            · {soilEvents.length} event{soilEvents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <EventTable
          events={events}
          title="Soil Moisture Activity"
          types={["soil_moisture_low", "soil_moisture_high"]}
        />
      </div>

      {/* ── Irrigation Reports ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          Irrigation Reports
          <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#4B5A7A" }}>
            · {irrigationEvents.length} event{irrigationEvents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <EventTable
          events={events}
          title="Irrigation Activity"
          types={["irrigation_triggered", "irrigation_skipped"]}
        />
      </div>

      {/* ── Light Control Reports ──────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          Light Control Reports
          <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#4B5A7A" }}>
            · {lightEvents.length} event{lightEvents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <EventTable
          events={events}
          title="Light Adjustment Activity"
          types={["light_increased", "light_decreased"]}
        />
      </div>

      {/* ── pH Control Reports ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          pH Control Reports
          <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#4B5A7A" }}>
            · {phEvents.length} event{phEvents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <EventTable
          events={events}
          title="pH Adjustment Activity"
          types={["ph_adjusted_up", "ph_adjusted_down"]}
        />
      </div>

      {/* ── Temperature Control Reports ────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          Temperature Control Reports
          <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#4B5A7A" }}>
            · {tempEvents.length} event{tempEvents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <EventTable
          events={events}
          title="Temperature Adjustment Activity"
          types={["temperature_increased", "temperature_decreased"]}
        />
      </div>

      {/* ── Humidity Control Reports ───────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#4B5A7A" }}>
          Humidity Control Reports
          <span className="ml-2 text-xs font-normal normal-case" style={{ color: "#4B5A7A" }}>
            · {humidityEvents.length} event{humidityEvents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <EventTable
          events={events}
          title="Humidity Adjustment Activity"
          types={["humidity_high", "humidity_low"]}
        />
      </div>
    </div>
  );
}
