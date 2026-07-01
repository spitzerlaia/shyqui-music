export default function DebugPanel({ logs, onClear }) {
  return (
    <div className="debug-panel">
      <div className="debug-header">
        <span>Debug Logs</span>
        <button className="btn-clear" onClick={onClear}><span>Clear</span></button>
      </div>
      <div className="debug-body">
        {logs.length === 0 && <div className="debug-empty">No logs</div>}
        {logs.map((l, i) => <div key={i} className="debug-line">{l}</div>)}
      </div>
    </div>
  );
}
