const BASE = "";

async function get(path, params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  const qs = entries.length ? "?" + new URLSearchParams(entries).toString() : "";
  const res = await fetch(BASE + path + qs);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function put(path, body) {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function del(path) {
  const res = await fetch(BASE + path, { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const api = {
  sensors: {
    latest: (farmId = "RACK_ALPHA") => get("/api/sensors/latest", { farm_id: farmId }),
    history: (hours = 24, farmId = "RACK_ALPHA") => get("/api/sensors/history", { hours, farm_id: farmId }),
    stats: (hours = 24, farmId = "RACK_ALPHA") => get("/api/sensors/stats", { hours, farm_id: farmId }),
    postReading: (data) => post("/api/sensors/readings", data),
    mockToggle: () => post("/api/sensors/mock/toggle", {}),
    mockStatus: () => get("/api/sensors/mock/status"),
    getImage: (farmId = "RACK_ALPHA") => get(`/api/sensors/image/${farmId}`),
  },
  ml: {
    yieldPredict: (data) => post("/api/ml/yield-predict", data),
    diseaseRisk: (data) => post("/api/ml/disease-risk", data),
    healthScore: (farmId = "RACK_ALPHA") => get("/api/ml/health-score", { farm_id: farmId }),
    harvestDays: (farmId = "RACK_ALPHA") => get("/api/ml/harvest-days", { farm_id: farmId }),
    featureImportance: () => get("/api/ml/feature-importance"),
    datasetStats: (crop) => get(`/api/ml/dataset-stats/${crop}`),
    recommendations: (farmId = "RACK_ALPHA") => get("/api/ml/recommendations", { farm_id: farmId }),
  },
  crops: {
    active: (farmId = "RACK_ALPHA") => get("/api/crops/active", { farm_id: farmId }),
    setActive: (data) => put("/api/crops/active", data),
    params: () => get("/api/crops/params"),
  },
  automation: {
    rules: (farmId = "RACK_ALPHA") => get("/api/automation/rules", { farm_id: farmId }),
    createRule: (data) => post("/api/automation/rules", data),
    updateRule: (id, data) => put(`/api/automation/rules/${id}`, data),
    deleteRule: (id) => del(`/api/automation/rules/${id}`),
    irrigate: (data) => post("/api/automation/irrigate", data),
    stopIrrigate: () => post("/api/automation/irrigate/stop", {}),
    irrigationStatus: () => get("/api/automation/irrigate/status"),
    irrigationHistory: (farmId = "RACK_ALPHA") => get("/api/automation/irrigation-history", { farm_id: farmId }),
    getEvents: (farmId = "RACK_ALPHA", limit = 50) => get("/api/automation/events", { farm_id: farmId, limit }),
    getEnvironmentalImpact: (farmId = "RACK_ALPHA") => get("/api/automation/environmental-impact", { farm_id: farmId }),
  },
  alerts: {
    list: (params = {}) => get("/api/alerts/", params),
    active: (farmId = "RACK_ALPHA") => get("/api/alerts/active", { farm_id: farmId }),
    acknowledge: (id) => put(`/api/alerts/${id}/acknowledge`, {}),
    acknowledgeAll: (farmId = "RACK_ALPHA") => post(`/api/alerts/acknowledge-all?farm_id=${farmId}`, {}),
    thresholds: (farmId = "RACK_ALPHA") => get("/api/alerts/thresholds", { farm_id: farmId }),
    updateThreshold: (data) => put("/api/alerts/thresholds", data),
  },
  reports: {
    summary: (hours = 24, farmId = "RACK_ALPHA") => get("/api/reports/summary", { hours, farm_id: farmId }),
    pdf: (hours = 24, farmId = "RACK_ALPHA") => `${BASE}/api/reports/pdf?hours=${hours}&farm_id=${farmId}`,
  },
  ai: {
    chat: async (message, history, farmId = "RACK_ALPHA") => {
      const res = await fetch(BASE + "/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, farm_id: farmId }),
      });
      return res;  // streaming response — caller reads body
    },
  },
  racks: {
    list: () => get("/api/racks"),
    overview: () => get("/api/racks/overview"),
    create: (data) => post("/api/racks", data),
    update: (farmId, data) => put(`/api/racks/${farmId}`, data),
    remove: (farmId) => del(`/api/racks/${farmId}`),
  },
};

export const SSE_URL = `${BASE}/api/sensors/stream`;
