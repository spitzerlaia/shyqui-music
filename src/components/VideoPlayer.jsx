import { useEffect, useRef } from "react";

let ytApiPromise = null;

function loadYT() {
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.body.appendChild(s);
    });
  }
  return ytApiPromise;
}

export default function VideoPlayer({ videoId, volume, onReady, onStateChange, onTime, onEnded, onError }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const videoIdRef = useRef(videoId);
  const volumeRef = useRef(volume);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onTimeRef = useRef(onTime);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);

  useEffect(() => { onReadyRef.current = onReady; });
  useEffect(() => { onStateChangeRef.current = onStateChange; });
  useEffect(() => { onTimeRef.current = onTime; });
  useEffect(() => { onEndedRef.current = onEnded; });
  useEffect(() => { onErrorRef.current = onError; });
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  useEffect(() => {
    let cancelled = false;
    loadYT().then((YT) => {
      if (cancelled || !hostRef.current) return;
      const host = hostRef.current;
      const p = new YT.Player(host, {
        videoId: videoIdRef.current,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            playerRef.current = e.target;
            e.target.setVolume(Math.round(volumeRef.current * 100));
            if (onReadyRef.current) onReadyRef.current(e.target);
          },
          onStateChange: (e) => {
            const YT = window.YT;
            if (e.data === YT.PlayerState.ENDED && onEndedRef.current) onEndedRef.current();
            if (onStateChangeRef.current) onStateChangeRef.current(e.data);
          },
          onError: (e) => { if (onErrorRef.current) onErrorRef.current(e.data); },
        },
      });
    });
    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (p && videoId && videoId !== videoIdRef.current) {
      p.loadVideoById(videoId);
    }
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    const p = playerRef.current;
    if (p) p.setVolume(Math.round(volume * 100));
  }, [volume]);

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (p && onTimeRef.current) onTimeRef.current(p.getCurrentTime(), p.getDuration());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <div ref={hostRef} className="video-player-host" />;
}