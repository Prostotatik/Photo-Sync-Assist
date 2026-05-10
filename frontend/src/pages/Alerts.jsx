import { useState, useEffect } from "react";
import { AlertOctagon, AlertTriangle, Info, CheckCircle, X } from "lucide-react";
import { api } from "../lib/api";
import { useFarmStore } from "../store/farmStore";
import { Button } from "../components/ui/Button";
import { SeverityBadge } from "../components/ui/Badge";
import { format } from "date-fns";

const SEV_ICONS = { Critical: AlertOctagon, Warning: AlertTriangle, Info };
const SEV_COLORS = { Critical: "var(--danger)", Warning: "var(--warn)", Info: "#60A5FA" };

function AlertRow({ alert, onAck }) {
  const Icon = SEV_ICONS[alert.severity] || Info;
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }} className="hover:bg-bg-elevated transition-colors">
      <td className="py-3 pr-4 tabular text-xs" style={{ color: "#8B9CC3" }}>
        {alert.timestamp ? format(new Date(alert.timestamp), "MMM d, HH:mm") : "—"}
      </td>
      <td className="py-3 pr-4">
        <span className="capitalize text-sm" style={{ color: "#F1F5F9" }}>{alert.sensor}</span>
      </td>
      <td className="py-3 pr-4 text-sm" style={{ color: "#8B9CC3" }}>{alert.condition}</td>
      <td className="py-3 pr-4 tabular text-sm" style={{ color: "#F1F5F9" }}>{alert.value?.toFixed(2)}</td>
      <td className="py-3 pr-4"><SeverityBadge severity={alert.severity} /></td>
      <td className="py-3 pr-4">
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background: alert.status === "Active" ? "rgba(239,68,68,0.13)" : "rgba(75,90,122,0.2)",
            color: alert.status === "Active" ? "var(--danger)" : "#8B9CC3",
          }}
        >
          {alert.status}
        </span>
      </td>
      <td className="py-3">
        {alert.status === "Active" && (
          <button onClick={() => onAck(alert.id)} className="text-xs hover:opacity-70 px-2 py-1 rounded" style={{ color: "#8B9CC3", border: "1px solid var(--border)" }}>
            ACK
          </button>
        )}
      </td>
    </tr>
  );
}

export default function Alerts() {
  const activeAlerts = useFarmStore((s) => s.activeAlerts);
  const setActiveAlerts = useFarmStore((s) => s.setActiveAlerts);
  const removeAlert = useFarmStore((s) => s.removeAlert);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  const [allAlerts, setAllAlerts] = useState([]);
  const [sevFilter, setSevFilter] = useState("");
  const [sensorFilter, setSensorFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchAlerts = () =>
    api.alerts.list({ limit: 100, farm_id: selectedFarmId }).then(setAllAlerts).catch(() => {});

  // Initial load + poll every 15s
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15_000);
    return () => clearInterval(interval);
  }, [selectedFarmId]);

  // Refresh list immediately when a new SSE alert arrives
  useEffect(() => {
    if (activeAlerts.length > 0) fetchAlerts();
  }, [activeAlerts.length]);

  const filteredAlerts = allAlerts.filter((a) => {
    if (sevFilter && a.severity !== sevFilter) return false;
    if (sensorFilter && a.sensor !== sensorFilter) return false;
    return true;
  });

  async function handleAck(id) {
    removeAlert(id);
    await api.alerts.acknowledge(id);
    setAllAlerts((a) => a.map((x) => (x.id === id ? { ...x, status: "Acknowledged" } : x)));
  }

  async function handleAckAll() {
    await api.alerts.acknowledgeAll(selectedFarmId);
    setActiveAlerts([]);
    setAllAlerts((a) => a.map((x) => ({ ...x, status: "Acknowledged" })));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" style={{ color: "#F1F5F9" }}>Alerts</h1>

      {/* Active alert banner */}
      {activeAlerts.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm flex items-center gap-2" style={{ color: "var(--danger)" }}>
              <AlertOctagon size={16} /> {activeAlerts.length} Active Alert{activeAlerts.length > 1 ? "s" : ""}
            </p>
            <Button variant="danger" size="sm" onClick={handleAckAll}>Acknowledge All</Button>
          </div>
          <div className="space-y-2">
            {activeAlerts.slice(0, 3).map((a) => {
              const Icon = SEV_ICONS[a.severity] || Info;
              return (
                <div key={a.id || a.timestamp} className="flex items-center gap-3">
                  <Icon size={14} style={{ color: SEV_COLORS[a.severity], flexShrink: 0 }} />
                  <span className="text-sm flex-1" style={{ color: "#F1F5F9" }}>{a.message || a.condition}</span>
                  <button onClick={() => handleAck(a.id)} style={{ color: "#8B9CC3" }}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert history */}
      <div className="card">
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <h2 className="font-semibold" style={{ color: "#F1F5F9" }}>Alert History</h2>
          <select
            value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm ml-auto"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#F1F5F9" }}
          >
            <option value="">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="Warning">Warning</option>
            <option value="Info">Info</option>
          </select>
          <select
            value={sensorFilter} onChange={(e) => setSensorFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#F1F5F9" }}
          >
            <option value="">All Sensors</option>
            <option value="temperature">Temperature</option>
            <option value="humidity">Humidity</option>
            <option value="soil_moisture">Soil Moisture</option>
            <option value="ph">pH</option>
          </select>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Time", "Sensor", "Condition", "Value", "Severity", "Status", ""].map((h) => (
                <th key={h} className="text-left py-2 pr-4 text-xs font-semibold" style={{ color: "#4B5A7A" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.slice(0, 50).map((a) => (
              <AlertRow key={a.id} alert={a} onAck={handleAck} />
            ))}
            {filteredAlerts.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center" style={{ color: "#4B5A7A" }}>
                  <CheckCircle size={24} className="mx-auto mb-2" style={{ color: "var(--primary)" }} />
                  No alerts
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
