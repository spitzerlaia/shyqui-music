import { formatTime } from "../utils/helpers";
import SaveDropdown from "./SaveDropdown";

export default function TrackRow({
  item,
  showSave,
  showRemove,
  showPlay = true,
  showQueue,
  showDragHandle,
  isQueued,
  saveOpen,
  playlists,
  currentId,
  isCurrent,
  onPlay,
  onQueue,
  onSaveToggle,
  onAddToPlaylist,
  onRemove,
  onRowClick,
  onChannelClick,
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
          {item.title}
          {isCurrent && <span className="now-playing-badge">Now Playing</span>}
        </div>
        {item.channel && (
          <div className={`track-channel${onChannelClick ? " track-channel-clickable" : ""}`}
            onClick={onChannelClick ? (e) => { e.stopPropagation(); onChannelClick({ id: item.channel_id, name: item.channel, url: item.channel_url }); } : undefined}
            title={onChannelClick ? "View channel" : undefined}>
            {item.channel}
          </div>
        )}
      </div>
      <span className="track-duration">
        {item.duration != null
          ? (typeof item.duration === "string" && item.duration.includes(":") ? item.duration : formatTime(Number(item.duration)))
          : ""}
      </span>
      {!isCurrent && showSave && (
        <div className="save-wrapper">
          <button className="btn-save" onClick={(e) => { e.stopPropagation(); onSaveToggle(item.id); }}>
            💾
          </button>
          {saveOpen === item.id && (
            <SaveDropdown playlists={playlists} onAddToPlaylist={onAddToPlaylist} item={item} />
          )}
        </div>
      )}
      {!isCurrent && showQueue && (
        <button className="btn-queue" onClick={(e) => { e.stopPropagation(); onQueue(item); }} disabled={isQueued || item.id === currentId}>
          <span>{item.id === currentId ? "Playing" : isQueued ? "Queued" : "+"}</span>
        </button>
      )}
      {showRemove && <button className="btn-remove-sm" onClick={(e) => { e.stopPropagation(); onRemove(); }}><span>Remove</span></button>}
      {!isCurrent && showPlay && (
        <button className="btn-play" onClick={(e) => { e.stopPropagation(); onPlay(item); }}>
          <span>{item.id === currentId ? "Now Playing" : "Play"}</span>
        </button>
      )}
    </div>
  );
}