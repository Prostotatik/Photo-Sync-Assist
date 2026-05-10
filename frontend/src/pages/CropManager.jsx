import { useState, useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { useFarmStore } from "../store/farmStore";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { format } from "date-fns";

const CROP_ICONS = { Wheat: "🌾", Soybean: "🌿", Maize: "🌽", Cotton: "🪴", Rice: "🌾" };

const CROP_COLORS = {
  Wheat: "var(--primary)", Soybean: "#60A5FA", Maize: "#F59E0B",
  Cotton: "#F472B6", Rice: "#34D399",
};

function paramInRange(value, idealMin, idealMax) {
  if (value === null || value === undefined) return "unknown";
  if (value >= idealMin && value <= idealMax) return "optimal";
  const margin = (idealMax - idealMin) * 0.15;
  if (value >= idealMin - margin && value <= idealMax + margin) return "borderline";
  return "critical";
}

const STATUS_COLORS = { optimal: "var(--primary)", borderline: "var(--warn)", critical: "var(--danger)", unknown: "#8B9CC3" };
const STATUS_LABELS = { optimal: "✓ Optimal", borderline: "⚠ Borderline", critical: "✗ Critical", unknown: "—" };

const GROWTH_STAGES = [
  { label: "Germination", pct: 0,  endPct: 12, color: "#34D399", desc: "Seeds sprouting, root development" },
  { label: "Vegetative",  pct: 12, endPct: 45, color: "#00D68F", desc: "Rapid leaf & stem growth" },
  { label: "Flowering",   pct: 45, endPct: 75, color: "#F59E0B", desc: "Pollination & fruit set" },
  { label: "Ripening",    pct: 75, endPct: 100, color: "#F97316", desc: "Grain/fruit filling & maturity" },
];

function currentStage(progress) {
  return GROWTH_STAGES.find((s) => progress >= s.pct && progress < s.endPct) || GROWTH_STAGES[3];
}

export default function CropManager() {
  const activeCrop = useFarmStore((s) => s.activeCrop);
  const setActiveCrop = useFarmStore((s) => s.setActiveCrop);
  const latest = useFarmStore((s) => s.latest);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  const cropParams = useFarmStore((s) => s.cropParams);
  const [selectedCrop, setSelectedCrop] = useState(activeCrop?.crop_type || "Wheat");
  const [sowingDate, setSowingDate] = useState(activeCrop?.sowing_date?.slice(0, 10) || "");
  const [saving, setSaving] = useState(false);
  const [harvestDays, setHarvestDays] = useState(null);

  function computeHarvest(sowing) {
    if (!sowing) return undefined;
    const days = harvestDays?.predicted_days || cropParams[activeCrop?.crop_type || selectedCrop]?.total_days_avg || 120;
    const d = new Date(sowing);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  useEffect(() => {
    api.ml.harvestDays(selectedFarmId).then(setHarvestDays).catch(() => {});
  }, [selectedFarmId]);

  const activeCropParams = cropParams[activeCrop?.crop_type || selectedCrop] || {};
  const ideal = activeCropParams.ideal || {};

  async function handleSetCrop(crop) {
    setSelectedCrop(crop);
    setSaving(true);
    try {
      const updated = await api.crops.setActive({
        crop_type: crop,
        sowing_date: sowingDate || undefined,
        harvest_date: computeHarvest(sowingDate),
        sunlight_hours: activeCrop?.sunlight_hours || 7,
        water_mm: activeCrop?.water_mm || 150,
        farm_id: selectedFarmId,
      });
      setActiveCrop(updated);
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function handleSaveDates() {
    const crop = activeCrop?.crop_type || selectedCrop;
    setSaving(true);
    try {
      const updated = await api.crops.setActive({
        crop_type: crop,
        sowing_date: sowingDate || undefined,
        harvest_date: computeHarvest(sowingDate),
        farm_id: selectedFarmId,
      });
      setActiveCrop(updated);
    } catch {}
    setSaving(false);
  }

  const crops = Object.keys(CROP_ICONS);
  const progress = activeCrop?.progress_pct || 0;

  const mlHarvestDate = activeCrop?.sowing_date ? computeHarvest(activeCrop.sowing_date) : null;
  const mlRemainingDays = mlHarvestDate
    ? Math.max(0, Math.ceil((new Date(mlHarvestDate).getTime() - Date.now()) / 86400000))
    : null;
  const mlTotalDays = harvestDays?.predicted_days || activeCrop?.total_days;

  const tableRows = [
    { label: "Temperature",  icon: "🌡", field: "temperature_c",    idealKey: "temperature",   unit: "°C" },
    { label: "Humidity",     icon: "💧", field: "humidity_pct",      idealKey: "humidity",      unit: "%" },
    { label: "Soil Moisture",icon: "🌱", field: "soil_moisture_pct", idealKey: "soil_moisture", unit: "%" },
    { label: "pH Level",     icon: "⚗", field: "ph_level",          idealKey: "ph",            unit: "" },
    { label: "Light",        icon: "☀", field: "light_pct",         idealKey: "light",         unit: "%" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: "#F1F5F9" }}>Crop Manager</h1>

      {/* Crop Selector */}
      <div className="card">
        <h2 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Select Active Crop</h2>
        <div className="grid grid-cols-5 gap-3">
          {crops.map((crop) => {
            const p = cropParams[crop] || {};
            const isActive = activeCrop?.crop_type === crop;
            const c = CROP_COLORS[crop] || "var(--primary)";
            return (
              <button
                key={crop}
                onClick={() => handleSetCrop(crop)}
                className="p-4 rounded-xl text-left transition-all hover:opacity-90"
                style={{
                  background: isActive ? `${c}15` : "var(--bg-elevated)",
                  border: `2px solid ${isActive ? c : "var(--border)"}`,
                }}
              >
                <div className="text-2xl mb-2">{CROP_ICONS[crop]}</div>
                <p className="font-semibold text-sm" style={{ color: isActive ? c : "#F1F5F9" }}>{crop}</p>
                <p className="text-xs mt-1" style={{ color: "#4B5A7A" }}>
                  {p.temperature_range ? `${p.temperature_range[0]}–${p.temperature_range[1]}°C` : ""}
                </p>
                <p className="text-xs" style={{ color: "#4B5A7A" }}>
                  {p.ph_range ? `pH ${p.ph_range[0]}–${p.ph_range[1]}` : ""}
                </p>
                {isActive && (
                  <span
                    className="inline-flex items-center gap-1 mt-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${c}20`, color: c }}
                  >
                    <CheckCircle size={10} /> ACTIVE
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current vs Optimal */}
      <div className="card">
        <h2 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Current vs Optimal Parameters</h2>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Parameter", "Current", "Optimal Range", "Status", ""].map((h) => (
                <th key={h} className="text-left py-2 pr-6 text-xs font-semibold" style={{ color: "#4B5A7A" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ label, icon, field, idealKey, idealRange, unit }) => {
              const current = field ? latest?.[field] : null;
              const range = idealRange || ideal[idealKey] || [];
              const [rMin, rMax] = range;
              const statusKey = current !== null ? paramInRange(current, rMin, rMax) : "unknown";
              const barPct = rMin !== undefined && rMax !== undefined && current != null
                ? Math.max(0, Math.min(100, ((current - rMin) / (rMax - rMin)) * 100))
                : null;

              return (
                <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-3 pr-6">
                    <span className="mr-2">{icon}</span>
                    <span style={{ color: "#F1F5F9" }}>{label}</span>
                  </td>
                  <td className="py-3 pr-6 tabular font-medium" style={{ color: "#F1F5F9" }}>
                    {current != null ? `${current.toFixed(idealKey === "ph" ? 2 : 1)} ${unit}` : "—"}
                  </td>
                  <td className="py-3 pr-6 tabular" style={{ color: "#8B9CC3" }}>
                    {rMin !== undefined ? `${rMin} – ${rMax} ${unit}` : "N/A"}
                  </td>
                  <td className="py-3 pr-6">
                    <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[statusKey] }}>
                      {STATUS_LABELS[statusKey]}
                    </span>
                  </td>
                  <td className="py-3 w-32">
                    {barPct !== null && (
                      <div className="h-1.5 rounded-full" style={{ background: "var(--bg-elevated)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, barPct)}%`,
                            background: STATUS_COLORS[statusKey],
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Grow Cycle Calendar */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold" style={{ color: "#F1F5F9" }}>Grow Cycle Calendar</h2>
          {activeCrop && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                background: `${currentStage(progress).color}20`,
                color: currentStage(progress).color,
              }}
            >
              {currentStage(progress).label} Stage
            </span>
          )}
        </div>

        {/* Sown Date — harvest auto-computed from crop's avg cycle length */}
        <div className="flex gap-3 items-end mb-5">
          <div>
            <label className="text-xs block mb-1" style={{ color: "#4B5A7A" }}>Sown Date</label>
            <input
              type="date"
              value={sowingDate}
              onChange={(e) => setSowingDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#F1F5F9" }}
            />
          </div>
          {sowingDate && (
            <p className="text-xs pb-2.5" style={{ color: "#4B5A7A" }}>
              Predicted Harvest{" "}
              <span style={{ color: "#8B9CC3" }}>
                {format(new Date(computeHarvest(sowingDate)), "MMM d, yyyy")}
              </span>
            </p>
          )}
          <Button onClick={handleSaveDates} disabled={saving || !sowingDate} size="sm">Plant!</Button>
        </div>

        {activeCrop?.sowing_date ? (
          <div className="space-y-5">
            {/* Stage segmented bar */}
            <div>
              <div className="flex rounded-full overflow-hidden h-3 mb-3" style={{ background: "var(--bg-elevated)" }}>
                {GROWTH_STAGES.map((stage) => {
                  const segWidth = stage.endPct - stage.pct;
                  const filled = Math.max(0, Math.min(segWidth, progress - stage.pct));
                  return (
                    <div key={stage.label} className="relative" style={{ width: `${segWidth}%` }}>
                      <div className="h-full" style={{ background: "var(--bg-elevated)" }} />
                      <div
                        className="absolute inset-y-0 left-0 transition-all duration-700"
                        style={{ width: `${(filled / segWidth) * 100}%`, background: stage.color }}
                      />
                      {/* Stage separator */}
                      <div className="absolute right-0 inset-y-0 w-px" style={{ background: "var(--bg)" }} />
                    </div>
                  );
                })}
              </div>

              {/* Stage labels */}
              <div className="flex text-xs" style={{ color: "#4B5A7A" }}>
                {GROWTH_STAGES.map((stage) => {
                  const active = progress >= stage.pct && progress < stage.endPct;
                  return (
                    <div key={stage.label} style={{ width: `${stage.endPct - stage.pct}%` }} className="text-center">
                      <span
                        className="font-medium"
                        style={{ color: active ? stage.color : "#4B5A7A" }}
                      >
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Milestone timeline — today label above, sown/harvest labels below */}
            <div className="relative" style={{ paddingTop: 40, paddingBottom: 32 }}>
              {/* The line */}
              <div className="absolute left-0 right-0" style={{ top: 40, height: 1, background: "var(--border)" }} />

              {/* Sown marker — label below */}
              <div className="absolute flex flex-col items-center" style={{ top: 40 - 5, left: 0 }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--primary)" }} />
                <div className="mt-2 text-xs text-center" style={{ color: "#8B9CC3" }}>
                  <p>{format(new Date(activeCrop.sowing_date), "MMM d")}</p>
                  <p style={{ color: "#4B5A7A" }}>Sown</p>
                </div>
              </div>

              {/* Stage milestone dots (no labels) */}
              {GROWTH_STAGES.slice(1).map((stage) => (
                <div
                  key={stage.label}
                  className="absolute"
                  style={{ top: 40 - 4, left: `${stage.pct}%`, transform: "translateX(-50%)" }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: progress >= stage.pct ? stage.color : "#2A3550" }}
                  />
                </div>
              ))}

              {/* Today marker — label ABOVE the dot */}
              <div
                className="absolute flex flex-col items-center"
                style={{ top: 40 - 7, left: `${Math.min(progress, 98)}%`, transform: "translateX(-50%)" }}
              >
                {/* label above */}
                <div
                  className="absolute text-xs text-center whitespace-nowrap font-semibold"
                  style={{ bottom: "calc(100% + 6px)", color: "var(--warn)" }}
                >
                  Day {activeCrop.elapsed_days} · Today
                </div>
                {/* tick line */}
                <div className="absolute" style={{ bottom: "100%", width: 1, height: 6, background: "var(--warn)" }} />
                {/* dot */}
                <div className="w-3.5 h-3.5 rounded-full z-10" style={{ background: "var(--warn)", outline: "2px solid #0B0E1A" }} />
              </div>

              {/* Predicted Harvest marker — label below */}
              {activeCrop.sowing_date && computeHarvest(activeCrop.sowing_date) && (
                <div className="absolute flex flex-col items-center" style={{ top: 40 - 5, right: 0 }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4B5A7A" }} />
                  <div className="mt-2 text-xs text-center" style={{ color: "#8B9CC3" }}>
                    <p>{format(new Date(computeHarvest(activeCrop.sowing_date)), "MMM d")}</p>
                    <p style={{ color: "#4B5A7A" }}>Predicted Harvest</p>
                  </div>
                </div>
              )}
            </div>

            {/* Current stage info */}
            <div
              className="rounded-xl p-4 mt-2"
              style={{ background: `${currentStage(progress).color}10`, border: `1px solid ${currentStage(progress).color}30` }}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-sm" style={{ color: currentStage(progress).color }}>
                  {currentStage(progress).label}
                </p>
                <p className="text-xs tabular font-bold" style={{ color: currentStage(progress).color }}>
                  {progress.toFixed(0)}%
                </p>
              </div>
              <p className="text-xs" style={{ color: "#8B9CC3" }}>{currentStage(progress).desc}</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-xs mb-1" style={{ color: "#4B5A7A" }}>Total Days</p>
                <p className="font-bold tabular" style={{ color: "#F1F5F9" }}>{mlTotalDays ?? "—"}</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-xs mb-1" style={{ color: "#4B5A7A" }}>Elapsed</p>
                <p className="font-bold tabular" style={{ color: "var(--primary)" }}>{activeCrop.elapsed_days}</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-xs mb-1" style={{ color: "#4B5A7A" }}>Remaining</p>
                <p className="font-bold tabular" style={{ color: mlRemainingDays != null && mlRemainingDays < 14 ? "var(--warn)" : "#F1F5F9" }}>
                  {mlRemainingDays != null ? `${mlRemainingDays} days` : "—"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm mt-2" style={{ color: "#4B5A7A" }}>Set a Sown Date above to see the growth timeline.</p>
        )}
      </div>
    </div>
  );
}
