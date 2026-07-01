import { formatSize } from "../utils/helpers";
import EmptyState from "../components/EmptyState";
import TrackRow from "../components/TrackRow";

export default function DownloadsView({
  downloadedSongs,
  downloadFilter,
  onFilterChange,
  onRefresh,
  onClearFilter,
  currentId,
  queue,
  onPlay,
  onQueue,
  onDelete,
}) {
  const filtered = downloadFilter
    ? downloadedSongs.filter((s) =>
        s.title.toLowerCase().includes(downloadFilter.toLowerCase()) ||
        s.channel.toLowerCase().includes(downloadFilter.toLowerCase()))
    : downloadedSongs;

  return (
    <>
      <div className="results-header queue-header">
        Downloads
        <button className="btn-clear" onClick={onRefresh}><span>Refresh</span></button>
      </div>
      <div className="search-box" style={{ marginBottom: 12 }}>
        <input value={downloadFilter} onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter downloads..." />
        {downloadFilter && (
          <button className="btn-clear" onClick={onClearFilter}
            style={{ flexShrink: 0, fontSize: "0.75rem" }}><span>Clear</span></button>
        )}
      </div>
      {downloadedSongs.length === 0 && <EmptyState message="No downloaded songs" />}
      {downloadedSongs.length > 0 && filtered.length === 0 && <EmptyState message="No matches" />}
      {filtered.map((item) => (
        <TrackRow key={item.id} item={item}
          showQueue showRemove showDownload={false}
          currentId={currentId}
          isDownloaded
          isQueued={queue.some((q) => q.id === item.id)}
          onPlay={() => onPlay(item)}
          onQueue={onQueue}
          onRemove={() => onDelete(item.id)} />
      ))}
    </>
  );
}
