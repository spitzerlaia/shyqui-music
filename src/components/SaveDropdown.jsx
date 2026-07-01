export default function SaveDropdown({ playlists, onAddToPlaylist, item }) {
  return (
    <div className="save-dropdown">
      {playlists.length === 0 && <div className="save-empty">No playlists</div>}
      {playlists.map((p) => (
        <button key={p.id} className="save-option" onClick={() => onAddToPlaylist(p.id, item)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
