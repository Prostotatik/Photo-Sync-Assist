import { useState } from "react";
import { FileText, FileDown, BarChart3, Calendar, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useFarmStore } from "../store/farmStore";
import { Button } from "../components/ui/Button";
import { format } from "date-fns";

const REPORT_TYPES = [
  { label: "Daily Summary", hours: 24, icon: FileText, desc: "Today's sensor averages, alerts, AI predictions" },
  { label: "Weekly Report", hours: 168, icon: BarChart3, desc: "Last 7 days trends and comparisons" },
  { label: "Monthly Analysis", hours: 720, icon: Calendar, desc: "Full stats, ML insights, efficiency metrics" },
];

export default function Reports() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedHours, setSelectedHours] = useState(null);
  const [format_, setFormat] = useState("pdf");

  async function generateReport(hours) {
    setLoading(true);
    setSelectedHours(hours);
    try {
      const data = await api.reports.summary(hours, selectedFarmId);
      setSummary(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function downloadPDF() {
    const url = api.reports.pdf(selectedHours || 24, selectedFarmId);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: "#F1F5F9" }}>Reports</h1>

      {/* Quick report cards */}
      <div className="grid grid-cols-3 gap-4">
        {REPORT_TYPES.map(({ label, hours, icon: Icon, desc }) => (
          <div
            key={label}
            className="card cursor-pointer hover:border-primary-DEFAULT transition-all"
            style={{ borderColor: selectedHours === hours ? "var(--primary)" : "var(--border)" }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,214,143,0.13)" }}>
                <Icon size={20} style={{ color: "var(--primary)" }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "#F1F5F9" }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "#4B5A7A" }}>{desc}</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => generateReport(hours)}
              disabled={loading}
              variant="secondary"
            >
              {loading && selectedHours === hours ? "Generating..." : "Generate"}
            </Button>
          </div>
        ))}
      </div>

      {/* Format selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm" style={{ color: "#8B9CC3" }}>Format:</span>
        {["pdf", "csv", "json"].map((f) => (
          <label key={f} className="flex items-center gap-2 cursor-pointer text-sm capitalize" style={{ color: format_ === f ? "#F1F5F9" : "#8B9CC3" }}>
            <input type="radio" checked={format_ === f} onChange={() => setFormat(f)} className="accent-green-500" />
            {f.toUpperCase()}
          </label>
        ))}
      </div>

      {/* Report preview */}
      {summary && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: "#F1F5F9" }}>
              Report Preview — {summary.crop} — Last {summary.period_hours}h
            </h2>
            <Button onClick={downloadPDF} icon={<FileDown size={14} />} size="sm">
              Download PDF
            </Button>
          </div>

          {/* Report content */}
          <div
            className="rounded-xl p-5 space-y-5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", fontFamily: "mono" }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--primary)" }}>
                AGROSYNC REPORT — {format(new Date(), "MMMM d, yyyy").toUpperCase()}
              </p>
              <p className="text-xs" style={{ color: "#4B5A7A" }}>
                Farm: Rack Alpha | Crop: {summary.crop} | Period: Last {summary.period_hours}h
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold mb-3 uppercase" style={{ color: "#8B9CC3" }}>Sensor Averages</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(summary.sensor_stats).map(([key, stat]) =>
                  stat && stat.avg ? (
                    <div key={key} className="flex justify-between">
                      <span style={{ color: "#8B9CC3" }}>{key.replace("_", " ")}</span>
                      <span className="tabular" style={{ color: "#F1F5F9" }}>
                        avg: {stat.avg} (min: {stat.min}, max: {stat.max})
                      </span>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-2 uppercase" style={{ color: "#8B9CC3" }}>
                Alerts ({summary.alerts.total} total — {summary.alerts.critical} critical, {summary.alerts.warning} warnings)
              </p>
              {summary.alerts.list.slice(0, 5).map((a, i) => (
                <p key={i} className="text-xs" style={{ color: a.severity === "Critical" ? "var(--danger)" : a.severity === "Warning" ? "var(--warn)" : "#8B9CC3" }}>
                  • [{a.severity}] {a.sensor} — {a.message || a.time}
                </p>
              ))}
              {summary.alerts.list.length === 0 && <p className="text-xs" style={{ color: "#4B5A7A" }}>No alerts in this period.</p>}
            </div>

            <div>
              <p className="text-xs font-semibold mb-2 uppercase" style={{ color: "#8B9CC3" }}>Irrigation Summary</p>
              <p className="text-xs" style={{ color: "#F1F5F9" }}>
                Events: {summary.irrigation.total_events} · Time: {summary.irrigation.total_minutes.toFixed(0)} min · Est. water: {summary.irrigation.estimated_liters}L
              </p>
            </div>

            <p className="text-xs" style={{ color: "#4B5A7A" }}>Generated: {summary.generated_at?.slice(0, 16)?.replace("T", " ")} UTC · {summary.readings_count} sensor readings</p>
          </div>
        </div>
      )}

    </div>
  );
}
