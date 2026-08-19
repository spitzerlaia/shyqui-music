export default function SearchBox({ value, onChange, onSubmit, loading, placeholder = "What do you want to listen to?" }) {
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
    </div>
  );
}