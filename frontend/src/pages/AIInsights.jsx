import { useState, useEffect, useRef } from "react";
import { Send, RefreshCw, Sparkles, TrendingUp, ShieldAlert, Lightbulb, Droplet } from "lucide-react";
import { useFarmStore } from "../store/farmStore";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Tabs } from "../components/ui/Tabs";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

const CHART_OPTS = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: "#4B5A7A" }, grid: { color: "#252A3D" } },
    y: { ticks: { color: "#4B5A7A" }, grid: { color: "#252A3D" } },
  },
};

// ─── AI Chat ─────────────────────────────────────────────────────────────────
function AIChat() {
  const latest = useFarmStore((s) => s.latest);
  const activeCrop = useFarmStore((s) => s.activeCrop);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const messages = useFarmStore((s) => s.chatMessages);
  const setMessages = useFarmStore((s) => s.setChatMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [harvestDays, setHarvestDays] = useState(null);
  const [yieldPrediction, setYieldPrediction] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.ml.harvestDays(selectedFarmId).then(setHarvestDays).catch(() => {});
  }, [selectedFarmId]);

  useEffect(() => {
    if (!latest || !activeCrop) return;
    const sunlight = latest.light_pct != null
      ? (latest.light_pct / 100) * 12
      : (activeCrop.sunlight_hours || 7);
    api.ml.yieldPredict({
      crop_type: activeCrop.crop_type,
      soil_moisture: latest.soil_moisture_pct,
      soil_ph: latest.ph_level,
      temperature: latest.temperature_c,
      water_mm: activeCrop.water_mm,
      humidity: latest.humidity_pct,
      sunlight_hours: sunlight,
      total_days: activeCrop.elapsed_days,
    }).then(setYieldPrediction).catch(() => {});
    api.ml.harvestDays(selectedFarmId).then(setHarvestDays).catch(() => {});
  }, [latest, activeCrop]);

  const QUICK_QUESTIONS = [
    "What's the current health status of my crop and what should I do?",
    "My pH is critical — what corrective action should I take?",
    "How can I maximize yield given current conditions?",
    "Is there any disease risk I should be worried about right now?",
  ];

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const assistantMsg = { role: "assistant", content: "" };
    setMessages((m) => [...m, assistantMsg]);

    try {
      const res = await api.ai.chat(text, messages.slice(-10));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value);
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "AI service unavailable. Please check your Gemini API key." };
        return copy;
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasAction = messages.at(-1)?.content?.includes("ACTION:");

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 280px" }}>
      {/* Chat */}
      <div className="card flex flex-col" style={{ height: 600 }}>
        <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <Sparkles size={18} style={{ color: "var(--accent)" }} />
          <span className="font-semibold" style={{ color: "#F1F5F9" }}>Photo-Sync-Assist AI</span>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: "var(--accent-dim, rgba(124,58,237,0.13))", color: "var(--accent)" }}>
            Gemini 2.5 Flash Lite
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.length === 0 && (
            <div>
              <p className="text-sm mb-4" style={{ color: "#8B9CC3" }}>
                Hello! I have access to your live sensor data. Ask me anything about your farm's health, yield optimization, or what to do next.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left px-3 py-2.5 rounded-lg text-xs hover:opacity-80 transition-all"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#8B9CC3" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  background: m.role === "user" ? "var(--primary)" : "var(--bg-elevated)",
                  color: m.role === "user" ? "#0B0E1A" : "#F1F5F9",
                  borderTopRightRadius: m.role === "user" ? 4 : undefined,
                  borderTopLeftRadius: m.role === "assistant" ? 4 : undefined,
                }}
              >
                {m.role === "assistant" && <span className="text-xs font-semibold block mb-1.5" style={{ color: "var(--accent)" }}>✦ Photo-Sync-Assist AI</span>}
                {m.content || (loading && i === messages.length - 1 ? "..." : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Apply action button */}
        {hasAction && (
          <div className="py-2">
            <Button size="sm" onClick={() => api.automation.irrigate({ duration_minutes: 10, trigger: "Manual" })} icon={<Droplet size={13} />}>
              Apply Recommendation
            </Button>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Type your question..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "#F1F5F9" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-xl transition-all disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Context sidebar */}
      <div className="card" style={{ height: "fit-content" }}>
        <p className="text-xs font-semibold mb-3" style={{ color: "#4B5A7A" }}>LIVE CONTEXT</p>
        <div className="space-y-2 text-xs">
          {[
            { label: "Crop", value: activeCrop?.crop_type || "—" },
            { label: "Temperature", value: latest?.temperature_c != null ? `${latest.temperature_c.toFixed(1)}°C` : "—" },
            { label: "Humidity", value: latest?.humidity_pct != null ? `${latest.humidity_pct.toFixed(1)}%` : "—" },
            { label: "Soil Moisture", value: latest?.soil_moisture_pct != null ? `${latest.soil_moisture_pct.toFixed(1)}%` : "—" },
            { label: "pH Level", value: latest?.ph_level != null ? latest.ph_level.toFixed(2) : "—" },
            { label: "Light", value: latest?.light_pct != null ? `${latest.light_pct.toFixed(1)}%` : "—" },
            { label: "Sowing Date", value: activeCrop?.sowing_date ? activeCrop.sowing_date.slice(0, 10) : "—" },
            {
              label: "Pred. Harvest",
              value: (() => {
                if (!activeCrop?.sowing_date || !harvestDays?.predicted_days) return "—";
                const d = new Date(activeCrop.sowing_date);
                d.setDate(d.getDate() + harvestDays.predicted_days);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              })(),
            },
            { label: "Pred. Yield", value: yieldPrediction ? `${yieldPrediction.yield_kg_ha.toLocaleString()} kg/ha` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-2">
              <span style={{ color: "#4B5A7A" }}>{label}</span>
              <span className="font-medium tabular text-right" style={{ color: "#F1F5F9" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Yield Prediction ─────────────────────────────────────────────────────────
function YieldPrediction() {
  const latest = useFarmStore((s) => s.latest);
  const activeCrop = useFarmStore((s) => s.activeCrop);

  const [sliders, setSliders] = useState({
    soil_moisture: 30, temperature: 24, humidity: 65, sunlight_hours: 7, water_mm: 150,
  });
  const [prediction, setPrediction] = useState(null);
  const [featureImportance, setFeatureImportance] = useState([]);
  const [datasetStats, setDatasetStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (latest) {
      setSliders({
        soil_moisture: latest.soil_moisture_pct || 30,
        temperature: latest.temperature_c || 24,
        humidity: latest.humidity_pct || 65,
        sunlight_hours: activeCrop?.sunlight_hours || 7,
        water_mm: activeCrop?.water_mm || 150,
      });
    }
  }, [latest, activeCrop]);

  useEffect(() => {
    api.ml.featureImportance().then(setFeatureImportance).catch(() => {});
    if (activeCrop?.crop_type) {
      api.ml.datasetStats(activeCrop.crop_type).then(setDatasetStats).catch(() => {});
    }
  }, [activeCrop?.crop_type]);

  useEffect(() => {
    runPrediction();
  }, [sliders, activeCrop]);

  async function runPrediction() {
    if (!activeCrop) return;
    setLoading(true);
    try {
      const res = await api.ml.yieldPredict({
        crop_type: activeCrop.crop_type,
        soil_moisture: sliders.soil_moisture,
        soil_ph: latest?.ph_level,
        temperature: sliders.temperature,
        water_mm: sliders.water_mm,
        humidity: sliders.humidity,
        sunlight_hours: sliders.sunlight_hours,
        total_days: activeCrop.elapsed_days,
      });
      setPrediction(res);
    } catch {}
    setLoading(false);
  }

  const avgYield = datasetStats?.yield_mean || 4000;
  const topYield = datasetStats?.yield_p75 || 5200;
  const rank = prediction
    ? (prediction.yield_kg_ha > topYield ? "Top 25%" : prediction.yield_kg_ha > avgYield ? "Above Average" : "Below Average")
    : "—";

  const SLIDER_CONFIG = [
    { key: "soil_moisture", label: "Soil Moisture", min: 10, max: 45, unit: "%" },
    { key: "temperature", label: "Temperature", min: 15, max: 35, unit: "°C" },
    { key: "humidity", label: "Humidity", min: 40, max: 90, unit: "%" },
    { key: "sunlight_hours", label: "Sunlight Hours", min: 4, max: 10, unit: "h" },
    { key: "water_mm", label: "Water (mm)", min: 60, max: 300, unit: "mm" },
  ];

  const importanceData = {
    labels: featureImportance.slice(0, 6).map((f) => f.name),
    datasets: [{
      data: featureImportance.slice(0, 6).map((f) => (f.importance * 100).toFixed(1)),
      backgroundColor: ["#00D68F", "#7C3AED", "#F97316", "#60A5FA", "#F59E0B", "#A78BFA"],
      borderRadius: 6,
    }],
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="card text-center" style={{ borderColor: "var(--primary)", borderWidth: 2 }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#4B5A7A" }}>
          Predicted Yield — {activeCrop?.crop_type || "—"}
        </p>
        <p className="tabular font-bold" style={{ fontSize: 56, color: "var(--primary)", lineHeight: 1 }}>
          {loading ? "..." : prediction?.yield_kg_ha?.toLocaleString() ?? "—"}
          <span className="text-2xl font-normal ml-2" style={{ color: "#8B9CC3" }}>kg/ha</span>
        </p>
        {prediction && (
          <p className="text-sm mt-2" style={{ color: "#8B9CC3" }}>
            Confidence: {prediction.confidence_low?.toFixed(0).toLocaleString()} – {prediction.confidence_high?.toFixed(0).toLocaleString()} kg/ha
          </p>
        )}
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <span style={{ color: "#8B9CC3" }}>Dataset avg: <strong style={{ color: "#F1F5F9" }}>{avgYield.toFixed(0)} kg/ha</strong></span>
          <span style={{ color: "#8B9CC3" }}>You are: <strong style={{ color: "var(--primary)" }}>{rank} ↑</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Sliders */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold" style={{ color: "#F1F5F9" }}>What-if Simulator</h3>
            <button
              onClick={() => latest && setSliders({ soil_moisture: latest.soil_moisture_pct, temperature: latest.temperature_c, humidity: latest.humidity_pct, sunlight_hours: 7, water_mm: 150 })}
              className="text-xs flex items-center gap-1"
              style={{ color: "var(--primary)" }}
            >
              <RefreshCw size={12} /> Reset
            </button>
          </div>
          <div className="space-y-4">
            {SLIDER_CONFIG.map(({ key, label, min, max, unit }) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "#8B9CC3" }}>
                  <span>{label}</span>
                  <span className="tabular font-medium" style={{ color: "var(--primary)" }}>
                    {sliders[key]}{unit}
                  </span>
                </div>
                <input
                  type="range" min={min} max={max} step={key === "sunlight_hours" ? 0.5 : 1}
                  value={sliders[key]}
                  onChange={(e) => setSliders((s) => ({ ...s, [key]: parseFloat(e.target.value) }))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${((sliders[key] - min) / (max - min)) * 100}%, var(--bg-elevated) ${((sliders[key] - min) / (max - min)) * 100}%, var(--bg-elevated) 100%)` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Feature importance */}
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>What Affects Yield Most</h3>
          {featureImportance.length > 0 ? (
            <Bar data={importanceData} options={{ ...CHART_OPTS, indexAxis: "y" }} />
          ) : (
            <p className="text-sm" style={{ color: "#4B5A7A" }}>Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Disease Risk ─────────────────────────────────────────────────────────────
function DiseaseRisk() {
  const latest = useFarmStore((s) => s.latest);
  const activeCrop = useFarmStore((s) => s.activeCrop);
  const [risk, setRisk] = useState(null);
  const [datasetStats, setDatasetStats] = useState(null);

  useEffect(() => {
    if (latest && activeCrop) {
      api.ml.diseaseRisk({
        crop_type: activeCrop.crop_type,
        soil_moisture: latest.soil_moisture_pct || 30,
        soil_ph: latest.ph_level || 6.5,
        temperature: latest.temperature_c || 24,
        water_mm: activeCrop.water_mm || 150,
        humidity: latest.humidity_pct || 65,
        sunlight_hours: activeCrop.sunlight_hours || 7,
        total_days: activeCrop.elapsed_days,
      }).then(setRisk).catch(() => {});
    }
    if (activeCrop?.crop_type) {
      api.ml.datasetStats(activeCrop.crop_type).then(setDatasetStats).catch(() => {});
    }
  }, [latest, activeCrop]);

  const RISK_LEVELS = ["None", "Mild", "Moderate", "Severe"];
  const RISK_COLORS = { None: "var(--primary)", Mild: "var(--warn)", Moderate: "#F97316", Severe: "var(--danger)" };
  const RISK_IDX = RISK_LEVELS.indexOf(risk?.risk || "None");

  const diseaseData = datasetStats?.disease_dist ? {
    labels: Object.keys(datasetStats.disease_dist),
    datasets: [{
      data: Object.values(datasetStats.disease_dist).map((v) => (v * 100).toFixed(1)),
      backgroundColor: ["#00D68F", "#F59E0B", "#F97316", "#EF4444"],
      borderWidth: 0,
    }],
  } : null;

  return (
    <div className="space-y-5">
      {/* Risk gauge */}
      <div className="card">
        <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Disease Risk Assessment</h3>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs mb-1" style={{ color: "#4B5A7A" }}>Current Risk Level</p>
            <p className="font-bold text-3xl" style={{ color: RISK_COLORS[risk?.risk] || "#8B9CC3" }}>
              {risk?.risk || "—"}
            </p>
          </div>
          {/* Segmented bar */}
          <div className="flex-1">
            <div className="flex gap-1 h-4">
              {RISK_LEVELS.map((level, idx) => (
                <div
                  key={level}
                  className="flex-1 rounded"
                  style={{
                    background: idx <= RISK_IDX ? RISK_COLORS[level] : "var(--bg-elevated)",
                    opacity: idx === RISK_IDX ? 1 : (idx < RISK_IDX ? 0.5 : 0.3),
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs mt-1" style={{ color: "#4B5A7A" }}>
              {RISK_LEVELS.map((l) => <span key={l}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Risk factors */}
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Risk Factor Breakdown</h3>
          <div className="space-y-3">
            {[
              { label: "Humidity", value: latest?.humidity_pct, warn: 85, unit: "%", desc: "High humidity increases fungal risk" },
              { label: "Temperature", value: latest?.temperature_c, warn: 32, unit: "°C", desc: "Within optimal range" },
              { label: "Soil Moisture", value: latest?.soil_moisture_pct, warnLow: 15, unit: "%", desc: "Within optimal range" },
            ].map(({ label, value, warn, warnLow, unit, desc }) => {
              const isHigh = warn && value > warn;
              const isLow = warnLow && value < warnLow;
              const c = isHigh || isLow ? "var(--warn)" : "var(--primary)";
              return (
                <div key={label} className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm" style={{ color: "#F1F5F9" }}>{label}</span>
                    <span className="text-sm tabular" style={{ color: c }}>{value?.toFixed(1) ?? "—"}{unit}</span>
                  </div>
                  <p className="text-xs" style={{ color: "#4B5A7A" }}>{desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Probability chart */}
        <div className="card">
          <h3 className="font-semibold mb-4" style={{ color: "#F1F5F9" }}>Disease Probability Distribution</h3>
          {risk?.probabilities && (
            <div className="space-y-2">
              {Object.entries(risk.probabilities).map(([status, prob]) => (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: "#8B9CC3" }}>
                    <span>{status}</span>
                    <span className="tabular">{(prob * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "var(--bg-elevated)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${prob * 100}%`, background: RISK_COLORS[status] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {diseaseData && (
            <div className="mt-4">
              <p className="text-xs mb-2" style={{ color: "#4B5A7A" }}>Dataset distribution for {activeCrop?.crop_type}</p>
              <Doughnut data={diseaseData} options={{ plugins: { legend: { position: "bottom", labels: { color: "#8B9CC3", padding: 8, font: { size: 11 } } } } }} />
            </div>
          )}
        </div>
      </div>

      {/* Prevention tips */}
      <div className="card">
        <h3 className="font-semibold mb-3" style={{ color: "#F1F5F9" }}>Preventive Actions</h3>
        <ul className="space-y-2 text-sm" style={{ color: "#8B9CC3" }}>
          <li>• Monitor humidity — keep below 80% to minimize fungal risk (~15% reduction)</li>
          <li>• Ensure adequate airflow between rack layers to prevent moisture buildup</li>
          <li>• Inspect leaves every 3 days for early signs of spotting or discoloration</li>
          <li>• Avoid overwatering — soil moisture above 42% promotes root disease</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Recommendations ──────────────────────────────────────────────────────────
function Recommendations() {
  const [recs, setRecs] = useState([]);
  const [weekPlan, setWeekPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    api.ml.recommendations().then(setRecs).catch(() => {});
  }, []);

  async function generateWeekPlan() {
    setPlanLoading(true);
    setWeekPlan(null);
    try {
      const res = await api.ai.chat(
        "Generate a detailed 7-day farming action plan for my current crop conditions. Format as Day 1:, Day 2:, etc.",
        [],
      );
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setWeekPlan(text);
      }
    } catch { setWeekPlan("Unable to generate plan."); }
    setPlanLoading(false);
  }

  const PRIORITY_COLORS = { HIGH: "var(--danger)", MEDIUM: "var(--warn)", LOW: "var(--primary)" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: "#F1F5F9" }}>AI Recommendations</h3>
        <Button
          variant="accent"
          onClick={generateWeekPlan}
          disabled={planLoading}
          icon={<Sparkles size={14} />}
          size="sm"
        >
          {planLoading ? "Generating..." : "Generate Week Plan"}
        </Button>
      </div>

      {recs.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-sm" style={{ color: "#4B5A7A" }}>All parameters within optimal range — no urgent recommendations.</p>
        </div>
      )}

      {recs.map((rec, i) => (
        <div key={i} className="card" style={{ borderLeft: `3px solid ${PRIORITY_COLORS[rec.priority] || "var(--border)"}` }}>
          <div className="flex items-start gap-3">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 mt-0.5"
              style={{ background: `${PRIORITY_COLORS[rec.priority]}20`, color: PRIORITY_COLORS[rec.priority] }}
            >
              {rec.priority}
            </span>
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: "#F1F5F9" }}>{rec.title}</p>
              <p className="text-xs mt-1" style={{ color: "#8B9CC3" }}>{rec.description}</p>
              <div className="flex gap-4 mt-2 text-xs" style={{ color: "#4B5A7A" }}>
                {rec.yield_impact_pct && <span>Yield impact: <span style={{ color: "var(--primary)" }}>+{rec.yield_impact_pct}%</span></span>}
                {rec.resource && <span>Resource: {rec.resource}</span>}
                {rec.duration_min && <span>⏱ {rec.duration_min} min</span>}
              </div>
            </div>
            {rec.action === "irrigate" && (
              <Button
                size="sm"
                onClick={() => api.automation.irrigate({ duration_minutes: rec.action_value || 10, trigger: "Manual" })}
                icon={<Droplet size={12} />}
              >
                Apply
              </Button>
            )}
          </div>
        </div>
      ))}

      {weekPlan && (
        <div className="card" style={{ borderColor: "var(--accent)", borderWidth: 1 }}>
          <p className="text-xs font-semibold mb-3" style={{ color: "var(--accent)" }}>✦ 7-Day Action Plan</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#F1F5F9" }}>{weekPlan}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AIInsights() {
  const TABS = [
    { key: "chat", label: "AI Assistant", icon: <Sparkles size={14} />, accent: true },
    { key: "yield", label: "Yield Prediction", icon: <TrendingUp size={14} /> },
    { key: "disease", label: "Disease Risk", icon: <ShieldAlert size={14} /> },
    { key: "recommendations", label: "Recommendations", icon: <Lightbulb size={14} /> },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold" style={{ color: "#F1F5F9" }}>AI Insights</h1>
        <span
          className="text-xs px-3 py-1 rounded-full font-medium"
          style={{ background: "var(--accent-dim, rgba(124,58,237,0.13))", color: "var(--accent)" }}
        >
          Powered by Gemini 2.5 Flash Lite + scikit-learn ML
        </span>
      </div>

      <Tabs tabs={TABS}>
        {(active) => {
          if (active === "chat") return <AIChat />;
          if (active === "yield") return <YieldPrediction />;
          if (active === "disease") return <DiseaseRisk />;
          return <Recommendations />;
        }}
      </Tabs>
    </div>
  );
}
