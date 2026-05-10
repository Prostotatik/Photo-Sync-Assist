export function Button({ children, onClick, variant = "primary", size = "md", disabled, className = "", icon }) {
  const variants = {
    primary: { background: "var(--primary)", color: "#0B0E1A", border: "none" },
    secondary: { background: "var(--bg-elevated)", color: "#F1F5F9", border: "1px solid var(--border)" },
    danger: { background: "rgba(239,68,68,0.15)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)" },
    ghost: { background: "transparent", color: "#8B9CC3", border: "1px solid var(--border)" },
    accent: { background: "var(--accent)", color: "#fff", border: "none" },
  };
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  const st = variants[variant] || variants.primary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 font-semibold rounded-lg transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${className}`}
      style={st}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
