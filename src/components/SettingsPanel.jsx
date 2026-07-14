import { useState, useEffect } from "react";
import VolumeSlider from "./VolumeSlider";
import { invoke } from "../tauri";

function AccountManager() {
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");

  const loadUsers = async () => {
    try {
      setUsers(await invoke("list_users"));
    } catch {}
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async () => {
    if (!newUsername.trim() || newPassword.length < 3) {
      setMsg("Username required, password min 3 chars");
      return;
    }
    setMsg("");
    try {
      await invoke("create_user", { username: newUsername.trim(), password: newPassword });
      setNewUsername("");
      setNewPassword("");
      loadUsers();
    } catch (e) {
      setMsg(e);
    }
  };

  const handleDelete = async (userId) => {
    try {
      await invoke("delete_user", { userId });
      loadUsers();
    } catch (e) {
      setMsg(e);
    }
  };

  return (
    <div className="settings-section" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <label className="settings-label">Web Users</label>
      {users.length === 0 && <div style={{ fontSize: "0.7rem", opacity: 0.4 }}>No users</div>}
      {users.map((u) => (
        <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem" }}>
          <span style={{ flex: 1 }}>{u.username}</span>
          <button className="settings-btn" onClick={() => handleDelete(u.id)} style={{ color: "#ff6b6b" }}>Delete</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Username"
          style={{ flex: 1, minWidth: 80, padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.7rem", outline: "none" }} />
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Password"
          style={{ flex: 1, minWidth: 80, padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "0.7rem", outline: "none" }} />
        <button className="settings-btn" onClick={handleCreate}>Add</button>
      </div>
      {msg && <div style={{ fontSize: "0.65rem", color: "#ff6b6b", marginTop: 2 }}>{msg}</div>}
    </div>
  );
}

export default function SettingsPanel({ volume, onChangeVolume, serverInfo, onServerInfoChange }) {
  const icon = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
  const [toggling, setToggling] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [copied, setCopied] = useState(false);

  const enabled = serverInfo?.web_enabled ?? false;
  const available = serverInfo?.available ?? false;

  const handleToggle = async () => {
    setToggling(true);
    try {
      const info = await invoke("toggle_web_server", { enabled: !enabled });
      if (onServerInfoChange) onServerInfoChange(info);
    } catch (e) {
      console.error("Web toggle error:", e);
    } finally {
      setToggling(false);
    }
  };

  const handleCopyIp = () => {
    if (serverInfo?.url) {
      navigator.clipboard.writeText(serverInfo.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShowQr = async () => {
    if (serverInfo?.url) {
      try {
        const dataUrl = await invoke("generate_qr_code", { url: serverInfo.url });
        setQrData(qrData ? null : dataUrl);
      } catch (e) {
        console.error("QR error:", e);
      }
    }
  };

  return (
    <div className="settings-panel" style={{ marginTop: 8 }}>
      <div className="settings-section">
        <label className="settings-label">Volume</label>
        <div className="settings-volume">
          <span className="volume-icon" style={{ fontSize: "0.8rem" }}>{icon}</span>
          <VolumeSlider value={volume} onChange={onChangeVolume} className="settings-volume-bar" showPercent />
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Web Server</label>
        <label className="settings-toggle">
          <span>{enabled ? "On" : "Off"}</span>
          <input type="checkbox" checked={enabled} disabled={toggling} onChange={handleToggle} />
          <span className="settings-toggle-slider" />
        </label>
      </div>

      {available && (
        <div className="settings-section">
          <div className="settings-web-info">
            <span className="settings-web-url">{serverInfo?.url}</span>
          </div>
          {serverInfo?.upnp_ok === false && (
            <div className="settings-upnp-alert">
              ⚠️ UPnP is unavailable — use port forwarding (<strong>{serverInfo?.local_ip}:{serverInfo?.port}</strong>) or enable UPnP on your router
            </div>
          )}
          <div className="settings-web-actions">
            <button className="settings-btn" onClick={handleCopyIp}>
              {copied ? "Copied!" : "Copy IP"}
            </button>
            <button className="settings-btn" onClick={handleShowQr}>
              {qrData ? "Hide QR" : "QR Code"}
            </button>
          </div>
          {qrData && (
            <div className="settings-qr-container">
              <img src={qrData} alt="QR Code" className="settings-qr-img" />
            </div>
          )}
        </div>
      )}

      <AccountManager />
    </div>
  );
}
