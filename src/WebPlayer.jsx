import { useState, useEffect, useRef } from "react";
import * as api from "./api";

export default function WebPlayer() {
  const [status, setStatus] = useState(null);
  const [queue, setQueue] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  // Subscribe to WebSocket state changes
  useEffect(() => {
    const unsub = api.onStateChange((data) => {
      setStatus(data);
      setQueue(data.queue || []);
    });
    return unsub;
  }, []);

  // Poll status initially
  useEffect(() => {
    api.getStatus().then(setStatus).catch(() => {});
    api.getQueue().then(setQueue).catch(() => {});
  }, []);

  // Search
  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const data = await api.search(query);
      setResults(data.results || []);
    } catch (e) { console.error("Search error", e); }
    setLoading(false);
  };

  // Player controls
  const play = async (item) => {
    await api.playTrack(item);
    if (audioRef.current) {
      audioRef.current.src = api.getAudioUrl(item.id);
      audioRef.current.play().catch(() => {});
    }
  };

  const toggle = async () => {
    const res = await api.togglePlay();
    if (audioRef.current) {
      if (res.playing) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  };

  const next = async () => {
    await api.nextTrack();
    // Audio will be set when WS update arrives
  };

  const prev = async () => {
    await api.prevTrack();
  };

  const seek = (e) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    api.seek(t);
  };

  const changeVolume = (e) => {
    const v = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.volume = v;
    api.setVolume(v);
  };

  // When status changes, update audio if the track changed
  useEffect(() => {
    if (!status || !audioRef.current) return;
    const expectedUrl = api.getAudioUrl(status.current_id || "");
    if (audioRef.current.src !== expectedUrl && status.current_id) {
      audioRef.current.src = expectedUrl;
      if (status.playing) audioRef.current.play().catch(() => {});
    }
  }, [status?.current_id]);

  // Follow play/pause from server
  useEffect(() => {
    if (!audioRef.current || !status) return;
    if (status.playing) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [status?.playing]);

  const isCurrent = (id) => status?.current_id === id;

  return (
    <div className="app-layout">
      <main className="main-area" style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
        <h1 style={{ fontSize: "1.2rem", marginBottom: 16 }}>🎵 shyqui-music</h1>

        {/* Now Playing */}
        {status && (
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 16, marginBottom: 16, textAlign: "center" }}>
            {status.current_thumb && (
              <img src={status.current_thumb} alt="" style={{ width: 120, height: 90, borderRadius: 6, objectFit: "cover" }} />
            )}
            <div style={{ marginTop: 8, fontWeight: 600 }}>{status.current_title || "No track playing"}</div>

            {/* Progress bar */}
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", fontSize: "0.75rem" }}>
              <span>{formatTime(status.current_time || 0)}</span>
              <input type="range" min={0} max={status.duration || 1} value={status.current_time || 0}
                onChange={seek} style={{ flex: 1 }} />
              <span>{formatTime(status.duration || 0)}</span>
            </div>

            {/* Controls */}
            <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
              <button onClick={prev} style={btnStyle}>⏮</button>
              <button onClick={toggle} style={{ ...btnStyle, fontSize: "1.5rem" }}>
                {status.playing ? "⏸" : "▶️"}
              </button>
              <button onClick={next} style={btnStyle}>⏭</button>
            </div>

            {/* Volume */}
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>
              <span>🔉</span>
              <input type="range" min={0} max={1} step={0.05} value={status.volume || 0.7}
                onChange={changeVolume} style={{ width: 120 }} />
            </div>
          </div>
        )}

        {/* Search */}
        <div className="search-box" style={{ marginBottom: 12 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search YouTube..."
            onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
          <button className="btn-play" onClick={handleSearch} disabled={!query || loading}>
            <span>{loading ? "..." : "Search"}</span>
          </button>
        </div>

        {/* Results */}
        {results.map((item) => (
          <div key={item.id} className="track-item" style={{ opacity: isCurrent(item.id) ? 1 : undefined }}>
            <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
            <div className="track-info">
              <div className="track-title">{item.title}</div>
              {item.channel && <div className="track-channel">{item.channel}</div>}
            </div>
            <button className="btn-play" onClick={() => play(item)}>
              <span>{isCurrent(item.id) ? "Now Playing" : "Play"}</span>
            </button>
          </div>
        ))}

        {/* Queue */}
        <h2 style={{ fontSize: "1rem", marginTop: 24, marginBottom: 8 }}>Queue</h2>
        {queue.length === 0 && <div style={{ opacity: 0.5, fontSize: "0.85rem" }}>Queue is empty</div>}
        {queue.map((item, i) => (
          <div key={item.id + i} className="track-item" style={{ opacity: status?.queue_idx === i ? 1 : 0.7 }}>
            <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
            <div className="track-info">
              <div className="track-title">
                {item.title}
                {status?.queue_idx === i && <span className="now-playing-badge">Now Playing</span>}
              </div>
              {item.channel && <div className="track-channel">{item.channel}</div>}
            </div>
            <button className="btn-play" onClick={() => api.playFromQueue(i)}>
              <span>Play</span>
            </button>
          </div>
        ))}

        <audio ref={audioRef} style={{ display: "none" }}
          onTimeUpdate={() => {
            if (audioRef.current && status) {
              setStatus((s) => s ? { ...s, current_time: audioRef.current.currentTime } : s);
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && status) {
              setStatus((s) => s ? { ...s, duration: audioRef.current.duration } : s);
            }
          }}
          onEnded={next} />
      </main>
    </div>
  );
}

const btnStyle = {
  background: "none", border: "none", color: "#ccc", fontSize: "1.2rem",
  cursor: "pointer", padding: "4px 12px", borderRadius: 6,
};

function formatTime(t) {
  if (!t || !isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
