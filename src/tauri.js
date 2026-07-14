let _invoke = null;
let _convertFileSrc = null;
let _isTauri = false;

function isActualTauri() {
  return typeof window !== "undefined" &&
    window.__TAURI_INTERNALS__ !== undefined &&
    typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

export async function initTauri() {
  if (!isActualTauri()) {
    _isTauri = false;
    return false;
  }
  try {
    const core = await import("@tauri-apps/api/core");
    _invoke = core.invoke;
    _convertFileSrc = core.convertFileSrc;
    _isTauri = true;
    return true;
  } catch {
    _isTauri = false;
    return false;
  }
}

export function isTauri() {
  return _isTauri;
}

export function invoke(cmd, args) {
  if (_invoke) {
    if (!isActualTauri()) {
      throw new Error("invoke not available (not in Tauri context)");
    }
    return _invoke(cmd, args);
  }
  const ti = window.__TAURI_INTERNALS__;
  if (ti?.invoke) return ti.invoke(cmd, args);
  throw new Error("invoke not available (not in Tauri context)");
}

export function convertFileSrc(path) {
  if (_convertFileSrc) return _convertFileSrc(path);
  return path;
}
