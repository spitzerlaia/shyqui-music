import SearchBox from "../components/SearchBox";
import EmptyState from "../components/EmptyState";
import ChannelCard from "../components/ChannelCard";
import ChannelAvatar from "../components/ChannelAvatar";
import TrackRow from "../components/TrackRow";

export default function SearchView({
  query,
  onQueryChange,
  onSearch,
  loading,
  results,
  channels,
  channelView,
  channelVideos,
  channelLoading,
  onOpenChannel,
  onBackFromChannel,
  queue,
  saveOpen,
  onSaveToggle,
  playlists,
  onAddToPlaylist,
  currentId,
  onPlay,
  onQueue,
  onChannelClick,
}) {
  return (
    <>
      {!channelView && (
        <SearchBox value={query} onChange={onQueryChange} onSubmit={onSearch} loading={loading} />
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
        <TrackRow key={item.id} item={item} showSave showQueue
          currentId={currentId}
          isQueued={queue.some((q) => q.id === item.id)}
          saveOpen={saveOpen}
          playlists={playlists}
          onPlay={() => onPlay(item)}
          onQueue={onQueue}
          onSaveToggle={onSaveToggle}
          onAddToPlaylist={onAddToPlaylist}
          onChannelClick={onChannelClick} />
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

      {!channelView && !loading && results.length === 0 && channels.length === 0 && (
        <EmptyState message="Search for your favorite tracks" />
      )}

      {!channelView && results.map((item) => (
        <TrackRow key={item.id} item={item} showSave showQueue
          currentId={currentId}
          isQueued={queue.some((q) => q.id === item.id)}
          saveOpen={saveOpen}
          playlists={playlists}
          onPlay={() => onPlay(item)}
          onQueue={onQueue}
          onSaveToggle={onSaveToggle}
          onAddToPlaylist={onAddToPlaylist}
          onChannelClick={onChannelClick} />
      ))}
    </>
  );
}