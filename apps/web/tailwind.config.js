/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Deliberately replacing (not extending) colors/fontFamily/borderRadius —
    // this app draws from a fixed 7-color palette and a hierarchy-coded
    // radius system, not Tailwind's defaults plus a few extras. See the
    // approved design plan for the reasoning behind every value here.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",
      // Primary/brand — deep oxblood, evokes an official seal/passbook cover.
      maroon: "#6E2A2A",
      // Background — warm-neutral document stock. Revised from an earlier
      // #F2F0E9 (9-point channel spread, read as cream) down to a 4-point
      // spread so warmth is carried by maroon/brass, not the background.
      paper: "#F0EFEC",
      // Primary text — near-black with a whisper of maroon, never pure #000.
      ink: "#241D1D",
      // Accent — CTAs, "needs attention" status, treasure-map gold. Passes
      // AA (3.46:1) against Paper for large/bold text, icons, and fills —
      // NOT for small body text on Paper. Never use `text-brass` at body
      // size directly on a paper background; use it on a filled surface
      // (button, badge) with light text instead.
      brass: "#A9752E",
      // Status: success / positive (Sanctioned, Disbursed, Closed).
      moss: "#3F7A5C",
      // Status: negative / terminal (Rejected, Foreclosed). Deliberately
      // more orange/saturated than maroon so the two don't get confused —
      // always paired with an icon + label + ordinal, never color alone.
      alert: "#A6342A",
      // Status: neutral / in-progress; also secondary text and borders.
      slate: "#57707B",
    },
    fontFamily: {
      sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      serif: ['"IBM Plex Serif"', "Georgia", "serif"],
    },
    fontSize: {
      small: ["0.75rem", { lineHeight: "1.4" }],
      body: ["0.875rem", { lineHeight: "1.55" }],
      "body-lg": ["1rem", { lineHeight: "1.6" }],
      h3: ["0.8125rem", { lineHeight: "1.3", letterSpacing: "0.01em" }],
      h2: ["1.125rem", { lineHeight: "1.35" }],
      h1: ["1.5rem", { lineHeight: "1.3" }],
      display: ["2rem", { lineHeight: "1.2" }],
    },
    borderRadius: {
      none: "0px",
      // Small interactive elements — inputs, buttons, square badges. Crisp,
      // form-like, not the soft-everywhere look this app is deliberately avoiding.
      sm: "4px",
      // True containers — modals, panels.
      md: "8px",
      // Status pills/tags only — a pill shape conventionally signals
      // "tag/state," so it's reserved for exactly that, not used generally.
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      // The ONE shadow token in the app, reserved for things that actually
      // float above the page (modals, dropdowns, toasts, the mobile drawer).
      // No default "card" shadow exists — content sections sit directly on
      // Paper with hairline dividers, not shadowed white cards.
      elevated: "0 8px 24px -4px rgba(36, 29, 29, 0.18)",
    },
    extend: {
      spacing: {
        18: "4.5rem",
      },
    },
  },
  plugins: [],
};
