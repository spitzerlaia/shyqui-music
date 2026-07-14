import { useState, useRef, useEffect, useCallback } from "react";
import * as api from "./api";
import { genId } from "./utils/helpers";
import { useLocalStorage } from "./hooks/useLocalStorage";
import NavTabs from "./components/NavTabs";
import Player from "./components/Player";
import SearchView from "./views/SearchView";
import QueueView from "./views/QueueView";
import PlaylistsView from "./views/PlaylistsView";
import HistoryView from "./views/HistoryView";
import "./App.css";

function formatTime(t) {
  if (!t || !isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || password.length < 3) {
      setError("Username required, password min 3 chars");
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      localStorage.setItem("shyqui_token", data.token);
      localStorage.setItem("shyqui_user", JSON.stringify(data.user));
      onAuth(data.token, data.user);
    } catch (err) {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
  };

  return (
    <div className="app-layout">
      <main className="main-area" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 32, width: 320, maxWidth: "90%" }}>
          <h1 style={{ fontSize: "1.3rem", marginBottom: 24, textAlign: "center" }}>shyqui-music</h1>
          <h2 style={{ fontSize: "0.9rem", marginBottom: 16, textAlign: "center", opacity: 0.6 }}>
            {mode === "login" ? "Sign In" : "Create Account"}
          </h2>
          {error && <div style={{ color: "#ff6b6b", fontSize: "0.75rem", marginBottom: 12, textAlign: "center" }}>{error}</div>}
          <input value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            style={{ width: "100%", marginBottom: 12, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={{ width: "100%", marginBottom: 16, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }} />
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "8px 0", borderRadius: 6, border: "none", background: loading ? "rgba(255,255,255,0.15)" : "#4a9eff", color: "#fff", fontSize: "0.85rem", cursor: loading ? "default" : "pointer" }}>
            {loading ? "..." : mode === "login" ? "Sign In" : "Register"}
          </button>
          <div style={{ marginTop: 16, textAlign: "center", fontSize: "0.75rem", opacity: 0.5 }}>
            <span style={{ cursor: "pointer" }} onClick={switchMode}>
              {mode === "login" ? "No account? Register" : "Already have an account? Sign In"}
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}

