/** @type {import('tailwindcss').Config} */
module.exports = {
  content: {
    relative: true,
    files: [
      "./app/**/*.{ts,tsx}",
      "./components/**/*.{ts,tsx}",
    ],
  },
  theme: {
    extend: {
      colors: {
        background: "#07080a",
        panel: "rgba(17, 20, 26, 0.72)",
        line: "rgba(255, 255, 255, 0.10)",
        steel: "#9aa4b2",
        accent: {
          DEFAULT: "#d6b36a",
          soft: "rgba(214, 179, 106, 0.14)",
          glow: "rgba(214, 179, 106, 0.35)",
          50: "#fbf5e5",
          100: "#f3e3b9",
          200: "#e9cf8e",
          300: "#dec16f",
          400: "#d6b36a",
          500: "#c89d4e",
          600: "#a07a33",
        },
        success: {
          DEFAULT: "#4ade80",
          soft: "rgba(74, 222, 128, 0.12)",
        },
        danger: {
          DEFAULT: "#f87171",
          soft: "rgba(248, 113, 113, 0.12)",
        },
        info: {
          DEFAULT: "#7dd3fc",
          soft: "rgba(125, 211, 252, 0.12)",
        },
        warning: {
          DEFAULT: "#fbbf24",
          soft: "rgba(251, 191, 36, 0.12)",
        },
      },
      boxShadow: {
        glass: "0 24px 80px rgba(0, 0, 0, 0.38)",
        "glass-hover": "0 32px 96px -20px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3)",
        "accent-glow": "0 0 0 1px rgba(214, 179, 106, 0.3), 0 0 24px rgba(214, 179, 106, 0.18)",
        "inner-hi": "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        "display": ["2.25rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "600" }],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      transitionTimingFunction: {
        "out-quint": "cubic-bezier(0.22, 0.8, 0.36, 1)",
      },
      animation: {
        "fade-in": "fade-in 320ms ease-out both",
        "fade-in-up": "fade-in-up 420ms cubic-bezier(0.22, 0.8, 0.36, 1) both",
        "scale-in": "scale-in 220ms cubic-bezier(0.22, 0.8, 0.36, 1) both",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
