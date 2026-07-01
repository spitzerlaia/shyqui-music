export default function NavTabs({ activeView, onViewChange, counts = {} }) {
  const tabs = [
    { id: "search", label: "Search" },
    { id: "queue", label: "Queue", count: counts.queue },
    { id: "playlists", label: "Playlists", count: counts.playlists },
    { id: "downloads", label: "Downloads", count: counts.downloads },
  ];
  return (
    <nav className="nav-tabs">
      {tabs.map((tab) => (
        <button key={tab.id}
          className={`nav-tab ${activeView === tab.id ? "active" : ""}`}
          onClick={() => onViewChange(tab.id)}>
          {tab.label}
          {tab.count > 0 && <span className="nav-badge">{tab.count}</span>}
        </button>
      ))}
    </nav>
  );
}
