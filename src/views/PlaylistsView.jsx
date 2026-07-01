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
}) {
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
        {pl.tracks.length === 0 && <EmptyState message="Playlist is empty" />}
        {pl.tracks.map((item, i) => (
          <TrackRow key={`${item.id}-pl`} item={item}
            showRemove showQueue
            currentId={currentId}
            isDownloading={downloading.includes(item.id)}
            isDownloaded={downloadedSongs.some((s) => s.id === item.id)}
            isQueued={queue.some((q) => q.id === item.id)}
            onPlay={() => onPlay(item)}
            onQueue={onQueue}
            onDownload={onDownload}
            onRemove={() => onRemoveFromPlaylist(selectedPlaylist, i)} />
        ))}
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
