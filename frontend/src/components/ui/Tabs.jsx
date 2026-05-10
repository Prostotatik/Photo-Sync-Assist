import { useState } from "react";

export function Tabs({ tabs, children, defaultTab }) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key);

  return (
    <div>
      <div
        className="flex gap-1 mb-6"
        style={{ borderBottom: "1px solid var(--border)", paddingBottom: 0 }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all"
            style={{
              color: active === t.key ? (t.accent ? "var(--accent)" : "var(--primary)") : "#8B9CC3",
              borderBottom: active === t.key ? `2px solid ${t.accent ? "var(--accent)" : "var(--primary)"}` : "2px solid transparent",
              background: "transparent",
              marginBottom: -1,
            }}
          >
            {t.icon && <span>{t.icon}</span>}
            {t.label}
          </button>
        ))}
      </div>
      {children(active)}
    </div>
  );
}
