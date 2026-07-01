const STATUSES = [
  { value: "", label: "Any" },
  { value: "4", label: "Loved" },
  { value: "3", label: "Qualified" },
  { value: "1", label: "Ranked" },
  { value: "0", label: "Pending" },
  { value: "-1", label: "WIP" },
  { value: "-2", label: "Graveyard" },
];

const SORTS = [
  { value: "ranked_date_desc", label: "Ranked" },
  { value: "title_asc", label: "Title" },
  { value: "artist_asc", label: "Artist" },
  { value: "difficulty_desc", label: "Difficulty" },
  { value: "plays_desc", label: "Plays" },
  { value: "favourites_desc", label: "Favourites" },
  { value: "updated_desc", label: "Updated" },
];

const GENRES = [
  { value: 0, label: "Any" },
  { value: 1, label: "Unspecified" },
  { value: 2, label: "Video Game" },
  { value: 3, label: "Anime" },
  { value: 4, label: "Rock" },
  { value: 5, label: "Pop" },
  { value: 6, label: "Other" },
  { value: 7, label: "Novelty" },
  { value: 9, label: "Hip Hop" },
  { value: 10, label: "Electronic" },
  { value: 11, label: "Metal" },
  { value: 12, label: "Classical" },
  { value: 13, label: "Folk" },
  { value: 14, label: "Jazz" },
];

const LANGUAGES = [
  { value: 0, label: "Any" },
  { value: 1, label: "Unspecified" },
  { value: 2, label: "English" },
  { value: 3, label: "Japanese" },
  { value: 4, label: "Chinese" },
  { value: 5, label: "Instrumental" },
  { value: 6, label: "Korean" },
  { value: 7, label: "French" },
  { value: 8, label: "German" },
  { value: 9, label: "Swedish" },
  { value: 10, label: "Spanish" },
  { value: 11, label: "Italian" },
  { value: 12, label: "Russian" },
  { value: 13, label: "Polish" },
  { value: 14, label: "Dutch" },
  { value: 15, label: "Portuguese" },
  { value: 16, label: "Finnish" },
  { value: 17, label: "Norwegian" },
  { value: 19, label: "Hungarian" },
  { value: 20, label: "Hebrew" },
];

export default function SearchBox({ value, onChange, onSubmit, loading, source, onSourceChange, hinaiFilters, onHinaiFiltersChange, placeholder = "What do you want to listen to?" }) {
  const updateFilter = (key, val) => {
    onHinaiFiltersChange((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="search-box" style={{ marginBottom: 8 }}>
      <div className="search-row">
        <input value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()} />
        <button onClick={onSubmit} disabled={loading}>
          <span>{loading ? "Searching..." : "Search"}</span>
        </button>
      </div>
      <div className="source-selector">
        <button className={`source-btn ${source === "youtube" ? "source-active" : ""}`}
          onClick={() => onSourceChange("youtube")}>
          <span className="source-dot source-youtube" /> YouTube
        </button>
        <button className={`source-btn ${source === "hinai" ? "source-active" : ""}`}
          onClick={() => onSourceChange("hinai")}>
          <span className="source-dot source-hinai" /> Hinai
        </button>
      </div>
      {source === "hinai" && (
        <div className="filter-row">
          <select className="filter-select" value={hinaiFilters.status} onChange={(e) => updateFilter("status", e.target.value)}>
            <option value="" disabled>Status</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="filter-select" value={hinaiFilters.sort} onChange={(e) => updateFilter("sort", e.target.value)}>
            <option value="" disabled>Sort</option>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="filter-select" value={hinaiFilters.genre} onChange={(e) => updateFilter("genre", Number(e.target.value))}>
            <option value="0" disabled>Genre</option>
            {GENRES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <select className="filter-select" value={hinaiFilters.language} onChange={(e) => updateFilter("language", Number(e.target.value))}>
            <option value="0" disabled>Language</option>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
