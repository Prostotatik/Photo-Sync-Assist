import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, AlertTriangle, AlertOctagon, Info, X, ToggleLeft, ToggleRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useFarmStore } from "../../store/farmStore";
import { api } from "../../lib/api";

const CROP_ICONS = { Wheat: "🌾", Soybean: "🌿", Maize: "🌽", Cotton: "🪴", Rice: "🌾" };

const ALERT_ICONS = { Critical: AlertOctagon, Warning: AlertTriangle, Info };
const ALERT_COLORS = { Critical: "var(--danger)", Warning: "var(--warn)", Info: "#60A5FA" };

export default function Header() {
  const [showNotifs, setShowNotifs] = useState(false);
  const [mockLoading, setMockLoading] = useState(false);
  const notifRef = useRef(null);

  const sseStatus = useFarmStore((s) => s.sseStatus);
  const lastSyncSecs = useFarmStore((s) => s.lastSyncSecs);
  const activeAlerts = useFarmStore((s) => s.activeAlerts);
  const activeCrop = useFarmStore((s) => s.activeCrop);
  const racks = useFarmStore((s) => s.racks);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const setSelectedFarmId = useFarmStore((s) => s.setSelectedFarmId);
  const mockEnabled = useFarmStore((s) => s.mockEnabled);
  const setMockEnabled = useFarmStore((s) => s.setMockEnabled);

  const currentRack = racks.find((r) => r.farm_id === selectedFarmId);

  const handleMockToggle = async () => {
    setMockLoading(true);
    try {
      const res = await api.sensors.mockToggle();
      setMockEnabled(res.mock_enabled);
    } catch {}
    setMockLoading(false);
  };

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    if (!showNotifs) return;
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifs]);

  const syncLabel = lastSyncSecs === 0
    ? "Just now"
    : lastSyncSecs < 60
    ? `${lastSyncSecs}s ago`
    : `${Math.floor(lastSyncSecs / 60)}m ago`;

  return (
    <header
      className="fixed top-0 left-60 right-0 h-14 flex items-center px-6 gap-4"
      style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)", zIndex: 40 }}
    >
      {/* Rack selector */}
      <div className="relative flex items-center gap-2">
        <select
          value={selectedFarmId}
          onChange={(e) => setSelectedFarmId(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "#F1F5F9",
            outline: "none",
          }}
        >
          {racks.length === 0
            ? <option value={selectedFarmId}>{currentRack?.name || "Rack Alpha"}</option>
            : racks.map((r) => (
                <option key={r.farm_id} value={r.farm_id}>
                  {CROP_ICONS[activeCrop?.crop_type] || "🌱"} {r.name}
                </option>
              ))
          }
        </select>
        <ChevronDown size={12} className="absolute right-2 pointer-events-none" style={{ color: "#4B5A7A" }} />
        {activeCrop && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(0,214,143,0.13)", color: "var(--primary)" }}
          >
            {CROP_ICONS[activeCrop.crop_type] || "🌱"} {activeCrop.crop_type}
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* System status */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`w-2 h-2 rounded-full ${sseStatus === "online" ? "status-dot-live" : ""}`}
          style={{
            background: sseStatus === "online" ? "var(--primary)" : sseStatus === "connecting" ? "var(--warn)" : "var(--danger)",
          }}
        />
        <span style={{ color: sseStatus === "online" ? "var(--primary)" : "#8B9CC3" }}>
          {sseStatus === "online" ? "System Online" : sseStatus === "connecting" ? "Connecting..." : "Sensor Offline"}
        </span>
      </div>

      <span className="text-xs" style={{ color: "#4B5A7A" }}>Last sync: {syncLabel}</span>

      {/* Alert bell */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setShowNotifs((v) => !v)}
          className="relative p-1 rounded-lg hover:opacity-80 transition-opacity"
          style={{ background: showNotifs ? "var(--bg-elevated)" : "transparent" }}
          title="Notifications"
        >
          <Bell size={18} style={{ color: activeAlerts.length > 0 ? "var(--warn)" : "#4B5A7A" }} />
          {activeAlerts.length > 0 && (
            <span
              className="absolute -top-1 -right-1 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center pointer-events-none"
              style={{ background: "var(--danger)", color: "#fff", fontSize: 10 }}
            >
              {activeAlerts.length > 9 ? "9+" : activeAlerts.length}
            </span>
          )}
        </button>

        {showNotifs && (
          <div
            className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="font-semibold text-sm" style={{ color: "#F1F5F9" }}>
                Notifications {activeAlerts.length > 0 && <span style={{ color: "#4B5A7A" }}>({activeAlerts.length})</span>}
              </p>
              <button onClick={() => setShowNotifs(false)}>
                <X size={14} style={{ color: "#4B5A7A" }} />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {activeAlerts.length === 0 ? (
                <p className="text-sm px-4 py-4" style={{ color: "#4B5A7A" }}>No active alerts</p>
              ) : (
                activeAlerts.slice(0, 10).map((a) => {
                  const Icon = ALERT_ICONS[a.severity] || Info;
                  return (
                    <div key={a.id || a.timestamp} className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <Icon size={14} style={{ color: ALERT_COLORS[a.severity] || "#60A5FA", flexShrink: 0, marginTop: 2 }} />
                      <div className="min-w-0">
                        <p className="text-xs leading-snug" style={{ color: "#F1F5F9" }}>{a.message || a.condition}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#4B5A7A" }}>
                          {a.timestamp ? formatDistanceToNow(new Date(a.timestamp), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {activeAlerts.length > 10 && (
              <p className="text-xs px-4 py-2 text-center" style={{ color: "#4B5A7A" }}>+{activeAlerts.length - 10} more</p>
            )}
          </div>
        )}
      </div>

      {/* Mock Sensors toggle */}
      <button
        onClick={handleMockToggle}
        disabled={mockLoading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
        style={mockEnabled
          ? { background: "rgba(0,214,143,0.12)", color: "var(--primary)", border: "1px solid rgba(0,214,143,0.4)" }
          : { background: "var(--bg-elevated)", color: "#8B9CC3", border: "1px solid var(--border)" }
        }
        title={mockEnabled ? "Mock sensors running — click to stop" : "Start mock sensor data (1 reading/rack/s)"}
      >
        {mockEnabled
          ? <ToggleRight size={15} style={{ color: "var(--primary)" }} />
          : <ToggleLeft size={15} />
        }
        Mock Sensors
        {mockEnabled && (
          <span
            className="w-1.5 h-1.5 rounded-full status-dot-live"
            style={{ background: "var(--primary)", flexShrink: 0 }}
          />
        )}
      </button>
    </header>
  );
}
