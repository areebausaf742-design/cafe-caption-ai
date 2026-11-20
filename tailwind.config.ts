import type { Config } from "tailwindcss";

/**
 * CafeCaption AI — design tokens
 * Warm, cozy cafe palette: cream paper, espresso ink, amber accents.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds — think steamed milk & paper menus
        cream: {
          50: "#FFFBF5",
          100: "#FDF5E9",
          200: "#F7EAD8",
          300: "#EFDCC3",
          400: "#E6D3BA",
        },
        // Ink — roasted coffee bean browns
        espresso: {
          50: "#F6F1EC",
          100: "#E7DCD1",
          200: "#D6C6B8",
          300: "#B3A192",
          400: "#8F7764",
          500: "#6B5544",
          600: "#5A4536",
          700: "#4A3527",
          800: "#332318",
          900: "#241812",
          950: "#180F0A",
        },
        // Accent — caramel / amber
        caramel: {
          // 50 and 700 were referenced by the menu UI (chips, "from the photo"
          // badges) before they existed, so those classes silently did nothing.
          50: "#FEF6EA",
          100: "#FBEBD3",
          200: "#F6D7AC",
          300: "#EDBB7C",
          400: "#E2A25C",
          500: "#C9803C",
          600: "#A9632C",
          700: "#854A1E",
        },
        // Secondary accent — matcha / sage (used sparingly)
        sage: {
          100: "#E8EEE0",
          300: "#B7C7A5",
          500: "#7D9668",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(36, 24, 18, 0.04), 0 12px 32px -12px rgba(36, 24, 18, 0.18)",
        lift: "0 2px 4px rgba(36, 24, 18, 0.05), 0 24px 48px -16px rgba(36, 24, 18, 0.28)",
        glow: "0 10px 30px -10px rgba(201, 128, 60, 0.55)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backgroundImage: {
        "grain": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "steam": {
          "0%, 100%": { transform: "translateY(0) scaleY(1)", opacity: "0.5" },
          "50%": { transform: "translateY(-3px) scaleY(1.08)", opacity: "0.9" },
        },
        "pop": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slide: {
          "0%": { transform: "translateX(-110%)" },
          "100%": { transform: "translateX(350%)" },
        },
      },
      animation: {
        // Slower than a default reveal on purpose: expo-out over 0.7s is the
        // difference between "a div faded in" and "the page settled".
        "fade-up": "fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        steam: "steam 3.5s ease-in-out infinite",
        pop: "pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        slide: "slide 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
