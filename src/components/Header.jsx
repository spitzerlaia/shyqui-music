export default function Header({ showDebug, showSettings, onToggleDebug, onToggleSettings }) {
  return (
    <header>
      <div className="header-top">
        <div className="logo">shyqui-music</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn-debug ${showDebug ? "active" : ""}`} onClick={onToggleDebug}>🐛</button>
          <button className={`btn-settings ${showSettings ? "active" : ""}`} onClick={onToggleSettings}>⚙</button>
        </div>
      </div>
    </header>
  );
}
