import VolumeSlider from "./VolumeSlider";

export default function SettingsPanel({ volume, onChangeVolume }) {
  const icon = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
  return (
    <div className="settings-panel" style={{ marginTop: 8 }}>
      <label className="settings-label">Volume</label>
      <div className="settings-volume">
        <span className="volume-icon" style={{ fontSize: "0.8rem" }}>{icon}</span>
        <VolumeSlider value={volume} onChange={onChangeVolume} className="settings-volume-bar" showPercent />
      </div>
    </div>
  );
}
