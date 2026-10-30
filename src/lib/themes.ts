/** Color themes for the prompt bar, the answer box and the character card. */
export interface Theme {
  id: string;
  title: string;
  dark: boolean;
  frame: string; // prompt bar border, character card border
  frame2: string; // answer box border
  accent: string; // your question in the transcript
  accent2: string; // provider pill, `code`, links
  text: string;
}

export const THEMES: Theme[] = [
  { id: "neon", title: "Неон", dark: true, frame: "#FF296D", frame2: "rgba(51,255,140,.6)", accent: "#FF296D", accent2: "#33FF8C", text: "#FFFFFF" },
  { id: "samurai", title: "Samurai", dark: true, frame: "#FCEE0A", frame2: "rgba(0,240,255,.6)", accent: "#FCEE0A", accent2: "#00F0FF", text: "#FFFFFF" },
  { id: "netrunner", title: "Нетраннер", dark: true, frame: "#00F0FF", frame2: "rgba(185,103,255,.6)", accent: "#00F0FF", accent2: "#D29BFF", text: "#FFFFFF" },
  { id: "crimson", title: "Багровая", dark: true, frame: "#E10600", frame2: "rgba(225,6,0,.45)", accent: "#FF4D4D", accent2: "#FF8A8A", text: "#FFFFFF" },
  { id: "matrix", title: "Матрица", dark: true, frame: "#00FF41", frame2: "rgba(0,255,65,.4)", accent: "#00FF41", accent2: "#7DFF9C", text: "#D8FFE0" },
  { id: "minimal", title: "Минимал", dark: true, frame: "rgba(255,255,255,.18)", frame2: "rgba(255,255,255,.12)", accent: "rgba(255,255,255,.6)", accent2: "#8AB4FF", text: "#FFFFFF" },
  { id: "strawberry", title: "Клубничная", dark: false, frame: "#FF8FB1", frame2: "#FFB8CE", accent: "#E84A7F", accent2: "#C2185B", text: "#4A2B36" },
  { id: "lavender", title: "Лавандовая", dark: false, frame: "#B79CED", frame2: "#D4C2F7", accent: "#7E57C2", accent2: "#5E35B1", text: "#2E2540" },
  { id: "light", title: "Светлая", dark: false, frame: "rgba(0,0,0,.12)", frame2: "rgba(0,0,0,.08)", accent: "#E0245E", accent2: "#0A64D6", text: "#1A1A1A" },
];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Expose the theme as CSS variables on <html>. */
export function applyTheme(t: Theme) {
  const s = document.documentElement.style;
  s.setProperty("--frame", t.frame);
  s.setProperty("--frame2", t.frame2);
  s.setProperty("--accent", t.accent);
  s.setProperty("--accent2", t.accent2);
  s.setProperty("--text", t.text);
  s.setProperty("--glass", t.dark ? "rgba(22,20,28,.82)" : "rgba(250,248,252,.86)");
  document.documentElement.dataset.dark = String(t.dark);
}
