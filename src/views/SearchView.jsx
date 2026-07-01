import SearchBox from "../components/SearchBox";
import EmptyState from "../components/EmptyState";
import ChannelCard from "../components/ChannelCard";
import ChannelAvatar from "../components/ChannelAvatar";
import TrackRow from "../components/TrackRow";

export default function SearchView({
  query,
  onQueryChange,
  onSearch,
  source,
  onSourceChange,
  hinaiFilters,
  onHinaiFiltersChange,
  loading,
  results,
  channels,
  channelView,
  channelVideos,
  channelLoading,
  onOpenChannel,
  onBackFromChannel,
  queue,
  history,
  onClearHistory,
  downloadedSongs,
  downloading,
  saveOpen,
  onSaveToggle,
  playlists,
  onAddToPlaylist,
  currentId,
  currentTitle,
  currentThumb,
  currentTime,
  duration,
  onPlay,
  onQueue,
  onDownload,
  onPlayFromQueue,
  onRemoveFromQueue,
}) {
  return (
    <>
      {!channelView && (
        <SearchBox value={query} onChange={onQueryChange} onSubmit={onSearch} loading={loading} source={source} onSourceChange={onSourceChange} hinaiFilters={hinaiFilters} onHinaiFiltersChange={onHinaiFiltersChange} />
      )}

      {channelView && (
        <div className="channel-header">
          <div className="results-header queue-header" style={{ cursor: "pointer" }} onClick={onBackFromChannel}>
            ← Back
          </div>
          <div className="channel-info">
            <ChannelAvatar name={channelView.name} />
            <div className="channel-name">{channelView.name}</div>
            {channelLoading && <div className="loading" style={{ padding: 0 }}><div className="spinner" /></div>}
          </div>
        </div>
      )}

      {channelView && !channelLoading && channelVideos.length > 0 && (
        <div className="results-header">Videos</div>
      )}
      {channelView && !channelLoading && channelVideos.length === 0 && !loading && (
        <EmptyState message="No videos found" />
      )}
      {channelView && channelVideos.map((item) => (
        <TrackRow key={item.id} item={item} showSave showQueue showDownload
          currentId={currentId}
          isDownloading={downloading.includes(item.id)}
          isDownloaded={downloadedSongs.some((s) => s.id === item.id)}
          isQueued={queue.some((q) => q.id === item.id)}
          saveOpen={saveOpen}
          playlists={playlists}
          onPlay={() => onPlay(item)}
          onQueue={onQueue}
          onDownload={onDownload}
          onSaveToggle={onSaveToggle}
          onAddToPlaylist={onAddToPlaylist} />
      ))}

      {!channelView && channels.length > 0 && (
        <>
          <div className="results-header">Channels</div>
          <div className="channels-row">
            {channels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} onSelect={onOpenChannel} />
            ))}
          </div>
        </>
      )}

      {!channelView && results.length > 0 && <div className="results-header">Songs</div>}

      {!channelView && !loading && results.length === 0 && channels.length === 0 && history.length === 0 && (
        <EmptyState message="Search for your favorite tracks" />
      )}

      {!channelView && results.map((item) => (
        <TrackRow key={item.id} item={item} showSave showQueue showDownload
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
          onAddToPlaylist={onAddToPlaylist} />
      ))}

      {!channelView && (currentId || queue.length > 0) && (
        <>
          <div className="results-header queue-header" style={{ marginTop: 12 }}>
            Queue <span className="queue-badge">{queue.length + (currentId ? 1 : 0)}</span>
          </div>
          {currentId && (
            <TrackRow item={{ id: currentId, title: currentTitle, thumbnail: currentThumb, duration: currentTime }} isCurrent />
          )}
          {queue.map((item, i) => (
            <TrackRow key={`${item.id}-${i}`} item={item}
              showRemove showPlay={false}
              onRowClick={() => onPlayFromQueue(i)}
              onRemove={() => onRemoveFromQueue(i)} />
          ))}
        </>
      )}

      {!channelView && history.length > 0 && (
        <>
          <div className="results-header queue-header" style={{ marginTop: 12 }}>
            History <button className="btn-clear" onClick={onClearHistory}><span>Clear</span></button>
          </div>
          {history.map((item, i) => (
            <TrackRow key={`h-${item.id}-${i}`} item={item} showSave showQueue showDownload
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
              onAddToPlaylist={onAddToPlaylist} />
          ))}
        </>
      )}
    </>
  );
}
