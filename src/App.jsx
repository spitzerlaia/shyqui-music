import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => load("shyqui_volume", 0.7));
  const [currentId, setCurrentId] = useState(null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentThumb, setCurrentThumb] = useState("");
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState(() => load("shyqui_history", []));
  const [downloading, setDownloading] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [playlists, setPlaylists] = useState(() => load("shyqui_playlists", []));
  const [activeView, setActiveView] = useState("search");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [saveOpen, setSaveOpen] = useState(null);
  const [channelView, setChannelView] = useState(null);
  const [channelVideos, setChannelVideos] = useState([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [downloadedSongs, setDownloadedSongs] = useState([]);
  const [downloadFilter, setDownloadFilter] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState([]);
  const logRef = useRef([]);
  const addLog = (msg) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logRef.current = [...logRef.current.slice(-99), entry];
    setLogs(logRef.current);
    console.log(entry);
  };

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const blobUrlRef = useRef(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { save("shyqui_volume", volume); }, [volume]);
  useEffect(() => { save("shyqui_history", history); }, [history]);
  useEffect(() => { save("shyqui_playlists", playlists); }, [playlists]);

  const formatTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true); setChannelView(null);
    try {
      const [vids, chans] = await invoke("search_youtube", { query });
      setResults(vids); setChannels(chans);
    } catch (err) { addLog("Search failed: " + err); }
    finally { setLoading(false); }
  };

  const openChannel = async (ch) => {
    setChannelView(ch); setChannelLoading(true); setActiveView("search");
    try {
      const vids = await invoke("get_channel_videos", { channelUrl: ch.url });
      setChannelVideos(vids);
    } catch (err) { addLog("Channel failed: " + err); setChannelVideos([]); }
    finally { setChannelLoading(false); }
  };

  const addHistory = useCallback((id, title, thumb, dur) => {
    setHistory((prev) => {
      const next = [{ id, title, thumbnail: thumb, duration: dur, playedAt: Date.now() }, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  const loadAudioBlob = async (filePath) => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    const b64 = await invoke("read_audio_base64", { path: filePath });
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    return url;
  };

  const playTrack = async (videoId, title, thumb) => {
    setLoading(true); setCurrentId(videoId);
    const cached = downloadedSongs.find((s) => s.id === videoId);
    if (cached) {
      try {
        const src = await loadAudioBlob(cached.file_path);
        addLog("Playing cached: " + cached.file_path);
        setCurrentTrack(src);
        if (cached.title) setCurrentTitle(cached.title);
        if (cached.thumbnail) setCurrentThumb(cached.thumbnail);
      } catch (e) {
        addLog("Blob error: " + e); setCurrentTrack(null); setCurrentId(null);
      }
      setLoading(false); return;
    }
    setDownloading((prev) => [...prev, videoId]);
    try {
      const meta = results.find((r) => r.id === videoId) || history.find((r) => r.id === videoId) || queue.find((r) => r.id === videoId);
      const absolutePath = await invoke("download_audio", { videoId, meta });
      addLog("Downloaded to: " + absolutePath);
      const src = await loadAudioBlob(absolutePath);
      addLog("Audio blob URL: " + src);
      setCurrentTrack(src);
      if (title) setCurrentTitle(title); if (thumb) setCurrentThumb(thumb);
      loadDownloads();
    } catch (err) {
      addLog("Download error: " + err); setCurrentTrack(null); setCurrentId(null);
    } finally {
      setDownloading((prev) => prev.filter((id) => id !== videoId)); setLoading(false);
    }
  };

  const prefetchNext = useCallback(async () => {}, []);

  const addToQueue = (item) => {
    if (!currentId && queueRef.current.length === 0) {
      playTrack(item.id, item.title, item.thumbnail);
      return;
    }
    setQueue((prev) => [...prev, item]);
    downloadTrack(item);
  };

  const removeFromQueue = (index) => { setQueue((prev) => prev.filter((_, i) => i !== index)); };

  const playFromQueue = (index) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    const item = q[index];
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setQueue(q.filter((_, i) => i !== index));
    setCurrentTime(0); setDuration(0);
    playTrack(item.id, item.title, item.thumbnail);
  };

  const playNext = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    const q = queueRef.current;
    if (q.length === 0) {
      setCurrentTrack(null); setCurrentId(null); setCurrentTitle(""); setCurrentThumb("");
      setCurrentTime(0); setDuration(0); return;
    }
    setLoading(true); const [next, ...rest] = q; setQueue(rest);
    playTrack(next.id, next.title, next.thumbnail);
  }, []);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause();
  }, []);

  const handleTimeUpdate = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); };
  const handleLoadedMeta = () => {
    if (audioRef.current) { setDuration(audioRef.current.duration); setCurrentTime(0); audioRef.current.play().catch(() => {}); }
  };
  const handleEnded = () => {
    addHistory(currentId, currentTitle, currentThumb, duration); setPlaying(false); setCurrentTime(0); playNext();
  };
  const seek = (e) => { if (audioRef.current) { audioRef.current.currentTime = e.target.value; setCurrentTime(e.target.value); } };
  const changeVolume = (v) => { setVolume(v); if (audioRef.current) audioRef.current.volume = v; };
  const clearHistory = () => setHistory([]);

  useEffect(() => { loadDownloads(); }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onPlay = () => setPlaying(true); const onPause = () => setPlaying(false);
    el.addEventListener("play", onPlay); el.addEventListener("pause", onPause);
    return () => { el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); };
  }, [currentTrack]);

  const loadDownloads = async () => {
    try { setDownloadedSongs(await invoke("get_downloaded_songs")); }
    catch (e) { addLog("Failed to load downloads: " + e); }
  };

  const downloadTrack = async (item) => {
    if (downloadedSongs.some((s) => s.id === item.id)) return;
    setDownloading((prev) => [...prev, item.id]);
    try {
      await invoke("download_audio", { videoId: item.id, meta: item });
      loadDownloads();
    } catch (e) { addLog("Download failed: " + e); }
    finally { setDownloading((prev) => prev.filter((id) => id !== item.id)); }
  };

  const deleteDownload = async (videoId) => {
    try {
      await invoke("delete_downloaded_song", { videoId });
      setDownloadedSongs((prev) => prev.filter((s) => s.id !== videoId));
    } catch (e) { addLog("Delete error: " + e); }
    if (currentId === videoId) { playNext(); }
  };

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
    downloadTrack(track);
  };
  const removeFromPlaylist = (playlistId, trackIndex) => {
    setPlaylists((prev) => prev.map((p) => p.id === playlistId ? { ...p, tracks: p.tracks.filter((_, i) => i !== trackIndex) } : p));
  };

  const trackRow = (item, opts = {}) => {
    const { showSave, showRemove, isQueue, isHistory, showPlay } = opts;
    const inQueue = queue.some((q) => q.id === item.id);
    const isDownloading = downloading.includes(item.id);
    const isDownloaded = downloadedSongs.some((s) => s.id === item.id);
    return (
      <div key={item.id + (isHistory ? "-h" : "")} className="track-item">
        <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
        <div className="track-info">
          <div className="track-title">{item.title}</div>
          {item.channel && <div className="track-channel">{item.channel}</div>}
          {isDownloading && <div className="downloading-indicator">Downloading<span className="dl-dots"><span>.</span><span>.</span><span>.</span></span></div>}
          {isDownloaded && !isDownloading && <div className="downloaded-badge">Cached</div>}
        </div>
        <span className="track-duration">{item.duration ? (item.duration.includes(":") ? item.duration : formatTime(Number(item.duration))) : ""}</span>
        {showSave && (
          <div className="save-wrapper">
            <button className="btn-save" onClick={() => setSaveOpen(saveOpen === item.id ? null : item.id)} disabled={isDownloading}>💾</button>
            {saveOpen === item.id && (
              <div className="save-dropdown">
                {playlists.length === 0 && <div className="save-empty">No playlists</div>}
                {playlists.map((p) => (<button key={p.id} className="save-option" onClick={() => addToPlaylist(p.id, item)}>{p.name}</button>))}
              </div>
            )}
          </div>
        )}
        {!isQueue && !isHistory && (
          <button className="btn-queue" onClick={() => addToQueue(item)} disabled={inQueue || isDownloading}><span>{inQueue ? "Queued" : "+"}</span></button>
        )}
        {!isQueue && !isHistory && !isDownloaded && (
          <button className="btn-download" onClick={() => downloadTrack(item)} disabled={isDownloading}><span>{isDownloading ? "..." : "DL"}</span></button>
        )}
        {isDownloaded && !isDownloading && <span className="dl-check">📥</span>}
        {showRemove && <button className="btn-remove-sm" onClick={() => removeFromPlaylist(selectedPlaylist, opts.trackIndex)}><span>Remove</span></button>}
        {showPlay !== false && (
          <button className="btn-play" onClick={() => playTrack(item.id, item.title, item.thumbnail)} disabled={isDownloading}>
            <span>{isDownloading ? "DL" : item.id === currentId ? "Now Playing" : "Play"}</span>
          </button>
        )}
      </div>
    );
  };

  const renderView = () => {
    if (activeView === "downloads") {
      const filtered = downloadFilter
        ? downloadedSongs.filter((s) => s.title.toLowerCase().includes(downloadFilter.toLowerCase()) || s.channel.toLowerCase().includes(downloadFilter.toLowerCase()))
        : downloadedSongs;
      return (
        <>
          <div className="results-header queue-header">
            Downloads
            <button className="btn-clear" onClick={loadDownloads}><span>Refresh</span></button>
          </div>
          <div className="search-box" style={{ marginBottom: 12 }}>
            <input value={downloadFilter} onChange={(e) => setDownloadFilter(e.target.value)} placeholder="Filter downloads..." />
            {downloadFilter && <button className="btn-clear" onClick={() => setDownloadFilter("")} style={{ flexShrink: 0, fontSize: "0.75rem" }}><span>Clear</span></button>}
          </div>
          {downloadedSongs.length === 0 && <div className="empty-state">No downloaded songs</div>}
          {downloadedSongs.length > 0 && filtered.length === 0 && <div className="empty-state">No matches</div>}
          {filtered.map((item) => {
            const size = item.size > 1048576 ? (item.size / 1048576).toFixed(1) + " MB" : (item.size / 1024).toFixed(0) + " KB";
            return (
              <div key={item.id} className="track-item">
                <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
                <div className="track-info">
                  <div className="track-title">{item.title !== item.id ? item.title : item.id}</div>
                  {item.channel && <div className="track-channel">{item.channel} · {size}</div>}
                  {!item.channel && <div className="track-channel">{size}</div>}
                </div>
                <button className="btn-remove-sm" onClick={() => deleteDownload(item.id)}><span>Delete</span></button>
                <button className="btn-play" onClick={() => playTrack(item.id, item.title, item.thumbnail)}><span>{item.id === currentId ? "Now Playing" : "Play"}</span></button>
              </div>
            );
          })}
        </>
      );
    }

    if (activeView === "queue") {
      return (
        <>
          {queue.length === 0 && <div className="empty-state">Queue is empty</div>}
          {queue.map((item, i) => (
            <div key={`${item.id}-${i}`} className="track-item queue-item" style={{cursor:"pointer"}} onClick={() => playFromQueue(i)}>
              <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
              <div className="track-info"><div className="track-title">{item.title}</div></div>
              <span className="track-duration">{item.duration}</span>
              <button className="btn-remove" onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }}><span>Remove</span></button>
            </div>
          ))}
        </>
      );
    }

    if (activeView === "playlists") {
      if (selectedPlaylist) {
        const pl = playlists.find((p) => p.id === selectedPlaylist);
        if (!pl) { setSelectedPlaylist(null); return null; }
        return (
          <>
            <div className="results-header queue-header" style={{ cursor: "pointer" }} onClick={() => setSelectedPlaylist(null)}>← Back</div>
            <div className="results-header queue-header">
              {pl.name} <span className="queue-badge">{pl.tracks.length}</span>
              {pl.tracks.length > 0 && <button className="btn-add-all" onClick={() => pl.tracks.forEach((t) => addToQueue(t))}><span>Add all to queue</span></button>}
            </div>
            {pl.tracks.length === 0 && <div className="empty-state">Playlist is empty</div>}
            {pl.tracks.map((item, i) => trackRow(item, { showRemove: true, trackIndex: i }))}
          </>
        );
      }
      return (
        <>
          <div className="results-header queue-header">Playlists</div>
          <div className="new-playlist">
            <input className="playlist-input" value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder="New playlist name..." onKeyDown={(e) => e.key === "Enter" && createPlaylist()} />
            <button className="btn-play" onClick={createPlaylist} disabled={!newPlaylistName.trim()}><span>Create</span></button>
          </div>
          {playlists.length === 0 && <div className="empty-state">No playlists yet</div>}
          <div className="playlist-grid">
            {playlists.map((p) => (
              <div key={p.id} className="playlist-card" onClick={() => setSelectedPlaylist(p.id)}>
                <div className="playlist-cover">{p.tracks.length > 0 ? <img src={p.tracks[0].thumbnail || null} alt="" /> : <span className="playlist-cover-empty">♪</span>}</div>
                <div className="playlist-card-body">
                  <div className="playlist-card-name">{p.name}</div>
                  <div className="playlist-card-count">{p.tracks.length} tracks</div>
                </div>
                <button className="btn-playlist-del" onClick={(e) => { e.stopPropagation(); deletePlaylist(p.id); }}>✕</button>
              </div>
            ))}
          </div>
        </>
      );
    }

    // Search view
    return (
      <>
        {!channelView && (
          <div className="search-box" style={{ marginBottom: 12 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you want to listen to?" onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <button onClick={handleSearch} disabled={loading}><span>{loading ? "Searching..." : "Search"}</span></button>
          </div>
        )}
        {channelView && (
          <div className="channel-header">
            <div className="results-header queue-header" style={{ cursor: "pointer" }} onClick={() => { setChannelView(null); setChannelVideos([]); }}>← Back</div>
            <div className="channel-info">
              <div className="channel-avatar">{channelView.name.charAt(0)}</div>
              <div className="channel-name">{channelView.name}</div>
              {channelLoading && <div className="loading" style={{ padding: 0 }}><div className="spinner" /></div>}
            </div>
          </div>
        )}
        {channelView && !channelLoading && channelVideos.length > 0 && (
          <div className="results-header">Videos</div>
        )}
        {channelView && !channelLoading && channelVideos.length === 0 && !loading && (
          <div className="empty-state">No videos found</div>
        )}
        {channelView && channelVideos.map((item) => trackRow(item, { showSave: true }))}

        {!channelView && channels.length > 0 && (
          <>
            <div className="results-header">Channels</div>
            <div className="channels-row">
              {channels.map((ch) => (
                <div key={ch.id} className="channel-card" onClick={() => openChannel(ch)}>
                  <div className="channel-card-avatar">{ch.name.charAt(0)}</div>
                  <div className="channel-card-name">{ch.name}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {!channelView && results.length > 0 && <div className="results-header">Songs</div>}
        {!channelView && !loading && results.length === 0 && channels.length === 0 && history.length === 0 && (
          <div className="empty-state">Search for your favorite tracks</div>
        )}
        {!channelView && results.map((item) => trackRow(item, { showSave: true }))}

        {!channelView && queue.length > 0 && (
          <>
            <div className="results-header queue-header" style={{ marginTop: 12 }}>Queue <span className="queue-badge">{queue.length}</span></div>
            {queue.map((item, i) => (
              <div key={`${item.id}-${i}`} className="track-item queue-item" style={{cursor:"pointer"}} onClick={() => playFromQueue(i)}>
                <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
                <div className="track-info"><div className="track-title">{item.title}</div></div>
                <span className="track-duration">{item.duration}</span>
                <button className="btn-remove" onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }}><span>Remove</span></button>
              </div>
            ))}
          </>
        )}
        {!channelView && history.length > 0 && (
          <>
            <div className="results-header queue-header" style={{ marginTop: 12 }}>
              History <button className="btn-clear" onClick={clearHistory}><span>Clear</span></button>
            </div>
            {history.map((item, i) => (
              <div key={`h-${item.id}-${i}`} className="track-item">
                <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" />
                <div className="track-info"><div className="track-title">{item.title}</div></div>
                <span className="track-duration">{item.duration ? formatTime(Number(item.duration)) : ""}</span>
                <button className="btn-play" onClick={() => playTrack(item.id, item.title, item.thumbnail)}><span>Play</span></button>
              </div>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <div className="container">
      <header>
        <div className="header-top">
          <div className="logo">shyqui-music</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className={`btn-debug ${showDebug ? "active" : ""}`} onClick={() => setShowDebug(!showDebug)}>🐛</button>
            <button className={`btn-settings ${showSettings ? "active" : ""}`} onClick={() => setShowSettings(!showSettings)}>⚙</button>
          </div>
        </div>
        <nav className="nav-tabs">
          <button className={`nav-tab ${activeView === "search" ? "active" : ""}`} onClick={() => { setActiveView("search"); setSaveOpen(null); }}>Search</button>
          <button className={`nav-tab ${activeView === "queue" ? "active" : ""}`} onClick={() => { setActiveView("queue"); setSaveOpen(null); }}>
            Queue{queue.length > 0 && <span className="nav-badge">{queue.length}</span>}
          </button>
          <button className={`nav-tab ${activeView === "playlists" ? "active" : ""}`} onClick={() => { setActiveView("playlists"); setSelectedPlaylist(null); setSaveOpen(null); }}>
            Playlists{playlists.length > 0 && <span className="nav-badge">{playlists.length}</span>}
          </button>
          <button className={`nav-tab ${activeView === "downloads" ? "active" : ""}`} onClick={() => { setActiveView("downloads"); setSaveOpen(null); loadDownloads(); }}>
            Downloads{downloadedSongs.length > 0 && <span className="nav-badge">{downloadedSongs.length}</span>}
          </button>
        </nav>
        {showSettings && (
          <div className="settings-panel" style={{ marginTop: 8 }}>
            <label className="settings-label">Volume</label>
            <div className="settings-volume">
              <span className="volume-icon" style={{fontSize:"0.8rem"}}>{volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</span>
              <input type="range" className="volume-bar settings-volume-bar" min={0} max={1} step={0.01} value={volume} onChange={(e) => changeVolume(parseFloat(e.target.value))} style={{background: `linear-gradient(to right, #00f5ff 0%, #00f5ff ${volume * 100}%, rgba(255,255,255,0.08) ${volume * 100}%, rgba(255,255,255,0.08) 100%)`}} />
              <span className="settings-vol-num">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        )}
      </header>

      {loading && !currentTrack && <div className="loading"><div className="spinner" /></div>}

      <section className="results" key={activeView + (selectedPlaylist || "") + (channelView?.id || "")}>
        {renderView()}
      </section>

      <audio ref={audioRef} src={currentTrack} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMeta} onEnded={handleEnded} onError={(e) => addLog("Audio error: " + (e.target?.error?.message || e.type))} />

      {(currentTrack || loading) && (
        <footer className={`player${loading && currentId ? " player-loading" : ""}`}>
          {loading && currentId && <div className="player-loading-overlay"><div className="spinner" /></div>}
          <div className="player-info">
            <img className="player-track-thumb" src={currentThumb || null} alt="" />
            <div className="player-track-name">{currentTitle || "Loading..."}</div>
          </div>
          <div className="player-controls">
            <div className="player-buttons">
              <button className="player-btn" disabled={loading} onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 5; }}>⏪</button>
              <button className="player-btn-play" disabled={loading} onClick={togglePlay}><span>{loading ? "⏳" : playing ? "⏸" : "▶"}</span></button>
              <button className="player-btn" disabled={loading || queue.length === 0} onClick={playNext}><span style={{ opacity: queue.length === 0 ? 0.3 : 1 }}>⏩</span></button>
            </div>
            <div className="player-progress">
              <span className="time">{loading ? "--:--" : formatTime(Number(currentTime))}</span>
              <input type="range" className="progress-bar" disabled={loading} min={0} max={duration || 0} value={currentTime} onChange={seek} style={{background: `linear-gradient(to right, #00f5ff 0%, #00f5ff ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.08) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.08) 100%)`}} />
              <span className="time">{loading ? "--:--" : formatTime(Number(duration))}</span>
            </div>
          </div>
          <div className="player-volume">
            <span className="volume-icon">{volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}</span>
            <input type="range" className="volume-bar" disabled={loading} min={0} max={1} step={0.01} value={volume} onChange={(e) => changeVolume(parseFloat(e.target.value))} style={{background: `linear-gradient(to right, #00f5ff 0%, #00f5ff ${volume * 100}%, rgba(255,255,255,0.08) ${volume * 100}%, rgba(255,255,255,0.08) 100%)`}} />
          </div>
        </footer>
      )}

      {showDebug && (
        <div className="debug-panel">
          <div className="debug-header">
            <span>Debug Logs</span>
            <button className="btn-clear" onClick={() => { setLogs([]); logRef.current = []; }}><span>Clear</span></button>
          </div>
          <div className="debug-body">
            {logs.length === 0 && <div className="debug-empty">No logs</div>}
            {logs.map((l, i) => <div key={i} className="debug-line">{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
