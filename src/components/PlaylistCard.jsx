export default function PlaylistCard({ playlist, onSelect, onDelete }) {
  return (
    <div className="playlist-card" onClick={() => onSelect(playlist.id)}>
      <div className="playlist-cover">
        {playlist.tracks.length > 0
          ? <img src={playlist.tracks[0].thumbnail} alt="" />
          : <span className="playlist-cover-empty">♪</span>}
      </div>
      <div className="playlist-card-body">
        <div className="playlist-card-name">{playlist.name}</div>
        <div className="playlist-card-count">{playlist.tracks.length} tracks</div>
      </div>
      <button className="btn-playlist-del" onClick={(e) => { e.stopPropagation(); onDelete(playlist.id); }}>✕</button>
    </div>
  );
}
