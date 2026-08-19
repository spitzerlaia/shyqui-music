export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

export function mixHex(hex, otherHex, percent) {
  const a = hexToRgb(hex);
  const b = hexToRgb(otherHex);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * (percent / 100)));
}

function buildTheme(accentHex, bgHex) {
  const text = "#ffdcec";
  return {
    accent: accentHex,
    bg: bgHex,
    text,
    glass: mixHex(bgHex, "#ffffff", 10),
    onAccent: "#ffe3ee",
    textSoft: mixHex(text, accentHex, 55),
    danger: "#ff6b6b",
    warn: "#ff8c00",
    star: "#ffc800",
  };
}

export const THEMES = {
  rosa: buildTheme("#ff6fb8", "#22101d"),
  violeta: buildTheme("#b680ff", "#1d1030"),
  azul: buildTheme("#78acff", "#0e1a2e"),
  menta: buildTheme("#73debe", "#0d2119"),
  ambar: buildTheme("#ffb666", "#251a0d"),
  gris: buildTheme("#ccbed5", "#1b1822"),
};

export function buildThemeFrom(accentHex, bgHex) {
  return buildTheme(accentHex, bgHex);
}

export function normalizeTheme(t) {
  const fallback = buildThemeFrom("#ff6fb8", "#22101d");
  const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{3,6}$/i.test(v);
  const arrHex = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n)) ? rgbToHex(v) : null;
  const base = { ...fallback, preset: "rosa" };
  if (!t || typeof t !== "object") return base;
  return {
    preset: t.preset === "custom" ? "custom" : "rosa",
    accent: isHex(t.accent) ? t.accent : arrHex(t.accent) || fallback.accent,
    bg: isHex(t.bg) ? t.bg : arrHex(t.bg) || (Array.isArray(t.bg) && isHex(t.bg[0]) ? t.bg[0] : fallback.bg),
    text: isHex(t.text) ? t.text : fallback.text,
    glass: isHex(t.glass) ? t.glass : fallback.glass,
    onAccent: isHex(t.onAccent) ? t.onAccent : fallback.onAccent,
    textSoft: isHex(t.textSoft) ? t.textSoft : fallback.textSoft,
    danger: isHex(t.danger) ? t.danger : fallback.danger,
    warn: isHex(t.warn) ? t.warn : fallback.warn,
    star: isHex(t.star) ? t.star : fallback.star,
  };
}