import type { Config } from "tailwindcss";

/**
 * Asana-style design system preset.
 * Drop into any Next.js / Tailwind project:
 *
 *   // tailwind.config.ts
 *   import preset from "./design-system/tailwind-preset";
 *   export default { presets: [preset], content: [...] } satisfies Config;
 */
const preset: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        // ── Brand ──────────────────────────────────────────────────────────
        brand: {
          DEFAULT: "#4573D9", // primary blue (buttons, links, active states)
          hover:   "#3F65C4", // hover darken
          light:   "#EEF2FB", // tinted bg for selected/active items
          lighter: "#F5F8FF", // very faint tint (card selected bg)
          border:  "#C5D3F0", // border when brand-colored card is selected
        },

        // ── Neutrals (UI chrome) ───────────────────────────────────────────
        ink: {
          DEFAULT: "#151B26", // primary text, headings, nav
          muted:   "#6B6F76", // secondary text, labels, placeholders
          subtle:  "#9EA3AA", // tertiary / disabled text
          faint:   "#B0B3B8", // placeholder icons, dividers
        },

        surface: {
          DEFAULT: "#FFFFFF", // page background
          raised:  "#FAFBFC", // card / panel / dropdown background
          hover:   "#F5F5F5", // row hover, menu item hover
          active:  "#F0F1F3", // pressed state
          border:  "#E8E8E9", // default border, divider
          input:   "#D0D2D6", // input border (slightly stronger)
        },

        // ── Semantic ───────────────────────────────────────────────────────
        success: {
          DEFAULT: "#14A454",
          muted:   "#22C55E",
        },
        warning: {
          DEFAULT: "#F59E0B",
          muted:   "#F7C325",
        },
        danger: {
          DEFAULT: "#EF4444",
          dark:    "#DC2626",
        },

        // ── Accent palette (project icon colours / chart colours) ──────────
        accent: {
          coral:   "#F06A6A",
          teal:    "#4ECBC4",
          amber:   "#F7C325",
          green:   "#14A454",
          orange:  "#FF8C42",
          purple:  "#6C63FF",
          brown:   "#D9822B",
          pink:    "#E879F9",
          sky:     "#0EA5E9",
          flame:   "#FF6B35",
          cyan:    "#06B6D4",
          violet:  "#8B5CF6",
          lime:    "#F97316",
        },
      },

      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
      },

      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
        xs:   ["12px", { lineHeight: "16px" }],
        sm:   ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "20px" }],
        md:   ["15px", { lineHeight: "22px" }],
        lg:   ["16px", { lineHeight: "24px" }],
        xl:   ["18px", { lineHeight: "28px" }],
        "2xl":["20px", { lineHeight: "28px" }],
      },

      // ── Spacing ───────────────────────────────────────────────────────────
      spacing: {
        "4.5": "18px",
        "13":  "52px",
        "18":  "72px",
      },

      // ── Border radius ─────────────────────────────────────────────────────
      borderRadius: {
        sm:  "4px",
        DEFAULT: "6px",
        md:  "8px",
        lg:  "10px",
        xl:  "12px",
        "2xl": "16px",
      },

      // ── Shadows ───────────────────────────────────────────────────────────
      boxShadow: {
        // Dropdown menus, floating panels
        dropdown: "0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
        // Modals
        modal:    "0 8px 32px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
        // Subtle card lift
        card:     "0 1px 4px rgba(0,0,0,0.06)",
        // Input focus ring (brand)
        focus:    "0 0 0 2px #EEF2FB, 0 0 0 4px #4573D9",
      },

      // ── Z-index scale ─────────────────────────────────────────────────────
      zIndex: {
        dropdown: "100",
        panel:    "200",
        modal:    "300",
        toast:    "400",
      },

      // ── Transitions ───────────────────────────────────────────────────────
      transitionDuration: {
        fast:   "100ms",
        normal: "150ms",
        slow:   "250ms",
      },
    },
  },
  plugins: [],
};

export default preset;
