export function Badge({ children, color = "primary", size = "sm" }) {
  const colors = {
    primary: { bg: "rgba(0,214,143,0.13)", text: "var(--primary)" },
    accent:  { bg: "rgba(124,58,237,0.13)", text: "var(--accent)" },
    warn:    { bg: "rgba(245,158,11,0.13)", text: "var(--warn)" },
    danger:  { bg: "rgba(239,68,68,0.13)",  text: "var(--danger)" },
    muted:   { bg: "rgba(75,90,122,0.2)",   text: "#8B9CC3" },
    none:    { bg: "rgba(0,214,143,0.13)",  text: "var(--primary)" },
    mild:    { bg: "rgba(245,158,11,0.13)", text: "var(--warn)" },
    moderate:{ bg: "rgba(239,120,68,0.13)", text: "#F97316" },
    severe:  { bg: "rgba(239,68,68,0.13)",  text: "var(--danger)" },
  };
  const c = colors[color?.toLowerCase()] || colors.primary;
  const px = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${px}`}
      style={{ background: c.bg, color: c.text }}
    >
      {children}
    </span>
  );
}

export function Diseasebadge({ status }) {
  return <Badge color={status?.toLowerCase() || "none"}>{status || "None"}</Badge>;
}

export function SeverityBadge({ severity }) {
  const map = { Critical: "danger", Warning: "warn", Info: "muted" };
  return <Badge color={map[severity] || "muted"}>{severity}</Badge>;
}
