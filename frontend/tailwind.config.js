import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, "index.html"),
    path.join(__dirname, "src", "**", "*.{js,jsx,ts,tsx}"),
  ],
  safelist: [
    { pattern: /^(bg|text|border|ring|from|to|via|shadow)-udemy(-.+)?$/ },
    { pattern: /^(bg|text|border|ring|from|to|via|shadow)-brand(-.+)?$/ },
    { pattern: /^rounded-portal$/ },
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Roboto", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
      colors: {
        "udemy-ink": "#1c1d1f",
        "udemy-muted": "#6a6f73",
        "udemy-subtle": "#3e4143",
        "udemy-border": "#d1d7dc",
        "udemy-surface": "#f7f9fa",
        "udemy-card": "#ffffff",
        "udemy-purple": "#5624d0",
        "udemy-purple-hover": "#401b9c",
        "udemy-purple-soft": "#e8deff",
        "udemy-purple-ghost": "#f3f0ff",
        "brand-blue": "#0B3EAF",
        "brand-blue-hover": "#082d82",
        "brand-blue-soft": "#E8EEF8",
        "brand-green": "#A7D344",
        "brand-green-hover": "#8fb536",
        "brand-green-soft": "#F4F9E8",
        "brand-red": "#E02B20",
        "brand-red-hover": "#c4241a",
        "brand-black": "#000000",
        "brand-muted": "#5c5f66",
        "brand-surface": "#eef2fb",
        "brand-surface-dark": "#e2e8f8",
      },
      boxShadow: {
        udemy: "0 2px 4px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.08)",
        "udemy-sm": "0 2px 4px rgba(0,0,0,.08)",
        "udemy-card": "0 2px 4px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.05)",
        brand: "0 4px 24px rgba(11, 62, 175, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
        "brand-lg": "0 12px 40px rgba(11, 62, 175, 0.12), 0 4px 16px rgba(0, 0, 0, 0.06)",
      },
      borderRadius: {
        portal: "12px",
      },
    },
  },
  plugins: [],
};
