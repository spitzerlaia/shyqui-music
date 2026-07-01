import { useState, useRef, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { genId } from "./utils/helpers";
import { useLocalStorage } from "./hooks/useLocalStorage";
import Header from "./components/Header";
import NavTabs from "./components/NavTabs";
import SettingsPanel from "./components/SettingsPanel";
import Player from "./components/Player";
import DebugPanel from "./components/DebugPanel";
import SearchView from "./views/SearchView";
import QueueView from "./views/QueueView";
import PlaylistsView from "./views/PlaylistsView";
import DownloadsView from "./views/DownloadsView";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useLocalStorage("shyqui_volume", 0.7);
  const [currentId, setCurrentId] = useState(null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentThumb, setCurrentThumb] = useState("");
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useLocalStorage("shyqui_history", []);
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

  useEffect(() => { queueRef.current = queue; }, [queue]);

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
  }, [setHistory]);

  const playTrack = async (videoId, title, thumb) => {
    setLoading(true); setCurrentId(videoId);
    const cached = downloadedSongs.find((s) => s.id === videoId);
    if (cached) {
      const src = convertFileSrc(cached.file_path);
      addLog("Cached src: " + src);
      setCurrentTrack(src);
      if (cached.title) setCurrentTitle(cached.title);
      if (cached.thumbnail) setCurrentThumb(cached.thumbnail);
      setLoading(false); return;
    }
    setDownloading((prev) => [...prev, videoId]);
    try {
      const found = results.find((r) => r.id === videoId) || history.find((r) => r.id === videoId) || queue.find((r) => r.id === videoId);
      const meta = found ? { ...found, duration: String(found.duration ?? "") } : found;
      const absolutePath = await invoke("download_audio", { videoId, meta });
      addLog("Downloaded to: " + absolutePath);
      const src = convertFileSrc(absolutePath);
      addLog("Audio src: " + src);
      setCurrentTrack(src);
      if (title) setCurrentTitle(title); if (thumb) setCurrentThumb(thumb);
      loadDownloads();
    } catch (err) {
      addLog("Download error: " + err); setCurrentTrack(null); setCurrentId(null);
    } finally {
      setDownloading((prev) => prev.filter((id) => id !== videoId)); setLoading(false);
    }
  };

  const handlePlayItem = (item) => {
    playTrack(item.id, item.title, item.thumbnail);
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

  const handleViewChange = (view) => {
    setActiveView(view);
    setSaveOpen(null);
    if (view === "playlists") setSelectedPlaylist(null);
    if (view === "downloads") loadDownloads();
  };

  const skipBack5 = () => {
    if (audioRef.current) audioRef.current.currentTime -= 5;
  };

  const clearDebug = () => {
    setLogs([]);
    logRef.current = [];
  };

  const renderContent = () => {
    switch (activeView) {
      case "queue":
        return <QueueView queue={queue} currentId={currentId} currentTitle={currentTitle} currentThumb={currentThumb} currentTime={currentTime} duration={duration} onPlayFromQueue={playFromQueue} onRemoveFromQueue={removeFromQueue} />;
      case "playlists":
        return (
          <PlaylistsView
            selectedPlaylist={selectedPlaylist}
            playlists={playlists}
            newPlaylistName={newPlaylistName}
            onNewPlaylistNameChange={setNewPlaylistName}
            onCreatePlaylist={createPlaylist}
            onSelectPlaylist={setSelectedPlaylist}
            onDeletePlaylist={deletePlaylist}
            onBack={() => setSelectedPlaylist(null)}
            onAddAllToQueue={() => {
              const pl = playlists.find((p) => p.id === selectedPlaylist);
              if (pl) pl.tracks.forEach((t) => addToQueue(t));
            }}
            currentId={currentId}
            downloading={downloading}
            downloadedSongs={downloadedSongs}
            queue={queue}
            saveOpen={saveOpen}
            onSaveToggle={setSaveOpen}
            onPlay={handlePlayItem}
            onQueue={addToQueue}
            onDownload={downloadTrack}
            onAddToPlaylist={addToPlaylist}
            onRemoveFromPlaylist={removeFromPlaylist}
          />
        );
      case "downloads":
        return (
          <DownloadsView
            downloadedSongs={downloadedSongs}
            downloadFilter={downloadFilter}
            onFilterChange={setDownloadFilter}
            onRefresh={loadDownloads}
            onClearFilter={() => setDownloadFilter("")}
            currentId={currentId}
            queue={queue}
            onPlay={handlePlayItem}
            onQueue={addToQueue}
            onDelete={deleteDownload}
          />
        );
      default:
        return (
          <SearchView
            query={query}
            onQueryChange={setQuery}
            onSearch={handleSearch}
            loading={loading}
            results={results}
            channels={channels}
            channelView={channelView}
            channelVideos={channelVideos}
            channelLoading={channelLoading}
            onOpenChannel={openChannel}
            onBackFromChannel={() => { setChannelView(null); setChannelVideos([]); }}
            queue={queue}
            history={history}
            onClearHistory={clearHistory}
            downloadedSongs={downloadedSongs}
            downloading={downloading}
            saveOpen={saveOpen}
            onSaveToggle={setSaveOpen}
            playlists={playlists}
            onAddToPlaylist={addToPlaylist}
            currentId={currentId}
            currentTitle={currentTitle}
            currentThumb={currentThumb}
            currentTime={currentTime}
            duration={duration}
            onPlay={handlePlayItem}
            onQueue={addToQueue}
            onDownload={downloadTrack}
            onPlayFromQueue={playFromQueue}
            onRemoveFromQueue={removeFromQueue}
          />
        );
    }
  };

  return (
    <div className="container">
      <Header
        showDebug={showDebug}
        showSettings={showSettings}
        onToggleDebug={() => setShowDebug(!showDebug)}
        onToggleSettings={() => setShowSettings(!showSettings)}
      />
      <NavTabs
        activeView={activeView}
        onViewChange={handleViewChange}
        counts={{ queue: queue.length, playlists: playlists.length, downloads: downloadedSongs.length }}
      />
      {showSettings && (
        <SettingsPanel volume={volume} onChangeVolume={changeVolume} />
      )}

      {loading && !currentTrack && <div className="loading"><div className="spinner" /></div>}

      <section className="results" key={activeView + (selectedPlaylist || "") + (channelView?.id || "")}>
        {renderContent()}
      </section>

      <audio ref={audioRef} src={currentTrack}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMeta}
        onEnded={handleEnded}
        onError={(e) => addLog("Audio error: " + (e.target?.error?.message || e.type))} />

      <Player
        currentTrack={currentTrack}
        currentTitle={currentTitle}
        currentThumb={currentThumb}
        currentId={currentId}
        playing={playing}
        loading={loading}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        queueLength={queue.length}
        onTogglePlay={togglePlay}
        onSeek={seek}
        onChangeVolume={changeVolume}
        onPrev={skipBack5}
        onNext={playNext}
      />

      {showDebug && <DebugPanel logs={logs} onClear={clearDebug} />}
    </div>
  );
}

export default App;
