import { useState, useRef, useEffect, useCallback } from "react";
import { invoke, convertFileSrc, isTauri } from "./tauri";
import * as api from "./api";
import { genId } from "./utils/helpers";
import { useLocalStorage } from "./hooks/useLocalStorage";
import NavTabs from "./components/NavTabs";
import SettingsPanel from "./components/SettingsPanel";
import Player from "./components/Player";
import DebugPanel from "./components/DebugPanel";
import SearchView from "./views/SearchView";
import QueueView from "./views/QueueView";
import PlaylistsView from "./views/PlaylistsView";
import HistoryView from "./views/HistoryView";
import DownloadsView from "./views/DownloadsView";
import "./App.css";

function exec(cmd, args) {
  return invoke(cmd, args);
}

export default function DesktopApp({ onLogout }) {
  if (typeof window !== "undefined" && !window.__TAURI_INTERNALS__) {
    return null;
  }

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
  const [currentId, setCurrentId] = useLocalStorage("shyqui_current_id", null);
  const [currentTitle, setCurrentTitle] = useLocalStorage("shyqui_current_title", "");
  const [currentThumb, setCurrentThumb] = useLocalStorage("shyqui_current_thumb", "");
  const [queue, setQueue] = useLocalStorage("shyqui_queue", []);
  const [queueIdx, setQueueIdx] = useLocalStorage("shyqui_queue_idx", -1);
  const [history, setHistory] = useLocalStorage("shyqui_history", []);
  const [keptIds, setKeptIds] = useLocalStorage("shyqui_kept_ids", []);
  const [downloading, setDownloading] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [playlists, setPlaylists] = useLocalStorage("shyqui_playlists", []);
  const [activeView, setActiveView] = useState("search");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [saveOpen, setSaveOpen] = useState(null);
  const [channelView, setChannelView] = useState(null);
  const [channelVideos, setChannelVideos] = useState([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [downloadedSongs, setDownloadedSongs] = useState([]);
  const [downloadFilter, setDownloadFilter] = useState("");
  const [hinaiFilters, setHinaiFilters] = useState({ status: "", sort: "ranked_date_desc", genre: 0, language: 0 });
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  const logRef = useRef([]);

  const addLog = (msg) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logRef.current = [...logRef.current.slice(-99), entry];
    setLogs(logRef.current);
    console.log(entry);
  };

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const queueIdxRef = useRef(-1);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIdxRef.current = queueIdx; }, [queueIdx]);

  useEffect(() => {
    (async () => {
      try { setServerInfo(await exec("get_server_info")); } catch {}
    })();
  }, []);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true); setChannelView(null);
    try {
      const isUrl = query.startsWith("http://") || query.startsWith("https://");
      if (isUrl) {
        const vids = await exec("fetch_url", { url: query });
        setResults(vids); setChannels([]);
      } else if (source === "hinai") {
        const [vids, chans] = await exec("search_hinai", { query, filters: hinaiFilters });
        setResults(vids); setChannels(chans);
      } else {
        const [vids, chans] = await exec("search_youtube", { query });
        setResults(vids); setChannels(chans);
      }
    } catch (err) { addLog("Search failed: " + err); }
    finally { setLoading(false); }
  };

  const openChannel = async (ch) => {
    setChannelView(ch); setChannelLoading(true); setActiveView("search");
    try {
      const vids = await exec("get_channel_videos", { channelUrl: ch.url });
      setChannelVideos(vids);
    } catch (err) { addLog("Channel failed: " + err); setChannelVideos([]); }
    finally { setChannelLoading(false); }
  };

  const addHistory = useCallback((id, title, thumb, dur) => {
    setHistory((prev) => {
      const next = [{ id, title, thumbnail: thumb, duration: dur, playedAt: Date.now() }, ...prev];
      return next.slice(0, 50);
    });
  }, [setHistory]);

  const playTrack = async (item) => {
    const { id: videoId, title, thumbnail, source: itemSource } = item;
    setLoading(true); setCurrentId(videoId);
    const cached = downloadedSongs.find((s) => s.id === videoId);
    if (cached) {
      const src = convertFileSrc(cached.file_path);
      setCurrentTrack(src);
      if (cached.title) setCurrentTitle(cached.title);
      if (cached.thumbnail) setCurrentThumb(cached.thumbnail);
      setLoading(false); return;
    }
    setDownloading((prev) => [...prev, videoId]);
    try {
      const found = results.find((r) => r.id === videoId) || history.find((r) => r.id === videoId) || queue.find((r) => r.id === videoId);
      const meta = found ? { ...found, duration: String(found.duration ?? "") } : null;
      let absolutePath;
      if ((itemSource || source) === "hinai") {
        absolutePath = await exec("download_hinai_audio", { beatmapId: videoId, meta });
      } else {
        absolutePath = await exec("download_audio", { videoId, meta });
      }
      const src = convertFileSrc(absolutePath);
      setCurrentTrack(src);
      if (title) setCurrentTitle(title); if (thumbnail) setCurrentThumb(thumbnail);
      loadDownloads();
    } catch (err) {
      addLog("Download error: " + err); setCurrentTrack(null); setCurrentId(null);
    } finally {
      setDownloading((prev) => prev.filter((id) => id !== videoId)); setLoading(false);
    }
  };

  const handlePlayItem = (item) => { playTrack(item); };

  const addToQueue = (item) => {
    if (!currentId && queueRef.current.length === 0) {
      playTrack(item);
      setQueue([item]);
      setQueueIdx(0);
      return;
    }
    setQueue((prev) => [...prev, item]);
    downloadTrack(item);
  };

  const removeFromQueue = (index) => {
    const q = queueRef.current;
    const removed = q[index];
    setQueue((prev) => prev.filter((_, i) => i !== index));
    setQueueIdx((prev) => {
      if (prev < 0) return prev;
      if (index < prev) return prev - 1;
      if (index === prev) return -1;
      return prev;
    });
    if (removed && !keptIds.includes(removed.id)) {
      exec("delete_downloaded_song", { videoId: removed.id })
        .then(() => setDownloadedSongs((prev) => prev.filter((s) => s.id !== removed.id)))
        .catch((e) => addLog("Auto-cleanup error: " + e));
    }
  };

  const moveQueueItem = (fromIndex, toIndex) => {
    setQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setQueueIdx((prev) => {
      if (prev < 0) return prev;
      if (prev === fromIndex) return toIndex;
      if (fromIndex < prev && prev <= toIndex) return prev - 1;
      if (toIndex <= prev && prev < fromIndex) return prev + 1;
      return prev;
    });
  };

  const playFromQueue = (index) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    const item = q[index];
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setQueueIdx(index);
    setCurrentTime(0); setDuration(0);
    playTrack(item);
  };

  const playNext = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    const q = queueRef.current;
    const nextIdx = queueIdxRef.current + 1;
    if (nextIdx < 0 || nextIdx >= q.length) {
      setCurrentTrack(null); setCurrentId(null); setCurrentTitle(""); setCurrentThumb("");
      setCurrentTime(0); setDuration(0); return;
    }
    setQueueIdx(nextIdx);
    setLoading(true);
    playTrack(q[nextIdx]);
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
    const finishedId = currentId;
    const wasFromQueue = queueIdxRef.current >= 0;
    addHistory(currentId, currentTitle, currentThumb, duration); setPlaying(false); setCurrentTime(0); playNext();
    if (finishedId && !wasFromQueue && !keptIds.includes(finishedId)) {
      exec("delete_downloaded_song", { videoId: finishedId })
        .then(() => setDownloadedSongs((prev) => prev.filter((s) => s.id !== finishedId)))
        .catch((e) => addLog("Auto-cleanup error: " + e));
    }
  };
  const seek = (e) => { if (audioRef.current) { audioRef.current.currentTime = e.target.value; setCurrentTime(e.target.value); } };
  const changeVolume = (v) => { setVolume(v); if (audioRef.current) audioRef.current.volume = v; };
  const clearHistory = () => setHistory([]);
  const removeHistoryItem = (index) => { setHistory((prev) => prev.filter((_, i) => i !== index)); };

  useEffect(() => { reconcileDownloads(); }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    const el = audioRef.current; if (!el) return;
    const onPlay = () => setPlaying(true); const onPause = () => setPlaying(false);
    el.addEventListener("play", onPlay); el.addEventListener("pause", onPause);
    return () => { el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); };
  }, [currentTrack]);

  const loadDownloads = async () => {
    try { setDownloadedSongs(await exec("get_downloaded_songs")); }
    catch (e) { addLog("Failed to load downloads: " + e); }
  };

  const reconcileDownloads = async () => {
    try {
      const all = await exec("get_downloaded_songs");
      const playlistIds = new Set(playlists.flatMap((p) => p.tracks.map((t) => t.id)));
      const toDelete = all.filter((s) => !keptIds.includes(s.id) && !playlistIds.has(s.id));
      for (const s of toDelete) {
        await exec("delete_downloaded_song", { videoId: s.id }).catch(() => {});
      }
      if (toDelete.length > 0) addLog(`Cleaned up ${toDelete.length} non-kept downloads`);
      const kept = new Set([...keptIds, ...playlistIds]);
      setDownloadedSongs(all.filter((s) => kept.has(s.id)));
    } catch (e) { addLog("Reconcile error: " + e); }
  };

  const downloadTrack = async (item) => {
    if (downloadedSongs.some((s) => s.id === item.id)) return;
    setDownloading((prev) => [...prev, item.id]);
    try {
      const meta = item ? { ...item, duration: String(item.duration ?? "") } : null;
      if ((item.source || source) === "hinai") {
        await exec("download_hinai_audio", { beatmapId: item.id, meta });
      } else {
        await exec("download_audio", { videoId: item.id, meta });
      }
      loadDownloads();
    } catch (e) { addLog("Download failed: " + e); }
    finally { setDownloading((prev) => prev.filter((id) => id !== item.id)); }
  };

  const keepDownload = (item) => {
    setKeptIds((prev) => prev.includes(item.id) ? prev : [...prev, item.id]);
    downloadTrack(item);
  };

  const deleteDownload = async (videoId) => {
    try {
      await exec("delete_downloaded_song", { videoId });
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
  const importPlaylistUrl = async (playlistId, url) => {
    try {
      const tracks = await exec("fetch_url", { url });
      tracks.forEach((track) => addToPlaylist(playlistId, track));
      addLog(`Imported ${tracks.length} tracks from URL`);
    } catch (err) { addLog("Import failed: " + err); }
  };
  const removeFromPlaylist = (playlistId, trackIndex) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (pl) {
      const track = pl.tracks[trackIndex];
      if (track && track.id === currentId) {
        const remaining = pl.tracks.filter((_, i) => i !== trackIndex);
        if (remaining.length > 0) {
          const nextIdx = Math.min(trackIndex, remaining.length - 1);
          playTrack(remaining[nextIdx]);
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
    if (view === "downloads") loadDownloads();
  };

  const playPrevious = () => {
    const q = queueRef.current;
    const prevIdx = queueIdxRef.current - 1;
    if (prevIdx >= 0 && prevIdx < q.length) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      setQueueIdx(prevIdx);
      setCurrentTime(0); setDuration(0);
      playTrack(q[prevIdx]);
    } else {
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  };

  const clearDebug = () => { setLogs([]); logRef.current = []; };

  const renderContent = () => {
    switch (activeView) {
      case "queue":
        return <QueueView queue={queue} queueIdx={queueIdx} currentId={currentId} currentTitle={currentTitle} currentThumb={currentThumb} currentTime={currentTime} duration={duration} onPlayFromQueue={playFromQueue} onRemoveFromQueue={removeFromQueue} onMoveQueueItem={moveQueueItem} />;
      case "history":
        return (
          <HistoryView
            history={history} onClearHistory={clearHistory} onRemoveFromHistory={removeHistoryItem}
            queue={queue} downloadedSongs={downloadedSongs} downloading={downloading}
            saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists} onAddToPlaylist={addToPlaylist}
            currentId={currentId} onPlay={handlePlayItem} onQueue={addToQueue} onDownload={keepDownload}
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
            currentId={currentId} downloading={downloading} downloadedSongs={downloadedSongs}
            queue={queue} saveOpen={saveOpen} onSaveToggle={setSaveOpen}
            onPlay={handlePlayItem} onQueue={addToQueue} onDownload={keepDownload}
            onAddToPlaylist={addToPlaylist} onRemoveFromPlaylist={removeFromPlaylist}
            onImportPlaylistUrl={importPlaylistUrl} onMovePlaylistTrack={movePlaylistTrack}
          />
        );
      case "downloads":
        return (
          <DownloadsView
            downloadedSongs={downloadedSongs} downloadFilter={downloadFilter}
            onFilterChange={setDownloadFilter} onRefresh={reconcileDownloads}
            onClearFilter={() => setDownloadFilter("")}
            currentId={currentId} queue={queue} onPlay={handlePlayItem}
            onQueue={addToQueue} onDelete={deleteDownload}
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
            queue={queue} downloadedSongs={downloadedSongs} downloading={downloading}
            saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists}
            onAddToPlaylist={addToPlaylist} currentId={currentId}
            onPlay={handlePlayItem} onQueue={addToQueue} onDownload={keepDownload}
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
          counts={{ queue: queue.length, history: history.length, playlists: playlists.length, downloads: downloadedSongs.length }}
        />
        <div className="sidebar-footer">
          {serverInfo?.available && (
            <a href={serverInfo.url} target="_blank" rel="noreferrer"
              className="sidebar-tool-btn"
              title={`Server at ${serverInfo.url}`}
              style={{ fontSize: "0.6rem", textDecoration: "none" }}>
              📡
            </a>
          )}
          <button className={`sidebar-tool-btn ${showDebug ? "active" : ""}`} onClick={() => setShowDebug(!showDebug)}>🐛</button>
          <button className={`sidebar-tool-btn ${showSettings ? "active" : ""}`} onClick={() => setShowSettings(!showSettings)}>⚙</button>
        </div>
      </aside>

      <main className="main-area">
        {serverInfo?.available && (
          <div style={{ position: "fixed", top: 8, right: 8, zIndex: 100, background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: "4px 10px", fontSize: "0.65rem", display: "flex", alignItems: "center", gap: 8 }}>
            <span>📡 {serverInfo.url}</span>
          </div>
        )}
        {showSettings && <SettingsPanel volume={volume} onChangeVolume={changeVolume} serverInfo={serverInfo} onServerInfoChange={setServerInfo} />}
        {loading && !currentTrack && <div className="loading"><div className="spinner" /></div>}
        <div className="content-scroll" key={activeView + (selectedPlaylist || "") + (channelView?.id || "")}>
          {renderContent()}
        </div>
      </main>

      <audio ref={audioRef} src={currentTrack}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMeta}
        onEnded={handleEnded}
        onError={(e) => addLog("Audio error: " + (e.target?.error?.message || e.type))} />

      <Player
        currentTrack={currentTrack} currentTitle={currentTitle} currentThumb={currentThumb}
        currentId={currentId} playing={playing} loading={loading}
        currentTime={currentTime} duration={duration} volume={volume}
        queueLength={queueIdx >= 0 ? Math.max(0, queue.length - queueIdx - 1) : queue.length}
        onTogglePlay={togglePlay} onSeek={seek} onChangeVolume={changeVolume}
        onPrev={playPrevious} onNext={playNext}
      />

      {showDebug && <DebugPanel logs={logs} onClear={clearDebug} />}
    </div>
  );
}
