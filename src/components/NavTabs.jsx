export default function NavTabs({ activeView, onViewChange, counts = {} }) {
  const tabs = [
    { id: "search", icon: "🔍", label: "Search" },
    { id: "queue", icon: "📋", label: "Queue", count: counts.queue },
    { id: "history", icon: "🕐", label: "History", count: counts.history },
    { id: "playlists", icon: "📁", label: "Playlists", count: counts.playlists },
    { id: "downloads", icon: "⬇", label: "Downloads", count: counts.downloads },
  ];
  return (
    <nav className="sidebar-nav">
      {tabs.map((tab) => (
        <button key={tab.id}
          className={`sidebar-item ${activeView === tab.id ? "active" : ""}`}
          onClick={() => onViewChange(tab.id)}>
          <span className="sidebar-icon">{tab.icon}</span>
          <span className="sidebar-label">{tab.label}</span>
          {tab.count > 0 && <span className="sidebar-badge">{tab.count}</span>}
        </button>
      ))}
    </nav>
  );
}
