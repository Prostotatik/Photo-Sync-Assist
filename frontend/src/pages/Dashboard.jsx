import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Thermometer, Droplets, Leaf, FlaskConical,
  CheckCircle, AlertTriangle, AlertOctagon, Info,
  Plus, Server, Camera, Sun, ChevronDown, ChevronUp,
} from "lucide-react";

const STATUS_COLORS = { optimal: "var(--primary)", borderline: "var(--warn)", critical: "var(--danger)", unknown: "#8B9CC3" };
const STATUS_LABELS = { optimal: "✓ Optimal", borderline: "⚠ Borderline", critical: "✗ Critical", unknown: "—" };

function paramInRange(value, idealMin, idealMax) {
  if (value == null || idealMin == null || idealMax == null) return "unknown";
  if (value >= idealMin && value <= idealMax) return "optimal";
  const margin = (idealMax - idealMin) * 0.15;
  if (value >= idealMin - margin && value <= idealMax + margin) return "borderline";
  return "critical";
}
import { useFarmStore } from "../store/farmStore";
import { api } from "../lib/api";
import { HealthGauge } from "../components/charts/HealthGauge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { format, formatDistanceToNow } from "date-fns";

const CROP_ICONS = { Wheat: "🌾", Soybean: "🌿", Maize: "🌽", Cotton: "🪴", Rice: "🌾" };
const CROPS = ["Wheat", "Soybean", "Maize", "Cotton", "Rice"];

// ─── Rack Overview Card ───────────────────────────────────────────────────────
function RackCard({ rack, selected, onClick }) {
  const hs = rack.health_score;
  const borderColor = hs == null ? "var(--border)"
    : hs >= 70 ? "var(--primary)"
    : hs >= 50 ? "var(--warn)"
    : "var(--danger)";
  const scoreColor = hs == null ? "#8B9CC3" : hs >= 70 ? "var(--primary)" : hs >= 50 ? "var(--warn)" : "var(--danger)";
  const r = rack.last_reading;

  return (
    <button
      onClick={onClick}
      className="rounded-xl p-3 text-left transition-all hover:opacity-90 flex-shrink-0"
      style={{
        width: 180,
        background: selected ? "rgba(0,214,143,0.07)" : "var(--bg-elevated)",
        border: `2px solid ${selected ? "var(--primary)" : borderColor}`,
        outline: "none",
      }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-lg leading-none">{rack.crop_icon || "🌱"}</span>
        {rack.alert_count > 0 && (
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.18)", color: "var(--danger)" }}
          >
            ⚠ {rack.alert_count}
          </span>
        )}
      </div>
      <p className="font-semibold text-sm truncate" style={{ color: "#F1F5F9" }}>{rack.name}</p>
      <p className="text-xs mb-2 truncate" style={{ color: "#4B5A7A" }}>{rack.crop_type} · {rack.rack_size} tiers</p>

      {/* Health score bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span style={{ color: "#4B5A7A" }}>Health</span>
          <span className="tabular font-bold" style={{ color: scoreColor }}>
            {hs != null ? `${Math.round(hs)}/100` : "—"}
          </span>
        </div>
        <div className="h-1 rounded-full" style={{ background: "var(--border)" }}>
          <div className="h-full rounded-full" style={{ width: `${hs ?? 0}%`, background: scoreColor }} />
        </div>
      </div>

      {/* Mini sensor values */}
      {r ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {[
            { label: "Temp", v: r.temperature_c?.toFixed(1), u: "°" },
            { label: "Hum", v: r.humidity_pct?.toFixed(0), u: "%" },
            { label: "SM", v: r.soil_moisture_pct?.toFixed(0), u: "%" },
            { label: "pH", v: r.ph_level?.toFixed(1), u: "" },
          ].map(({ label, v, u }) => (
            <div key={label} className="flex justify-between text-xs">
              <span style={{ color: "#4B5A7A" }}>{label}</span>
              <span className="tabular" style={{ color: "#F1F5F9" }}>{v ?? "—"}{u}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "#4B5A7A" }}>No readings yet</p>
      )}

      {selected && (
        <div className="mt-2 text-xs font-semibold text-center py-0.5 rounded" style={{ background: "rgba(0,214,143,0.13)", color: "var(--primary)" }}>
          ● SELECTED
        </div>
      )}
    </button>
  );
}

