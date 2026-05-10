/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#0B0E1A",
        "bg-card": "#141824",
        "bg-elevated": "#1C2133",
        "border-card": "#252A3D",
        primary: { DEFAULT: "#00D68F", dim: "rgba(0,214,143,0.13)" },
        accent: { DEFAULT: "#7C3AED", dim: "rgba(124,58,237,0.13)" },
        warn: { DEFAULT: "#F59E0B", dim: "rgba(245,158,11,0.13)" },
        danger: { DEFAULT: "#EF4444", dim: "rgba(239,68,68,0.13)" },
        "text-primary": "#F1F5F9",
        "text-secondary": "#8B9CC3",
        "text-muted": "#4B5A7A",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      borderRadius: { card: "12px" },
    },
  },
  plugins: [],
};