function WebPlayerApp({ token, user, onLogout }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("youtube");
  const [results, setResults] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useLocalStorage("shyqui_volume", 0.7);
  const [currentId, setCurrentId] = useLocalStorage("web_current_id", null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentThumb, setCurrentThumb] = useState("");
  const [queue, setQueue] = useState([]);
  const [queueIdx, setQueueIdx] = useState(-1);
  const [history, setHistory] = useLocalStorage("web_history", []);
  const [playlists, setPlaylists] = useLocalStorage("web_playlists", []);
  const [activeView, setActiveView] = useState("search");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [saveOpen, setSaveOpen] = useState(null);
  const [channelView, setChannelView] = useState(null);
  const [channelVideos, setChannelVideos] = useState([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [hinaiFilters, setHinaiFilters] = useState({ status: "", sort: "ranked_date_desc", genre: 0, language: 0 });
  const [status, setStatus] = useState(null);
  const [downloadingTrack, setDownloadingTrack] = useState(null);

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const queueIdxRef = useRef(-1);
  const pendingItemRef = useRef(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIdxRef.current = queueIdx; }, [queueIdx]);

  // Subscribe to WebSocket state changes
  useEffect(() => {
    const unsub = api.onStateChange((data) => {
      setStatus(data);
      if (data.queue) setQueue(data.queue);
      if (data.queue_idx !== undefined) setQueueIdx(data.queue_idx);
      if (data.current_id !== undefined) setCurrentId(data.current_id);
      if (data.current_title !== undefined) setCurrentTitle(data.current_title);
      if (data.current_thumb !== undefined) setCurrentThumb(data.current_thumb);
      if (data.playing !== undefined) setPlaying(data.playing);
      if (data.current_time !== undefined) setCurrentTime(data.current_time);
      if (data.volume !== undefined) setVolume(data.volume);
    });
    return unsub;
  }, []);

  useEffect(() => {
    api.getStatus().then((s) => {
      if (s) {
        setStatus(s);
        if (s.current_id) setCurrentId(s.current_id);
        if (s.current_title) setCurrentTitle(s.current_title);
        if (s.current_thumb) setCurrentThumb(s.current_thumb);
        setPlaying(s.playing);
        setCurrentTime(s.current_time);
        setDuration(s.duration);
        setVolume(s.volume);
        if (s.queue) setQueue(s.queue);
      }
    }).catch(() => {});
    api.getQueue().then(setQueue).catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true); setChannelView(null);
    try {
      const data = await api.search(query);
      setResults(data.results || []);
      setChannels(data.channels || []);
    } catch (err) { console.error("Search error", err); }
    finally { setLoading(false); }
  };

  const openChannel = async (ch) => {
    setChannelView(ch); setChannelLoading(true); setActiveView("search");
    try {
      const vids = await api.getChannelVideos(ch.url);
      setChannelVideos(vids);
    } catch (err) { console.error("Channel error", err); setChannelVideos([]); }
    finally { setChannelLoading(false); }
  };

  const addHistory = useCallback((id, title, thumb, dur) => {
    setHistory((prev) => {
      const next = [{ id, title, thumbnail: thumb, duration: dur, playedAt: Date.now() }, ...prev];
      return next.slice(0, 50);
    });
  }, [setHistory]);

  const ensureAudioReady = async (item) => {
    if (!item || !item.id) return;
    setDownloadingTrack(item.id);
    setCurrentTrack(item);
    setCurrentId(item.id);
    setCurrentTitle(item.title || "");
    setCurrentThumb(item.thumbnail || "");
    try {
      await api.downloadAudio(item);
      setDownloadingTrack(null);
      if (audioRef.current) {
        audioRef.current.src = api.getAudioUrl(item.id);
        audioRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error("Download error:", err);
      setDownloadingTrack(null);
    }
  };

  const playTrack = async (item) => {
    pendingItemRef.current = item;
    await ensureAudioReady(item);
    try {
      await api.playTrack(item);
    } catch (err) { console.error("Play error", err); }
  };

  const handlePlayItem = (item) => { playTrack(item); };

  const addToQueue = async (item) => {
    if (queue.some((q) => q.id === item.id)) return;
    setQueue((prev) => [...prev, item]);
    try {
      await api.addToQueue(item);
    } catch (err) { console.error("Queue add error", err); }
  };

  const removeFromQueue = async (index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    try {
      await api.removeFromQueue(index);
    } catch (err) { console.error("Queue remove error", err); }
  };

  const moveQueueItem = async (fromIndex, toIndex) => {
    try {
      await api.moveQueueItem(fromIndex, toIndex);
    } catch (err) { console.error("Queue move error", err); }
  };

  const playFromQueue = async (index) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    const item = q[index];
    try {
      await api.playFromQueue(index);
    } catch (err) { console.error("Play from queue error", err); }
    await ensureAudioReady(item);
  };

  const playNext = useCallback(async () => {
    try {
      await api.nextTrack();
    } catch (err) { console.error("Next error", err); }
  }, []);

  const togglePlay = useCallback(async () => {
    try {
      const res = await api.togglePlay();
      if (audioRef.current) {
        if (res.playing) audioRef.current.play().catch(() => {});
        else audioRef.current.pause();
      }
    } catch (err) { console.error("Toggle error", err); }
  }, []);

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMeta = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setCurrentTime(0);
      audioRef.current.play().catch(() => {});
    }
  };

  const handleEnded = () => {
    addHistory(currentId, currentTitle, currentThumb, duration);
    setPlaying(false);
    setCurrentTime(0);
    playNext();
  };

  const seek = async (e) => {
    const t = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
    try { await api.seek(t); } catch {}
  };

  const changeVolume = (v) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    api.setVolume(v).catch(() => {});
  };

  const clearHistory = () => setHistory([]);
  const removeHistoryItem = (index) => { setHistory((prev) => prev.filter((_, i) => i !== index)); };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => { el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); };
  }, [currentTrack]);

  // Follow play/pause from server
  useEffect(() => {
    if (!audioRef.current || !status) return;
    if (status.playing && audioRef.current.paused && currentTrack) {
      audioRef.current.play().catch(() => {});
    } else if (!status.playing && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [status?.playing]);

  const createPlaylist = () => {
    const name = newPlaylistName.trim(); if (!name) return;
    setPlaylists((prev) => [...prev, { id: genId(), name, tracks: [] }]); setNewPlaylistName("");
  };

  const deletePlaylist = (id) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (selectedPlaylist === id) setSelectedPlaylist(null);
  };

  const addToPlaylist = (playlistId, track) => {
    setPlaylists((prev) => prev.map((p) =>
      p.id === playlistId && !p.tracks.some((t) => t.id === track.id) ? { ...p, tracks: [...p.tracks, track] } : p
    )); setSaveOpen(null);
  };

  const removeFromPlaylist = (playlistId, trackIndex) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (pl) {
      const track = pl.tracks[trackIndex];
      if (track && track.id === currentId) {
        const remaining = pl.tracks.filter((_, i) => i !== trackIndex);
        if (remaining.length > 0) {
          const nextIdx = Math.min(trackIndex, remaining.length - 1);
          handlePlayItem(remaining[nextIdx]);
        }
      }
    }
    setPlaylists((prev) => prev.map((p) => p.id === playlistId ? { ...p, tracks: p.tracks.filter((_, i) => i !== trackIndex) } : p));
  };

  const movePlaylistTrack = (playlistId, fromIndex, toIndex) => {
    setPlaylists((prev) => prev.map((p) => {
      if (p.id !== playlistId) return p;
      const next = [...p.tracks];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...p, tracks: next };
    }));
  };

  const handleViewChange = (view) => {
    setActiveView(view);
    setSaveOpen(null);
    if (view === "playlists") setSelectedPlaylist(null);
  };

  const playPrevious = useCallback(async () => {
    try {
      await api.prevTrack();
    } catch (err) { console.error("Prev error", err); }
  }, []);

  // When currentId changes from WS (next/prev/queue), ensure audio is downloaded
  useEffect(() => {
    if (!currentId || !audioRef.current || downloadingTrack) return;
    const expectedUrl = api.getAudioUrl(currentId);
    if (audioRef.current.src === expectedUrl && audioRef.current.src !== "") return;

    const candidate = pendingItemRef.current?.id === currentId
      ? pendingItemRef.current
      : queueRef.current.find((q) => q.id === currentId);
    if (candidate) {
      pendingItemRef.current = null;
      ensureAudioReady(candidate);
    }
  }, [currentId]);

  const renderContent = () => {
    switch (activeView) {
      case "queue":
        return <QueueView queue={queue} queueIdx={queueIdx} currentId={status?.current_id} currentTitle={status?.current_title} currentThumb={status?.current_thumb} currentTime={status?.current_time} duration={status?.duration} onPlayFromQueue={playFromQueue} onRemoveFromQueue={removeFromQueue} onMoveQueueItem={moveQueueItem} />;
      case "history":
        return (
          <HistoryView
            history={history} onClearHistory={clearHistory} onRemoveFromHistory={removeHistoryItem}
            queue={queue} downloadedSongs={[]} downloading={[]}
            saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists} onAddToPlaylist={addToPlaylist}
            currentId={currentId} onPlay={handlePlayItem} onQueue={addToQueue} onDownload={() => {}}
            showDownload={false}
          />
        );
      case "playlists":
        return (
          <PlaylistsView
            selectedPlaylist={selectedPlaylist} playlists={playlists}
            newPlaylistName={newPlaylistName} onNewPlaylistNameChange={setNewPlaylistName}
            onCreatePlaylist={createPlaylist} onSelectPlaylist={setSelectedPlaylist}
            onDeletePlaylist={deletePlaylist} onBack={() => setSelectedPlaylist(null)}
            onAddAllToQueue={() => { const pl = playlists.find((p) => p.id === selectedPlaylist); if (pl) pl.tracks.forEach((t) => addToQueue(t)); }}
            currentId={currentId} downloading={[]} downloadedSongs={[]}
            queue={queue} saveOpen={saveOpen} onSaveToggle={setSaveOpen}
            onPlay={handlePlayItem} onQueue={addToQueue} onDownload={() => {}}
            onAddToPlaylist={addToPlaylist} onRemoveFromPlaylist={removeFromPlaylist}
            onImportPlaylistUrl={() => {}} onMovePlaylistTrack={movePlaylistTrack}
            showDownload={false}
          />
        );
      default:
        return (
          <SearchView
            query={query} onQueryChange={setQuery} onSearch={handleSearch}
            source={source} onSourceChange={setSource}
            hinaiFilters={hinaiFilters} onHinaiFiltersChange={setHinaiFilters}
            loading={loading} results={results} channels={channels}
            channelView={channelView} channelVideos={channelVideos} channelLoading={channelLoading}
            onOpenChannel={openChannel} onBackFromChannel={() => { setChannelView(null); setChannelVideos([]); }}
            queue={queue} downloadedSongs={[]} downloading={[]}
            saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists}
            onAddToPlaylist={addToPlaylist} currentId={currentId}
            onPlay={handlePlayItem} onQueue={addToQueue} onDownload={() => {}}
            showDownload={false}
          />
        );
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">shyqui-music</div>
        <NavTabs
          activeView={activeView}
          onViewChange={handleViewChange}
          counts={{ queue: queue.length, history: history.length, playlists: playlists.length }}
        />
        <div className="sidebar-footer">
          <div style={{ fontSize: "0.6rem", opacity: 0.5, padding: "4px 8px" }}>{user?.username}</div>
          <button className="sidebar-tool-btn" onClick={onLogout} title="Logout" style={{ fontSize: "0.6rem" }}>🚪</button>
        </div>
      </aside>

      <main className="main-area">
        <div className="content-scroll" key={activeView + (selectedPlaylist || "") + (channelView?.id || "")}>
          {renderContent()}
        </div>
      </main>

      <audio ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMeta}
        onEnded={handleEnded}
        onError={() => {}} />

      <Player
        currentTrack={currentTrack} currentTitle={currentTitle} currentThumb={currentThumb}
        currentId={currentId} playing={playing} loading={!!downloadingTrack || loading}
        currentTime={currentTime} duration={duration} volume={volume}
        queueLength={queueIdx >= 0 ? Math.max(0, queue.length - queueIdx - 1) : queue.length}
        onTogglePlay={togglePlay} onSeek={seek} onChangeVolume={changeVolume}
        onPrev={playPrevious} onNext={playNext}
      />
    </div>
  );
}

export default function WebApp() {
  const [token, setToken] = useState(() => localStorage.getItem("shyqui_token"));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("shyqui_user")); } catch { return null; }
  });

  const handleAuth = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem("shyqui_token");
    localStorage.removeItem("shyqui_user");
    setToken(null);
    setUser(null);
  };

  if (!token || !user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return <WebPlayerApp token={token} user={user} onLogout={handleLogout} />;
}