// ─── Add Rack Modal ───────────────────────────────────────────────────────────
function AddRackModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(3);
  const [location, setLocation] = useState("");
  const [cropType, setCropType] = useState("Wheat");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Rack name is required"); return; }
    setLoading(true);
    setError("");
    try {
      const rack = await api.racks.create({ name: name.trim(), rack_size: size, location, crop_type: cropType });
      setName(""); setSize(3); setLocation(""); setCropType("Wheat");
      onCreated(rack);
      onClose();
    } catch (e) {
      setError(e.message || "Failed to create rack");
    }
    setLoading(false);
  }

  const inputStyle = { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#F1F5F9" };

  return (
    <Modal open={open} onClose={onClose} title="Add New Rack">
      <div className="space-y-4">
        <div>
          <label className="text-xs block mb-1" style={{ color: "#4B5A7A" }}>Rack Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="e.g. Rack Beta" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: "#4B5A7A" }}>Tiers / Size</label>
            <input type="number" min={1} max={50} value={size} onChange={(e) => setSize(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "#4B5A7A" }}>Initial Crop</label>
            <select value={cropType} onChange={(e) => setCropType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle}>
              {CROPS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "#4B5A7A" }}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="e.g. Greenhouse B, Row 3" />
        </div>
        {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading} icon={<Plus size={14} />}>
            {loading ? "Creating..." : "Create Rack"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, unit, status, iconColor }) {
  const prevRef = useRef(value);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (prevRef.current !== value) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 700);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  const borderColor = STATUS_COLORS[status] ?? "var(--primary)";

  return (
    <div className="card relative overflow-hidden" style={{ borderTop: `3px solid ${borderColor}` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={18} style={{ color: iconColor }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4B5A7A" }}>{label}</span>
        </div>
      </div>
      <div className={`tabular font-bold leading-none ${pulse ? "pulse-once" : ""}`} style={{ fontSize: 40, color: "#F1F5F9" }}>
        {value ?? "—"}
        <span className="text-lg font-normal ml-1" style={{ color: "#8B9CC3" }}>{unit}</span>
      </div>
      <div className="mt-3 text-xs font-semibold" style={{ color: STATUS_COLORS[status ?? "unknown"] }}>
        {STATUS_LABELS[status ?? "unknown"]}
      </div>
    </div>
  );
}

// ─── Alert Row ───────────────────────────────────────────────────────────────
function AlertRow({ alert, onAck }) {
  const icons = { Critical: AlertOctagon, Warning: AlertTriangle, Info };
  const colors = { Critical: "var(--danger)", Warning: "var(--warn)", Info: "#60A5FA" };
  const Icon = icons[alert.severity] || Info;
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <Icon size={16} style={{ color: colors[alert.severity], flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: "#F1F5F9" }}>{alert.message || alert.condition}</p>
        <p className="text-xs mt-0.5" style={{ color: "#4B5A7A" }}>
          {alert.timestamp ? formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true }) : ""}
        </p>
      </div>
      <button onClick={() => onAck(alert.id)} className="text-xs px-2 py-1 rounded hover:opacity-80 flex-shrink-0"
        style={{ background: "var(--bg-elevated)", color: "#8B9CC3", border: "1px solid var(--border)" }}>
        ACK
      </button>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const latest = useFarmStore((s) => s.latest);
  const activeAlerts = useFarmStore((s) => s.activeAlerts);
  const activeCrop = useFarmStore((s) => s.activeCrop);
  const removeAlert = useFarmStore((s) => s.removeAlert);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const setSelectedFarmId = useFarmStore((s) => s.setSelectedFarmId);
  const rackOverview = useFarmStore((s) => s.rackOverview);
  const rackOverviewLoaded = useFarmStore((s) => s.rackOverviewLoaded);
  const setRacks = useFarmStore((s) => s.setRacks);
  const setRackOverview = useFarmStore((s) => s.setRackOverview);
  const mockEnabled = useFarmStore((s) => s.mockEnabled);
  const latestImage = useFarmStore((s) => s.latestImage);
  const setLatestImage = useFarmStore((s) => s.setLatestImage);
  const imageAnalysis = useFarmStore((s) => s.imageAnalysis);
  const setImageAnalysis = useFarmStore((s) => s.setImageAnalysis);

  const cropParams = useFarmStore((s) => s.cropParams);

  const [healthScore, setHealthScore] = useState(null);
  const [yieldPrediction, setYieldPrediction] = useState(null);
  const [diseaseRisk, setDiseaseRisk] = useState(null);
  const [harvestDays, setHarvestDays] = useState(null);
  const [addRackOpen, setAddRackOpen] = useState(false);
  const [cameraExpanded, setCameraExpanded] = useState(false);

  // Refresh health score and harvest days when selected rack changes
  useEffect(() => {
    setHealthScore(null);
    setHarvestDays(null);
    api.ml.healthScore(selectedFarmId).then(setHealthScore).catch(() => {});
    api.ml.harvestDays(selectedFarmId).then(setHarvestDays).catch(() => {});
  }, [selectedFarmId]);

  // Update ML predictions when latest reading changes
  useEffect(() => {
    if (!latest || !activeCrop) return;
    const sunlight = latest.light_pct != null
      ? (latest.light_pct / 100) * 12
      : (activeCrop.sunlight_hours || 7);
    const req = {
      crop_type: activeCrop.crop_type,
      soil_moisture: latest.soil_moisture_pct,
      soil_ph: latest.ph_level,
      temperature: latest.temperature_c,
      water_mm: activeCrop.water_mm,
      humidity: latest.humidity_pct,
      sunlight_hours: sunlight,
      total_days: activeCrop.elapsed_days,
    };
    api.ml.yieldPredict(req).then(setYieldPrediction).catch(() => {});
    api.ml.diseaseRisk(req).then(setDiseaseRisk).catch(() => {});
    api.ml.healthScore(selectedFarmId).then(setHealthScore).catch(() => {});
    api.ml.harvestDays(selectedFarmId).then(setHarvestDays).catch(() => {});
  }, [latest, activeCrop]);

  // Poll camera image
  useEffect(() => {
    const pollImage = async () => {
      try {
        const res = await api.sensors.getImage(selectedFarmId);
        if (res.image) {
          setLatestImage(res.image);
          const analysis = res.analysis_json;
          setImageAnalysis(Array.isArray(analysis) ? analysis : null);
        }
      } catch {}
    };
    pollImage();
    const interval = setInterval(pollImage, mockEnabled ? 30_000 : 120_000);
    return () => clearInterval(interval);
  }, [selectedFarmId, mockEnabled]);

  const predictedHarvestDate = (() => {
    if (!activeCrop?.sowing_date || !harvestDays?.predicted_days) return null;
    const d = new Date(activeCrop.sowing_date);
    d.setDate(d.getDate() + harvestDays.predicted_days);
    return d;
  })();

  const remainingDays = predictedHarvestDate
    ? Math.max(0, Math.ceil((predictedHarvestDate.getTime() - Date.now()) / 86400000))
    : null;

  const ideal = (cropParams[activeCrop?.crop_type] || {}).ideal || {};
  function sensorStatus(field, idealKey) {
    const range = ideal[idealKey] || [];
    return paramInRange(latest?.[field], range[0], range[1]);
  }

  const lightIdeal = ideal["light"] || [];
  const lightStatus = paramInRange(latest?.light_pct, lightIdeal[0], lightIdeal[1]);

  const handleAck = async (id) => {
    removeAlert(id);
    try { await api.alerts.acknowledge(id); } catch {}
  };

  function handleRackCreated() {
    api.racks.list().then(setRacks).catch(() => {});
    api.racks.overview().then(setRackOverview).catch(() => {});
  }

  const DISEASE_COLORS = { None: "var(--primary)", Mild: "var(--warn)", Moderate: "#F97316", Severe: "var(--danger)" };
  const cropProgress = activeCrop?.progress_pct || 0;

  const onlineCount = rackOverview.filter((r) => r.last_reading).length;
  const offlineCount = rackOverview.length - onlineCount;

  // Flatten Roboflow analysis: handle nested workflow result structures
  const detections = (() => {
    if (!imageAnalysis) return [];
    if (Array.isArray(imageAnalysis)) {
      const flat = imageAnalysis.flatMap((item) => {
        if (item?.predictions) return item.predictions;
        if (item?.class) return [item];
        return [];
      });
      return flat.slice(0, 6);
    }
    return [];
  })();

  return (
    <div className="space-y-5">

      {/* ── Rack Overview Grid ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Server size={16} style={{ color: "#4B5A7A" }} />
            <h3 className="font-semibold" style={{ color: "#F1F5F9" }}>All Racks</h3>
            {rackOverview.length > 0 && (
              <span className="text-xs" style={{ color: "#4B5A7A" }}>
                {onlineCount} online{offlineCount > 0 ? ` · ${offlineCount} offline` : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => setAddRackOpen(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-80 transition-all"
            style={{ background: "rgba(0,214,143,0.13)", color: "var(--primary)", border: "1px solid rgba(0,214,143,0.3)" }}
          >
            <Plus size={13} /> Add Rack
          </button>
        </div>

        {!rackOverviewLoaded ? (
          <p className="text-sm py-2" style={{ color: "#4B5A7A" }}>Loading racks…</p>
        ) : rackOverview.length === 0 ? (
          <p className="text-sm py-2" style={{ color: "#4B5A7A" }}>No racks yet — click "Add Rack" to get started.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 flex-wrap">
            {rackOverview.map((rack) => (
              <RackCard
                key={rack.farm_id}
                rack={rack}
                selected={rack.farm_id === selectedFarmId}
                onClick={() => setSelectedFarmId(rack.farm_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Selected Rack Detail Label ─────────────────────────────────── */}
      {rackOverview.length > 1 && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="text-xs font-semibold" style={{ color: "#4B5A7A" }}>
            {rackOverview.find((r) => r.farm_id === selectedFarmId)?.name || selectedFarmId}
            {" — "}
            {rackOverview.find((r) => r.farm_id === selectedFarmId)?.crop_type || ""}
          </span>
          <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>
      )}

      {/* ── Row 1: KPI Cards ───────────────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <KPICard icon={Thermometer} label="Temperature"
          value={latest?.temperature_c?.toFixed(1)} unit="°C"
          status={sensorStatus("temperature_c", "temperature")} iconColor="#F97316" />
        <KPICard icon={Droplets} label="Humidity"
          value={latest?.humidity_pct?.toFixed(1)} unit="%"
          status={sensorStatus("humidity_pct", "humidity")} iconColor="#60A5FA" />
        <KPICard icon={Leaf} label="Soil Moisture"
          value={latest?.soil_moisture_pct?.toFixed(1)} unit="%"
          status={sensorStatus("soil_moisture_pct", "soil_moisture")} iconColor="#00D68F" />
        <KPICard icon={FlaskConical} label="pH Level"
          value={latest?.ph_level?.toFixed(2)} unit=""
          status={sensorStatus("ph_level", "ph")} iconColor="#A78BFA" />
        <KPICard icon={Sun} label="Light"
          value={latest?.light_pct?.toFixed(1)} unit="%"
          status={lightStatus} iconColor="#F59E0B" />
      </div>

      {/* ── Row 2: Rack Camera + Health Gauge ─────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 300px" }}>
        {/* Rack Camera */}
        <div className="card">
          {/* Header — always visible, click to toggle image */}
          <button
            className="w-full flex items-center justify-between mb-3"
            onClick={() => setCameraExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Camera size={16} style={{ color: "#4B5A7A" }} />
              <div className="text-left">
                <h3 className="font-semibold" style={{ color: "#F1F5F9" }}>Rack Camera</h3>
                <p className="text-xs" style={{ color: "#4B5A7A" }}>
                  {latestImage ? `Last updated · updates every ${mockEnabled ? "30s" : "120s"}` : "No image yet"}
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
              style={{ background: "var(--bg-elevated)", color: "#4B5A7A", border: "1px solid var(--border)" }}>
              {cameraExpanded ? <><ChevronUp size={13} /> Collapse</> : <><ChevronDown size={13} /> Show image</>}
            </span>
          </button>

          {/* Collapsible image */}
          {cameraExpanded && (
            latestImage ? (
              <div className="rounded-lg overflow-hidden mb-3" style={{ aspectRatio: "1 / 1", background: "#070A14" }}>
                <img
                  src={latestImage}
                  alt="Rack plant view"
                  className="w-full h-full"
                  style={{ objectFit: "contain" }}
                />
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center rounded-lg mb-3"
                style={{ aspectRatio: "1 / 1", background: "var(--bg-elevated)", border: "1px dashed var(--border)" }}
              >
                <Camera size={32} style={{ color: "#4B5A7A" }} />
                <p className="text-sm mt-2" style={{ color: "#4B5A7A" }}>No image available</p>
                <p className="text-xs mt-1" style={{ color: "#4B5A7A" }}>
                  {mockEnabled ? "Add .jpg files to backend/mock_images/" : "Waiting for ESP32-CAM"}
                </p>
              </div>
            )
          )}

          {/* Disease detections — always visible */}
          {detections.length > 0 ? (
            <div className={cameraExpanded ? "pt-3" : ""} style={cameraExpanded ? { borderTop: "1px solid var(--border)" } : {}}>
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8B9CC3" }}>
                Disease Analysis
              </p>
              <div className="space-y-1.5">
                {detections.map((det, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span style={{ color: "#F1F5F9" }}>{det.class || det.label || "Detection"}</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: (det.confidence || 0) > 0.7
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(245,158,11,0.15)",
                        color: (det.confidence || 0) > 0.7 ? "var(--danger)" : "var(--warn)",
                      }}
                    >
                      {(((det.confidence || 0) * 100).toFixed(1))}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "#4B5A7A" }}>
              No disease detections
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Farm Health Score</h3>
          {healthScore != null
            ? <HealthGauge score={healthScore.score} subScores={healthScore.sub_scores ?? {}} />
            : <p className="text-sm py-8 text-center" style={{ color: "#4B5A7A" }}>—</p>
          }
        </div>
      </div>

      {/* ── Row 3: Crop Status + Active Alerts ────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: "#F1F5F9" }}>Current Crop</h3>
            <button onClick={() => navigate("/crops")} className="text-xs" style={{ color: "var(--primary)" }}>
              View Details →
            </button>
          </div>

          {activeCrop ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(0,214,143,0.13)" }}>
                  {CROP_ICONS[activeCrop.crop_type] || "🌱"}
                </div>
                <div>
                  <p className="font-semibold text-base" style={{ color: "#F1F5F9" }}>{activeCrop.crop_type}</p>
                  <p className="text-xs" style={{ color: "#4B5A7A" }}>Day {activeCrop.elapsed_days} of {activeCrop.total_days}</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: "#8B9CC3" }}>
                  <span>Growth Stage</span>
                  <span className="tabular">{cropProgress.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "var(--bg-elevated)" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${cropProgress}%`, background: cropProgress > 80 ? "var(--warn)" : "var(--primary)" }} />
                </div>
                {activeCrop.sowing_date && (
                  <div className="flex justify-between text-xs mt-1" style={{ color: "#4B5A7A" }}>
                    <span>Sown {format(new Date(activeCrop.sowing_date), "MMM d")}</span>
                    <span>{remainingDays != null ? `${remainingDays}d remaining` : "—"}</span>
                    {predictedHarvestDate && (
                      <span>Predicted Harvest {format(predictedHarvestDate, "MMM d")}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-xs" style={{ color: "#4B5A7A" }}>Predicted Yield</p>
                  <p className="font-bold tabular text-lg mt-0.5" style={{ color: "var(--primary)" }}>
                    {yieldPrediction ? `${yieldPrediction.yield_kg_ha.toLocaleString()} kg/ha` : "—"}
                  </p>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                  <p className="text-xs" style={{ color: "#4B5A7A" }}>Disease Risk</p>
                  <p className="font-bold mt-0.5" style={{ color: DISEASE_COLORS[diseaseRisk?.risk] || "#8B9CC3" }}>
                    {diseaseRisk?.risk || "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#4B5A7A" }}>
              No crop configured.{" "}
              <button onClick={() => navigate("/crops")} style={{ color: "var(--primary)" }}>Set up →</button>
            </p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: "#F1F5F9" }}>Active Alerts</h3>
            <button onClick={() => navigate("/alerts")} className="text-xs" style={{ color: "var(--primary)" }}>
              View All →
            </button>
          </div>
          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle size={28} style={{ color: "var(--primary)" }} />
              <p className="text-sm" style={{ color: "#8B9CC3" }}>All systems nominal</p>
            </div>
          ) : (
            <div>
              {activeAlerts.slice(0, 5).map((a) => (
                <AlertRow key={a.id || a.timestamp} alert={a} onAck={handleAck} />
              ))}
              {activeAlerts.length > 5 && (
                <p className="text-xs mt-2" style={{ color: "#4B5A7A" }}>+{activeAlerts.length - 5} more alerts</p>
              )}
            </div>
          )}
        </div>
      </div>

      <AddRackModal open={addRackOpen} onClose={() => setAddRackOpen(false)} onCreated={handleRackCreated} />
    </div>
  );
}
