import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "./tauri";
import { genId } from "./utils/helpers";
import { useLocalStorage } from "./hooks/useLocalStorage";
import NavTabs from "./components/NavTabs";
import Player from "./components/Player";
import NowPlaying from "./components/NowPlaying";
import SearchView from "./views/SearchView";
import QueueView from "./views/QueueView";
import PlaylistsView from "./views/PlaylistsView";
import HistoryView from "./views/HistoryView";
import SettingsPanel from "./components/SettingsPanel";
import { hexToRgb, mixHex, buildThemeFrom, normalizeTheme } from "./themes";
import "./App.css";

export default function DesktopApp() {
  if (typeof window !== "undefined" && !window.__TAURI_INTERNALS__) {
    return null;
  }

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useLocalStorage("shyqui_volume", 0.7);
  const [currentId, setCurrentId] = useLocalStorage("shyqui_current_id", null);
  const [currentTitle, setCurrentTitle] = useLocalStorage("shyqui_current_title", "");
  const [currentThumb, setCurrentThumb] = useLocalStorage("shyqui_current_thumb", "");
  const [currentChannel, setCurrentChannel] = useLocalStorage("shyqui_current_channel", "");
  const [queue, setQueue] = useLocalStorage("shyqui_queue", []);
  const [queueIdx, setQueueIdx] = useLocalStorage("shyqui_queue_idx", -1);
  const [history, setHistory] = useLocalStorage("shyqui_history", []);
  const [playlists, setPlaylists] = useLocalStorage("shyqui_playlists", []);
  const [activeView, setActiveView] = useState("search");
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [saveOpen, setSaveOpen] = useState(null);
  const [channelView, setChannelView] = useState(null);
  const [channelVideos, setChannelVideos] = useState([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoMode, setVideoMode] = useState(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useLocalStorage(
    "shyqui_theme",
    { ...buildThemeFrom("#ff6fb8", "#22101d"), preset: "rosa" },
    normalizeTheme
  );

  const playerRef = useRef(null);
  const queueRef = useRef([]);
  const queueIdxRef = useRef(-1);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIdxRef.current = queueIdx; }, [queueIdx]);

  useEffect(() => {
    const style = document.documentElement.style;
    const setTriplet = (name, hex) => style.setProperty(name, hexToRgb(hex).join(" "));
    setTriplet("--accent", theme.accent);
    setTriplet("--text", theme.text);
    setTriplet("--glass", theme.glass);
    setTriplet("--danger", theme.danger);
    setTriplet("--warn", theme.warn);
    setTriplet("--star", theme.star);
    style.setProperty("--bg-1", theme.bg);
    style.setProperty("--bg-2", mixHex(theme.bg, "#000000", 12));
    style.setProperty("--bg-3", mixHex(theme.bg, "#000000", 30));
    style.setProperty("--on-accent", theme.onAccent);
    style.setProperty("--text-soft", theme.textSoft);
  }, [theme]);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true); setChannelView(null); setError(null);
    try {
      const isUrl = /^https?:\/\//.test(query) ||
        query.includes("youtube.com/") ||
        query.includes("youtu.be/") ||
        /^[A-Za-z0-9_-]{11}$/.test(query.trim());
      if (isUrl) {
        const [tracks, chans] = await invoke("fetch_url", { url: query });
        setResults(tracks); setChannels(chans);
      } else {
        const [vids, chans] = await invoke("search_youtube", { query });
        setResults(vids); setChannels(chans);
      }
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const openChannel = async (ch) => {
    if (!ch || !ch.id) return;
    setChannelView({ ...ch }); setChannelLoading(true); setActiveView("search"); setError(null);
    try {
      const vids = await invoke("get_channel_videos", { channelId: ch.id });
      setChannelVideos(vids);
    } catch (err) {
      console.error(err);
      setError(String(err));
      setChannelVideos([]);
    } finally {
      setChannelLoading(false);
    }
  };

  const handleChannelClick = (ch) => {
    openChannel(ch);
  };

  const addHistory = useCallback((id, title, thumb, dur) => {
    setHistory((prev) => {
      const next = [{ id, title, thumbnail: thumb, duration: dur, playedAt: Date.now() }, ...prev];
      return next.slice(0, 50);
    });
  }, [setHistory]);

  const playTrack = (item) => {
    const { id: videoId, title, thumbnail } = item;
    setLoading(true); setCurrentId(videoId); setError(null);
    setVideoMode(videoId);
    setCurrentTime(0); setDuration(0);
    if (title) setCurrentTitle(title);
    if (thumbnail) setCurrentThumb(thumbnail);
    if (item.channel) setCurrentChannel(item.channel);
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
  };

  const removeFromQueue = (index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    setQueueIdx((prev) => {
      if (prev < 0) return prev;
      if (index < prev) return prev - 1;
      if (index === prev) return -1;
      return prev;
    });
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
    if (q[index].id === currentId && playerRef.current) {
      playerRef.current.seekTo(0, true);
      playerRef.current.playVideo();
      return;
    }
    setQueueIdx(index);
    playTrack(q[index]);
  };

  const playNext = useCallback(() => {
    const q = queueRef.current;
    const nextIdx = queueIdxRef.current + 1;
    if (nextIdx < 0 || nextIdx >= q.length) {
      setCurrentId(null); setVideoMode(null); setPlaying(false);
      setCurrentTitle(""); setCurrentThumb(""); setCurrentChannel("");
      setCurrentTime(0); setDuration(0); return;
    }
    setQueueIdx(nextIdx);
    playTrack(q[nextIdx]);
  }, []);

  const playPrevious = () => {
    const q = queueRef.current;
    const prevIdx = queueIdxRef.current - 1;
    if (prevIdx >= 0 && prevIdx < q.length) {
      setQueueIdx(prevIdx);
      playTrack(q[prevIdx]);
    } else if (playerRef.current) {
      playerRef.current.seekTo(0, true);
      setCurrentTime(0);
    }
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    playing ? p.pauseVideo() : p.playVideo();
  };

  const handlePlayerReady = (p) => {
    playerRef.current = p;
    p.setVolume(Math.round(volume * 100));
    setDuration(p.getDuration() || 0);
    setLoading(false);
  };

  const handlePlayerState = (state) => {
    const YT = window.YT;
    if (!YT) return;
    if (state === YT.PlayerState.PLAYING) {
      setPlaying(true); setLoading(false);
    } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.BUFFERING) {
      setPlaying(false);
    }
  };

  const handlePlayerTime = (cur, dur) => {
    setCurrentTime(cur);
    if (dur) setDuration(dur);
  };

  const handleEnded = () => {
    addHistory(currentId, currentTitle, currentThumb, duration);
    setPlaying(false); setCurrentTime(0);
    playNext();
  };

  const handlePlayerError = () => {
    setError("El reproductor no pudo cargar el video. Prueba con otro.");
    setLoading(false);
  };

  const seek = (e) => {
    const v = parseFloat(e.target.value);
    setCurrentTime(v);
    if (playerRef.current) playerRef.current.seekTo(v, true);
  };

  const changeVolume = (v) => {
    setVolume(v);
    if (playerRef.current) playerRef.current.setVolume(Math.round(v * 100));
  };

  const clearHistory = () => setHistory([]);
  const removeHistoryItem = (index) => { setHistory((prev) => prev.filter((_, i) => i !== index)); };

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
  const importPlaylistUrl = async (playlistId, url) => {
    try {
      const [tracks] = await invoke("fetch_url", { url });
      tracks.forEach((track) => addToPlaylist(playlistId, track));
    } catch (err) {
      console.error(err);
      setError(String(err));
    }
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
  };

  const renderContent = () => {
    switch (activeView) {
      case "queue":
        return <QueueView queue={queue} queueIdx={queueIdx} currentId={currentId} currentTitle={currentTitle} currentThumb={currentThumb} currentTime={currentTime} duration={duration} onPlayFromQueue={playFromQueue} onRemoveFromQueue={removeFromQueue} onMoveQueueItem={moveQueueItem} saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists} onAddToPlaylist={addToPlaylist} onChannelClick={handleChannelClick} />;
      case "history":
        return (
          <HistoryView
            history={history} onClearHistory={clearHistory} onRemoveFromHistory={removeHistoryItem}
            queue={queue} saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists} onAddToPlaylist={addToPlaylist}
            currentId={currentId} onPlay={handlePlayItem} onQueue={addToQueue}
            onChannelClick={handleChannelClick}
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
            currentId={currentId} queue={queue} saveOpen={saveOpen} onSaveToggle={setSaveOpen}
            onPlay={handlePlayItem} onQueue={addToQueue}
            onAddToPlaylist={addToPlaylist} onRemoveFromPlaylist={removeFromPlaylist}
            onImportPlaylistUrl={importPlaylistUrl} onMovePlaylistTrack={movePlaylistTrack}
            onChannelClick={handleChannelClick}
          />
        );
      default:
        return (
          <SearchView
            query={query} onQueryChange={setQuery} onSearch={handleSearch}
            loading={loading} results={results} channels={channels}
            channelView={channelView} channelVideos={channelVideos} channelLoading={channelLoading}
            onOpenChannel={openChannel} onBackFromChannel={() => { setChannelView(null); setChannelVideos([]); }}
            queue={queue} saveOpen={saveOpen} onSaveToggle={setSaveOpen} playlists={playlists}
            onAddToPlaylist={addToPlaylist} currentId={currentId}
            onPlay={handlePlayItem} onQueue={addToQueue}
            onChannelClick={handleChannelClick}
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
          <button
            className={`sidebar-tool-btn${showSettings ? " active" : ""}`}
            onClick={() => setShowSettings((s) => !s)}
            title="Colores"
          >
            🎨
          </button>
        </div>
      </aside>

      {showSettings && (
        <SettingsPanel theme={theme} onThemeChange={setTheme} onClose={() => setShowSettings(false)} />
      )}

      <main className="main-area">
        {error && (
          <div className="error-banner" onClick={() => setError(null)}>{error}</div>
        )}
        {currentId && (
          <NowPlaying
            title={currentTitle}
            channel={currentChannel}
            thumbnail={currentThumb}
            volume={volume}
            videoMode={videoMode}
            videoOpen={videoOpen}
            onToggleVideo={() => setVideoOpen((v) => !v)}
            onCloseVideo={() => { if (playerRef.current) playerRef.current.pauseVideo(); setVideoOpen(false); }}
            onReady={handlePlayerReady}
            onStateChange={handlePlayerState}
            onTime={handlePlayerTime}
            onEnded={handleEnded}
            onError={handlePlayerError}
          />
        )}
        {loading && !currentId && <div className="loading"><div className="spinner" /></div>}
        <div className="content-scroll" key={activeView + (selectedPlaylist || "") + (channelView?.id || "")}>
          {renderContent()}
        </div>
      </main>

      <Player
        currentTitle={currentTitle} currentThumb={currentThumb}
        currentId={currentId} playing={playing} loading={loading}
        currentTime={currentTime} duration={duration} volume={volume}
        queueLength={queueIdx >= 0 ? Math.max(0, queue.length - queueIdx - 1) : queue.length}
        onTogglePlay={togglePlay} onSeek={seek} onChangeVolume={changeVolume}
        onPrev={playPrevious} onNext={playNext}
      />
    </div>
  );
}