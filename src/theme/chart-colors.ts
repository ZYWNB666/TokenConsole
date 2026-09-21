"use client";

import { useResolvedTheme } from "./provider";

/**
 * Recharts colors. SVG presentation attributes cannot reference CSS custom
 * properties, so the chart palettes repeat the semantic token values here
 * per resolved theme — keep them in sync with src/app/globals.css.
 */
export type ChartColors = {
  /** Series line/area color — mirrors --primary. */
  line: string;
  /** Grid and cursor color — mirrors --border. */
  grid: string;
  /** Axis tick color — mirrors --muted-foreground. */
  tick: string;
};

const CHART_LIGHT: ChartColors = {
  line: "#4f46e5", // --primary (light)
  grid: "#e2e8f0", // --border (light)
  tick: "#475569", // --muted-foreground (light)
};

const CHART_DARK: ChartColors = {
  line: "#818cf8", // --primary (dark)
  grid: "#334155", // --border (dark)
  tick: "#94a3b8", // slate-400 — one step darker than the dark token, so
  // axis ticks stay secondary to plotted values on the deep canvas.
};

/** Semantic chart colors for the theme the page is actually rendering. */
export function useChartColors(): ChartColors {
  return useResolvedTheme() === "dark" ? CHART_DARK : CHART_LIGHT;
}
