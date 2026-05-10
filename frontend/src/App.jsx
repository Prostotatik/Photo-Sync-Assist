import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import LiveMonitor from "./pages/LiveMonitor";
import CropManager from "./pages/CropManager";
import AIInsights from "./pages/AIInsights";
import Automation from "./pages/Automation";
import Alerts from "./pages/Alerts";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="monitor" element={<LiveMonitor />} />
          <Route path="crops" element={<CropManager />} />
          <Route path="ai" element={<AIInsights />} />
          <Route path="automation" element={<Automation />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
