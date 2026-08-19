import VideoPlayer from "./VideoPlayer";

export default function NowPlaying({
  title,
  channel,
  thumbnail,
  volume,
  videoMode,
  videoOpen,
  onToggleVideo,
  onCloseVideo,
  onReady,
  onStateChange,
  onTime,
  onEnded,
  onError,
}) {
  return (
    <section className={`now-playing${videoOpen ? " now-playing-open" : ""}`}>
      <div className="now-playing-bar" onClick={onToggleVideo} title={videoOpen ? "Colapsar" : "Expandir"}>
        <img className="now-playing-thumb" src={thumbnail || null} alt="" />
        <div className="now-playing-info">
          <div className="now-playing-title">{title || "Reproduciendo..."}</div>
          {channel && <div className="now-playing-channel">{channel}</div>}
        </div>
        <span className="now-playing-badge">▶ Video</span>
        <button className="now-playing-toggle" onClick={(e) => { e.stopPropagation(); onToggleVideo(); }}>
          <span>{videoOpen ? "▾" : "▴"}</span>
        </button>
      </div>

      {videoMode && (
        <div className={`now-playing-frame${videoOpen ? "" : " np-mini"}`} title={videoOpen ? "" : "Expandir video"}>
          <VideoPlayer
            videoId={videoMode}
            volume={volume}
            onReady={onReady}
            onStateChange={onStateChange}
            onTime={onTime}
            onEnded={onEnded}
            onError={onError}
          />
          {!videoOpen && (
            <>
              <div className="np-mini-overlay" onClick={onToggleVideo} />
              <button className="np-mini-close" onClick={(e) => { e.stopPropagation(); onCloseVideo(); }} title="Cerrar video">✕</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}