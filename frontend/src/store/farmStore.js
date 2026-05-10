import { create } from "zustand";

export const useFarmStore = create((set, get) => ({
  // Selected rack (active for detail view)
  selectedFarmId: "RACK_ALPHA",
  setSelectedFarmId: (id) => set({ selectedFarmId: id }),

  // All racks list
  racks: [],
  setRacks: (racks) => set({ racks }),

  // Overview data for all racks (polled every 30s)
  rackOverview: [],
  rackOverviewLoaded: false,
  setRackOverview: (data) => set({ rackOverview: data, rackOverviewLoaded: true }),
  setRackOverviewLoaded: (v) => set({ rackOverviewLoaded: v }),

  // Latest sensor reading for the selected rack
  latest: null,
  setLatest: (reading) => set({ latest: reading }),

  // SSE connection status
  sseStatus: "connecting",  // connecting | online | offline
  lastSyncSecs: 0,
  setSseStatus: (s) => set({ sseStatus: s }),
  setLastSyncSecs: (n) => set({ lastSyncSecs: n }),

  // Active crop for the selected rack
  activeCrop: null,
  setActiveCrop: (crop) => set({ activeCrop: crop }),

  // Health score for the selected rack
  healthScore: null,
  setHealthScore: (hs) => set({ healthScore: hs }),

  // Active alerts for the selected rack
  activeAlerts: [],
  setActiveAlerts: (alerts) => set({ activeAlerts: alerts }),
  addAlert: (alert) => set((s) => ({
    activeAlerts: [alert, ...s.activeAlerts].slice(0, 20),
  })),
  removeAlert: (id) => set((s) => ({
    activeAlerts: s.activeAlerts.filter((a) => a.id !== id),
  })),

  // Mock sensors mode
  mockEnabled: false,
  setMockEnabled: (v) => set({ mockEnabled: v }),

  // Irrigation state for the selected rack
  irrigationRunning: false,
  setIrrigationRunning: (v) => set({ irrigationRunning: v }),

  // History buffer for live charts (last 120 readings of selected rack)
  historyBuffer: [],
  pushReading: (reading) => set((s) => ({
    historyBuffer: [...s.historyBuffer, reading].slice(-120),
  })),
  clearHistory: () => set({ historyBuffer: [] }),

  // Rack camera image and Roboflow analysis
  latestImage: null,
  setLatestImage: (img) => set({ latestImage: img }),
  imageAnalysis: null,
  setImageAnalysis: (analysis) => set({ imageAnalysis: analysis }),

  // Crop params for all crop types (static reference data from /api/crops/params)
  cropParams: {},
  setCropParams: (params) => set({ cropParams: params }),
}));
