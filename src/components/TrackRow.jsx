import { formatTime } from "../utils/helpers";
import SaveDropdown from "./SaveDropdown";

export default function TrackRow({
  item,
  showSave,
  showRemove,
  showPlay = true,
  showQueue,
  showDownload,
  showDragHandle,
  isQueued,
  isDownloading,
  isDownloaded,
  saveOpen,
  playlists,
  currentId,
  isCurrent,
  onPlay,
  onQueue,
  onDownload,
  onSaveToggle,
  onAddToPlaylist,
  onRemove,
  onRowClick,
  onDragHandleMouseDown,
  onDragHandleTouchStart,
}) {
  const classes = ["track-item"];
  if (showDragHandle || onRowClick) classes.push("queue-item");
  if (isCurrent) classes.push("track-item-current");

  return (
    <div className={classes.join(" ")}
      style={onRowClick && !isCurrent ? { cursor: "pointer" } : undefined}
      onClick={!isCurrent && onRowClick ? () => onRowClick() : undefined}>
      {showDragHandle && (
        <div className="drag-handle"
          onMouseDown={(e) => { e.stopPropagation(); onDragHandleMouseDown?.(e); }}
          onTouchStart={(e) => { e.stopPropagation(); onDragHandleTouchStart?.(e); }}>
          <span>≡</span>
        </div>
      )}
      {item.thumbnail ? <img className="track-thumb" src={item.thumbnail} alt="" loading="lazy" /> : <div className="track-thumb track-thumb-placeholder" />}
      <div className="track-info">
        <div className="track-title">
          {item.source && <span className={`source-tag source-tag-${item.source}`}>{item.source === "youtube" ? "YT" : "HN"}</span>}
          {item.title}
          {isCurrent && <span className="now-playing-badge">Now Playing</span>}
        </div>
        {item.channel && <div className="track-channel">{item.channel}</div>}
        {isDownloading && (
          <div className="downloading-indicator">
            Downloading<span className="dl-dots"><span>.</span><span>.</span><span>.</span></span>
          </div>
        )}
        {isDownloaded && !isDownloading && <div className="downloaded-badge">Cached</div>}
      </div>
      <span className="track-duration">
        {item.duration != null
          ? (typeof item.duration === "string" && item.duration.includes(":") ? item.duration : formatTime(Number(item.duration)))
          : ""}
      </span>
      {!isCurrent && showSave && (
        <div className="save-wrapper">
          <button className="btn-save" onClick={(e) => { e.stopPropagation(); onSaveToggle(item.id); }} disabled={isDownloading}>
            💾
          </button>
          {saveOpen === item.id && (
            <SaveDropdown playlists={playlists} onAddToPlaylist={onAddToPlaylist} item={item} />
          )}
        </div>
      )}
      {!isCurrent && showQueue && (
        <button className="btn-queue" onClick={(e) => { e.stopPropagation(); onQueue(item); }} disabled={isQueued || isDownloading || item.id === currentId}>
          <span>{item.id === currentId ? "Playing" : isQueued ? "Queued" : "+"}</span>
        </button>
      )}
      {!isCurrent && showDownload && !isDownloaded && (
        <button className="btn-download" onClick={(e) => { e.stopPropagation(); onDownload(item); }} disabled={isDownloading}>
          <span>{isDownloading ? "..." : "DL"}</span>
        </button>
      )}
      {!isCurrent && isDownloaded && !isDownloading && <span className="dl-check">📥</span>}
      {showRemove && <button className="btn-remove-sm" onClick={(e) => { e.stopPropagation(); onRemove(); }}><span>Remove</span></button>}
      {!isCurrent && showPlay && (
        <button className="btn-play" onClick={(e) => { e.stopPropagation(); onPlay(item); }} disabled={isDownloading}>
          <span>{isDownloading ? "DL" : item.id === currentId ? "Now Playing" : "Play"}</span>
        </button>
      )}
    </div>
  );
}
