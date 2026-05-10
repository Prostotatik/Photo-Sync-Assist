import { X } from "lucide-react";
import { useEffect } from "react";

export function Modal({ open, onClose, title, children, width = 480 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          width,
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h3 className="font-semibold text-base" style={{ color: "#F1F5F9" }}>{title}</h3>
          <button onClick={onClose} className="hover:opacity-70" style={{ color: "#8B9CC3" }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
