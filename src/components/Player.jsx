import { formatTime } from "../utils/helpers";
import VolumeSlider from "./VolumeSlider";

export default function Player({
  currentTrack,
  currentTitle,
  currentThumb,
  currentId,
  playing,
  loading,
  currentTime,
  duration,
  volume,
  queueLength,
  onTogglePlay,
  onSeek,
  onChangeVolume,
  onPrev,
  onNext,
}) {
  if (!currentTrack && !loading && !currentId) return null;
  const volIcon = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";

  return (
    <footer className={`player${loading && currentId ? " player-loading" : ""}`}>
      {loading && currentId && (
        <div className="player-loading-overlay"><div className="spinner" /></div>
      )}
      <div className="player-info">
        <img className="player-track-thumb" src={currentThumb || null} alt="" />
        <div className="player-track-name">{currentTitle || "Loading..."}</div>
      </div>
      <div className="player-controls">
        <div className="player-buttons">
          <button className="player-btn" disabled={loading} onClick={onPrev}>⏪</button>
          <button className="player-btn-play" disabled={loading} onClick={onTogglePlay}>
            <span>{loading ? "⏳" : playing ? "⏸" : "▶"}</span>
          </button>
          <button className="player-btn" disabled={loading || queueLength === 0} onClick={onNext}>
            <span style={{ opacity: queueLength === 0 ? 0.3 : 1 }}>⏩</span>
          </button>
        </div>
        <div className="player-progress">
          <span className="time">{loading ? "--:--" : formatTime(Number(currentTime))}</span>
          <input type="range" className="progress-bar" disabled={loading}
            min={0} max={duration || 0} value={currentTime} onChange={onSeek}
            style={{
              background: `linear-gradient(to right, #00f5ff 0%, #00f5ff ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.08) ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.08) 100%)`
            }} />
          <span className="time">{loading ? "--:--" : formatTime(Number(duration))}</span>
        </div>
      </div>
      <div className="player-volume">
        <span className="volume-icon">{volIcon}</span>
        <VolumeSlider value={volume} onChange={onChangeVolume} disabled={loading} />
      </div>
    </footer>
  );
}
