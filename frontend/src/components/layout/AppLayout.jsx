import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useSensorSSE } from "../../hooks/useSensorSSE";
import { useFarmStore } from "../../store/farmStore";
import { api } from "../../lib/api";

export default function AppLayout() {
  useSensorSSE();

  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const setActiveCrop = useFarmStore((s) => s.setActiveCrop);
  const setActiveAlerts = useFarmStore((s) => s.setActiveAlerts);
  const setLatest = useFarmStore((s) => s.setLatest);
  const setRacks = useFarmStore((s) => s.setRacks);
  const setRackOverview = useFarmStore((s) => s.setRackOverview);
  const setRackOverviewLoaded = useFarmStore((s) => s.setRackOverviewLoaded);
  const clearHistory = useFarmStore((s) => s.clearHistory);
  const mockEnabled = useFarmStore((s) => s.mockEnabled);
  const setMockEnabled = useFarmStore((s) => s.setMockEnabled);
  const setCropParams = useFarmStore((s) => s.setCropParams);

  // Bootstrap per-rack data when selected rack changes — independent fetches so
  // one failure never blocks the others (avoids Promise.all short-circuit)
  useEffect(() => {
    clearHistory();
    api.crops.active(selectedFarmId).then(setActiveCrop).catch(() => {});
    api.alerts.active(selectedFarmId).then((a) => setActiveAlerts(a || [])).catch(() => {});
    api.sensors.latest(selectedFarmId).then((l) => { if (l?.timestamp) setLatest(l); }).catch(() => {});
  }, [selectedFarmId]);

  // Bootstrap rack list + sync mock status + crop params (static) on mount
  useEffect(() => {
    api.racks.list().then(setRacks).catch(() => {});
    api.sensors.mockStatus().then((s) => setMockEnabled(s.mock_enabled)).catch(() => {});
    api.crops.params().then(setCropParams).catch(() => {});
  }, []);

  // Poll rack overview — 1s when mock is ON, 30s otherwise
  const overviewRef = useRef(null);
  useEffect(() => {
    function fetchOverview() {
      api.racks.overview()
        .then(setRackOverview)
        .catch(() => { setRackOverviewLoaded(true); });
    }
    fetchOverview();
    const interval = mockEnabled ? 1000 : 30000;
    overviewRef.current = setInterval(fetchOverview, interval);
    return () => clearInterval(overviewRef.current);
  }, [mockEnabled]);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header />
        <main className="mt-14 p-6 min-h-[calc(100vh-56px)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
