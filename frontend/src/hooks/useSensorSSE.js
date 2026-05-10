import { useEffect, useRef } from "react";
import { SSE_URL } from "../lib/api";
import { useFarmStore } from "../store/farmStore";

export function useSensorSSE() {
  const esRef = useRef(null);
  const timerRef = useRef(null);
  const store = useFarmStore();
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  useEffect(() => {
    let syncSecs = 0;

    function connect() {
      if (esRef.current) esRef.current.close();
      store.setSseStatus("connecting");

      const url = `${SSE_URL}?farm_id=${encodeURIComponent(selectedFarmId)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        store.setSseStatus("online");
        syncSecs = 0;
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "ping") return;

          if (data.type === "reading") {
            if (data.farm_id && data.farm_id !== selectedFarmId) return;
            store.setLatest(data);
            store.pushReading(data);
            store.setLastSyncSecs(0);
            syncSecs = 0;
          }

          if (data.type === "alert") {
            store.addAlert(data);
          }

          if (data.type === "irrigation_start") {
            store.setIrrigationRunning(true);
          }

          if (data.type === "irrigation_stop") {
            store.setIrrigationRunning(false);
          }
        } catch {}
      };

      es.onerror = () => {
        store.setSseStatus("offline");
        store.setLatest(null);
        es.close();
        setTimeout(connect, 5000);
      };
    }

    connect();

    timerRef.current = setInterval(() => {
      syncSecs++;
      store.setLastSyncSecs(syncSecs);
    }, 1000);

    return () => {
      esRef.current?.close();
      clearInterval(timerRef.current);
    };
  }, [selectedFarmId]);
}
