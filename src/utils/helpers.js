export function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
export function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
export function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
export function formatSize(bytes) {
  if (!bytes) return "";
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : (bytes / 1024).toFixed(0) + " KB";
}
