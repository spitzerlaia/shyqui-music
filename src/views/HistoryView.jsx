import EmptyState from "../components/EmptyState";
import TrackRow from "../components/TrackRow";

export default function HistoryView({
  history,
  onClearHistory,
  onRemoveFromHistory,
  queue,
  downloadedSongs,
  downloading,
  saveOpen,
  onSaveToggle,
  playlists,
  onAddToPlaylist,
  currentId,
  onPlay,
  onQueue,
  onDownload,
}) {
  return (
    <>
      <div className="results-header queue-header">
        History {history.length > 0 && <span className="queue-badge">{history.length}</span>}
        {history.length > 0 && (
          <button className="btn-clear" onClick={onClearHistory}><span>Clear</span></button>
        )}
      </div>
      {history.length === 0 && <EmptyState message="No history yet" />}
      {history.map((item, i) => (
        <TrackRow key={`h-${item.id}-${i}`} item={item} showSave showQueue showDownload showRemove
          currentId={currentId}
          isQueued={queue.some((q) => q.id === item.id)}
          isDownloading={downloading.includes(item.id)}
          isDownloaded={downloadedSongs.some((s) => s.id === item.id)}
          saveOpen={saveOpen}
          playlists={playlists}
          onPlay={() => onPlay(item)}
          onQueue={onQueue}
          onDownload={onDownload}
          onSaveToggle={onSaveToggle}
          onAddToPlaylist={onAddToPlaylist}
          onRemove={() => onRemoveFromHistory(i)} />
      ))}
    </>
  );
}
