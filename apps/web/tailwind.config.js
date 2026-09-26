/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Deliberately replacing (not extending) colors/fontFamily/borderRadius —
    // this app draws from a fixed palette and a hierarchy-coded radius
    // system, not Tailwind's defaults plus a few extras.
    //
    // Tokens are named for their ROLE, not their colour, so the next rebrand
    // edits this block rather than every className. Every value derives from
    // the logo's cyan (#00A2D0, hue 193°). Contrast figures are WCAG 2.x,
    // computed, not estimated.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",
      // Admin sidebar, login panel, seal wax. The brand hue desaturated and
      // darkened — visibly petrol, not a tinted black — so the cyan mark sits
      // on its own shadow. Canvas text on it 11.88:1; brand cyan on it 4.59:1.
      deep: "#11323B",
      // Hover/active rows on `deep`. Canvas text on it 9.33:1.
      "deep-raised": "#1D434E",
      // App background. Cool neutral, 4-point RGB spread (237/240/241).
      canvas: "#EDF0F1",
      // Tables, modals, inputs.
      surface: "#FFFFFF",
      // All primary text. Brand hue at 11% lightness, never pure #000.
      // 14.30:1 on canvas, 16.37:1 on surface.
      ink: "#122226",
      // Secondary text, borders, neutral/in-progress status. 7.50:1 on
      // canvas, 8.59:1 on white. Was #4F6369 (5.52:1): admin screens read
      // "small" because most of their text is 13px in this colour (75% of the
      // activity log, 50% of the dashboard), and 5.5:1 at 13px reads faint.
      // Darkening it costs no table rows; the hairlines built from it at
      // 10-40% barely move (muted/10 on canvas: 1.14:1 -> 1.16:1).
      muted: "#3D4F54",
      // THE CYAN RULE. `brand` is 2.59:1 on canvas and 2.97:1 on white — it
      // fails AA for text, and the 3:1 non-text minimum, on light surfaces.
      // White text on it is 2.97:1 — also a fail. So:
      //  - `brand` is a FILL that takes `ink` text (5.52:1): primary buttons,
      //    active tabs, progress fills, seal emblems, the logo.
      //  - On light surfaces anything thin — text, links, focus rings,
      //    underlines, 1–2px indicators — uses `brand-ink`, never `brand`.
      //  - On `deep`, `brand` is fine for marks, dots and the active nav
      //    indicator (4.59:1).
      // What cyan means: yours, live, earned. One primary action per screen.
      brand: "#00A2D0",
      // Cyan for text and thin elements on light surfaces. 4.67:1 on canvas,
      // 5.35:1 on white.
      "brand-ink": "#007494",
      // Status colours: deliberately NOT brand, and always paired with an
      // icon + label + ordinal, never colour alone. Each passes 4.5:1 as
      // text on its own badge tint (10–12%) over canvas as well as white.
      // Success (hue 135°, pushed yellow-green so it can't read as teal).
      positive: "#2C6F3D",
      // Needs action (hue 35°).
      attention: "#8B5100",
      // Negative / terminal (hue 6°). White text on it 6.14:1.
      negative: "#AE392D",
    },
    fontFamily: {
      sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      serif: ['"IBM Plex Serif"', "Georgia", "serif"],
    },
    // Two densities, one scale: each token reads CSS variables set in
    // index.css. Admin screens (html.density-compact) stay dense for tables;
    // user screens and the login/error pages (the default, comfortable) are
    // more generous. Shared components scale by context with no duplication.
    fontSize: {
      small: ["var(--fs-small)", { lineHeight: "var(--lh-small)" }],
      body: ["var(--fs-body)", { lineHeight: "var(--lh-body)" }],
      "body-lg": ["var(--fs-body-lg)", { lineHeight: "var(--lh-body-lg)" }],
      h3: ["var(--fs-h3)", { lineHeight: "var(--lh-h3)", letterSpacing: "0.01em" }],
      h2: ["var(--fs-h2)", { lineHeight: "var(--lh-h2)" }],
      h1: ["var(--fs-h1)", { lineHeight: "var(--lh-h1)" }],
      display: ["var(--fs-display)", { lineHeight: "var(--lh-display)" }],
    },
    borderRadius: {
      none: "0px",
      // Small interactive elements â€” inputs, buttons, square badges. Crisp,
      // form-like, not the soft-everywhere look this app is deliberately avoiding.
      sm: "4px",
      // True containers â€” modals, panels.
      md: "8px",
      // Status pills/tags only â€” a pill shape conventionally signals
      // "tag/state," so it's reserved for exactly that, not used generally.
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      // The ONE shadow token in the app, reserved for things that actually
      // float above the page (modals, dropdowns, toasts, the mobile drawer).
      // No default "card" shadow exists â€” content sections sit directly on
      // canvas with hairline dividers, not shadowed white cards.
      elevated: "0 8px 24px -4px rgba(18, 34, 38, 0.18)",
    },
    extend: {
      spacing: {
        18: "4.5rem",
      },
    },
  },
  plugins: [],
};
