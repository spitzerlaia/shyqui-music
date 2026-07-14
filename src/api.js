let apiBase = "";
let audioBase = "";
let tauriInvoke = null;
let isTauriMode = false;
let wsConn = null;
let stateListeners = [];

export function isTauri() {
  return isTauriMode;
}

export function getAudioUrl(id) {
  return `${audioBase}/audio/${id}`;
}

export function getApiBase() {
  return apiBase;
}

export async function initApi() {
  const hasRealInvoke =
    typeof window !== "undefined" &&
    window.__TAURI_INTERNALS__ !== undefined &&
    typeof window.__TAURI_INTERNALS__.invoke === "function";
  isTauriMode = hasRealInvoke;
  if (isTauriMode) {
    try {
      const mod = await import("@tauri-apps/api/core");
      tauriInvoke = mod.invoke;
      const info = await tauriInvoke("get_server_info");
      apiBase = `http://localhost:${info.port}`;
      audioBase = apiBase;
    } catch {
      isTauriMode = false;
    }
  }
  if (!isTauriMode) {
    apiBase = "";
    audioBase = "";
    connectWs();
  }
}

function connectWs() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${proto}//${location.host}/api/ws`;
  try {
    wsConn = new WebSocket(wsUrl);
    wsConn.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "state") {
          stateListeners.forEach((fn) => fn(msg.data));
        }
      } catch {}
    };
    wsConn.onclose = () => {
      setTimeout(connectWs, 3000);
    };
  } catch {}
}

export function onStateChange(fn) {
  stateListeners.push(fn);
  return () => {
    stateListeners = stateListeners.filter((f) => f !== fn);
  };
}

async function apiGet(path) {
  if (isTauriMode && tauriInvoke) {
    return apiGetTauri(path);
  }
  const res = await fetch(`${apiBase}${path}`);
  if (!res.ok) throw new Error(`API GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  if (isTauriMode && tauriInvoke) {
    return apiPostTauri(path, body);
  }
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API POST ${path} failed: ${res.status}`);
  return res.json();
}

// Helper: map API paths to Tauri commands
const GET_MAP = {
  "/api/status": (args, invoke) => invoke("get_server_info"),
  "/api/queue": null,
};

const POST_MAP = {
  "/api/queue/add": "add_to_queue",
  "/api/queue/remove": "remove_from_queue",
  "/api/queue/play": "play_from_queue",
  "/api/queue/move": "move_queue_item",
  "/api/player/play": "play_track",
  "/api/player/toggle": "toggle_play",
  "/api/player/next": "next_track",
  "/api/player/prev": "prev_track",
};

async function apiGetTauri(path) {
  if (path === "/api/status") {
    return tauriInvoke("get_server_info");
  }
  if (path === "/api/queue") {
    return tauriInvoke("get_queue_state");
  }
  if (path === "/api/downloads") {
    return tauriInvoke("get_downloaded_songs");
  }
  if (path.startsWith("/api/search?q=")) {
    const q = decodeURIComponent(path.slice("/api/search?q=".length));
    return tauriInvoke("search_youtube", { query: q });
  }
  throw new Error("Unknown GET path: " + path);
}

async function apiPostTauri(path, body) {
  if (path === "/api/queue/add") {
    return tauriInvoke("add_to_queue_invoke", { item: body });
  }
  if (path === "/api/queue/remove") {
    return tauriInvoke("remove_from_queue_invoke", { index: body.index });
  }
  if (path === "/api/queue/play") {
    return tauriInvoke("play_from_queue_invoke", { index: body.index });
  }
  if (path === "/api/queue/move") {
    return tauriInvoke("move_queue_item_invoke", { from: body.from, to: body.to });
  }
  if (path === "/api/player/play") {
    return tauriInvoke("play_track_invoke", { item: body });
  }
  if (path === "/api/player/toggle") {
    return tauriInvoke("toggle_play_invoke");
  }
  if (path === "/api/player/next") {
    return tauriInvoke("next_track_invoke");
  }
  if (path === "/api/player/prev") {
    return tauriInvoke("prev_track_invoke");
  }
  throw new Error("Unknown POST path: " + path);
}

// ── Public API ──

export async function search(query) {
  return apiGet(`/api/search?q=${encodeURIComponent(query)}`);
}

export async function searchHinai(query) {
  return apiGet(`/api/search/hinai?q=${encodeURIComponent(query)}`);
}

export async function fetchUrl(url) {
  return apiPost("/api/url/fetch", { url });
}

export async function getChannelVideos(channelUrl) {
  return apiGet(`/api/channel?url=${encodeURIComponent(channelUrl)}`);
}

export async function getDownloads() {
  return apiGet("/api/downloads");
}

export async function deleteDownload(id) {
  return apiPost("/api/downloads/delete", { id });
}

export async function getStatus() {
  return apiGet("/api/status");
}

export async function getQueue() {
  return apiGet("/api/queue");
}

export async function addToQueue(item) {
  return apiPost("/api/queue/add", item);
}

export async function removeFromQueue(index) {
  return apiPost("/api/queue/remove", { index });
}

export async function playFromQueue(index) {
  return apiPost("/api/queue/play", { index });
}

export async function moveQueueItem(from, to) {
  return apiPost("/api/queue/move", { from, to });
}

export async function playTrack(item) {
  return apiPost("/api/player/play", item);
}

export async function togglePlay() {
  return apiPost("/api/player/toggle");
}

export async function nextTrack() {
  return apiPost("/api/player/next");
}

export async function prevTrack() {
  return apiPost("/api/player/prev");
}

export async function seek(time) {
  return apiPost("/api/player/seek", { time });
}

export async function setVolume(volume) {
  return apiPost("/api/player/volume", { volume });
}

export async function getServerInfo() {
  return apiGet("/api/server-info");
}

export async function downloadAudio(item) {
  return apiPost("/api/download/audio", item);
}
