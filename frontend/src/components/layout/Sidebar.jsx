import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Activity, Sprout, Sparkles, Settings2,
  Bell, FileText, Settings,
} from "lucide-react";
import { useFarmStore } from "../../store/farmStore";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/monitor", icon: Activity, label: "Live Monitor" },
  { to: "/crops", icon: Sprout, label: "Crop Manager" },
  { to: "/ai", icon: Sparkles, label: "AI Insights", accent: true },
  { to: "/automation", icon: Settings2, label: "Automation" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/reports", icon: FileText, label: "Reports" },
];

export default function Sidebar() {
  const activeAlerts = useFarmStore((s) => s.activeAlerts);
  const alertCount = activeAlerts.length;

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-60 flex flex-col"
      style={{ background: "var(--bg-card)", borderRight: "1px solid var(--border)", zIndex: 50 }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-5 gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
          <Sprout size={16} color="#0B0E1A" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-base" style={{ color: "#F1F5F9" }}>AgroSync</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, accent }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-sm font-medium relative
               ${isActive
                 ? "bg-bg-elevated"
                 : "hover:bg-bg-elevated/50"
               }`
            }
            style={({ isActive }) => ({
              color: isActive
                ? (accent ? "var(--accent)" : "var(--primary)")
                : (accent ? "var(--accent)" : "#8B9CC3"),
              borderLeft: isActive ? `2px solid ${accent ? "var(--accent)" : "var(--primary)"}` : "2px solid transparent",
            })}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {label === "Alerts" && alertCount > 0 && (
              <span
                className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full tabular"
                style={{ background: "var(--danger)", color: "#fff", minWidth: 20, textAlign: "center" }}
              >
                {alertCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: "1px solid var(--border)" }} className="py-3 px-2">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ color: "#8B9CC3" }}
        >
          <Settings size={18} strokeWidth={1.8} />
          Settings
        </NavLink>
        <div className="flex items-center gap-3 px-3 py-2.5 text-sm" style={{ color: "#8B9CC3" }}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: "var(--bg-elevated)", color: "var(--primary)" }}
          >
            A
          </div>
          <span>Admin</span>
        </div>
      </div>
    </aside>
  );
}
