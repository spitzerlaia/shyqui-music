import { useState, useRef, useEffect } from "react";
import EmptyState from "../components/EmptyState";
import PlaylistCard from "../components/PlaylistCard";
import TrackRow from "../components/TrackRow";

export default function PlaylistsView({
  selectedPlaylist,
  playlists,
  newPlaylistName,
  onNewPlaylistNameChange,
  onCreatePlaylist,
  onSelectPlaylist,
  onDeletePlaylist,
  onBack,
  onAddAllToQueue,
  currentId,
  downloading,
  downloadedSongs,
  queue,
  saveOpen,
  onSaveToggle,
  onPlay,
  onQueue,
  onDownload,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onImportPlaylistUrl,
  onMovePlaylistTrack,
  showDownload = true,
}) {
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOff, setDragOff] = useState(0);
  const [dropIdx, setDropIdx] = useState(null);
  const [importUrl, setImportUrl] = useState("");
  const startY = useRef(0);
  const itemH = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (dragIdx === null) return;
    const clientY = (e) => e.touches ? e.touches[0].clientY : e.clientY;
    const onMove = (e) => {
      const off = clientY(e) - startY.current;
      setDragOff(off);
      const delta = Math.round(off / itemH.current);
      if (listRef.current) {
        const len = listRef.current.children.length;
        setDropIdx(Math.max(0, Math.min(len - 1, dragIdx + delta)));
      }
    };
    const onUp = () => {
      if (dropIdx !== null && dropIdx !== dragIdx) onMovePlaylistTrack(selectedPlaylist, dragIdx, dropIdx);
      setDragIdx(null);
      setDragOff(0);
      setDropIdx(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragIdx, dropIdx, selectedPlaylist]);

  const getStyle = (i) => {
    if (dragIdx === null) return { transition: "transform 0.2s ease" };
    if (i === dragIdx) return { transform: `translateY(${dragOff}px)`, zIndex: 10, opacity: 0.85, transition: "transform 0s", position: "relative" };
    if (dragIdx < i && i <= dropIdx) return { transform: `translateY(-${itemH.current}px)`, transition: "transform 0.2s ease" };
    if (dropIdx <= i && i < dragIdx) return { transform: `translateY(${itemH.current}px)`, transition: "transform 0.2s ease" };
    return { transition: "transform 0.2s ease" };
  };

  if (selectedPlaylist) {
    const pl = playlists.find((p) => p.id === selectedPlaylist);
    if (!pl) return null;
    return (
      <>
        <div className="results-header queue-header" style={{ cursor: "pointer" }} onClick={onBack}>
          ← Back
        </div>
        <div className="results-header queue-header">
          {pl.name} <span className="queue-badge">{pl.tracks.length}</span>
          {pl.tracks.length > 0 && (
            <button className="btn-add-all" onClick={onAddAllToQueue}>
              <span>Add all to queue</span>
            </button>
          )}
        </div>
        <div className="new-playlist">
          <input className="playlist-input" value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="Import from URL..."
            onKeyDown={(e) => e.key === "Enter" && importUrl.trim() && onImportPlaylistUrl(selectedPlaylist, importUrl)} />
          <button className="btn-play" onClick={() => { onImportPlaylistUrl(selectedPlaylist, importUrl); setImportUrl(""); }}
            disabled={!importUrl.trim()}><span>Import</span></button>
        </div>
        {pl.tracks.length === 0 && <EmptyState message="Playlist is empty" />}
        <div ref={listRef}>
          {pl.tracks.map((item, i) => (
            <div key={item.id || i} style={{ ...getStyle(i), willChange: dragIdx !== null ? "transform" : "auto" }}>
              <TrackRow item={item}
                showRemove showQueue
                showDownload={showDownload}
                showDragHandle
                currentId={currentId}
                isDownloading={downloading.includes(item.id)}
                isDownloaded={downloadedSongs.some((s) => s.id === item.id)}
                isQueued={queue.some((q) => q.id === item.id)}
                onPlay={() => onPlay(item)}
                onQueue={onQueue}
                onDownload={onDownload}
                onRemove={() => onRemoveFromPlaylist(selectedPlaylist, i)}
                onDragHandleMouseDown={(e) => {
                  e.preventDefault();
                  const el = listRef.current?.children[i];
                  if (!el) return;
                  startY.current = e.clientY;
                  itemH.current = el.getBoundingClientRect().height;
                  setDragIdx(i);
                  setDragOff(0);
                  setDropIdx(i);
                }}
                onDragHandleTouchStart={(e) => {
                  e.preventDefault();
                  const el = listRef.current?.children[i];
                  if (!el) return;
                  startY.current = e.touches[0].clientY;
                  itemH.current = el.getBoundingClientRect().height;
                  setDragIdx(i);
                  setDragOff(0);
                  setDropIdx(i);
                }} />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="results-header queue-header">Playlists</div>
      <div className="new-playlist">
        <input className="playlist-input" value={newPlaylistName}
          onChange={(e) => onNewPlaylistNameChange(e.target.value)}
          placeholder="New playlist name..."
          onKeyDown={(e) => e.key === "Enter" && onCreatePlaylist()} />
        <button className="btn-play" onClick={onCreatePlaylist}
          disabled={!newPlaylistName.trim()}><span>Create</span></button>
      </div>
      {playlists.length === 0 && <EmptyState message="No playlists yet" />}
      <div className="playlist-grid">
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p}
            onSelect={onSelectPlaylist} onDelete={onDeletePlaylist} />
        ))}
      </div>
    </>
  );
}
