import { useState, useRef, useEffect } from "react";
import EmptyState from "../components/EmptyState";
import TrackRow from "../components/TrackRow";

export default function QueueView({ queue, queueIdx, currentId, currentTitle, currentThumb, currentTime, duration, onPlayFromQueue, onRemoveFromQueue, onMoveQueueItem }) {
  const currentItem = currentId ? { id: currentId, title: currentTitle, thumbnail: currentThumb, duration: currentTime } : null;
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const dropRef = useRef(null);
  const startY = useRef(0);
  const itemH = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (!dragState) return;
    const clientY = (e) => e.touches ? e.touches[0].clientY : e.clientY;
    const onMove = (e) => {
      const off = clientY(e) - startY.current;
      setDragState((prev) => ({ ...prev, offset: off }));
      const delta = Math.round(off / itemH.current);
      dropRef.current = Math.max(0, Math.min(queue.length - 1, dragRef.current + delta));
    };
    const onUp = () => {
      if (dropRef.current !== null && dropRef.current !== dragRef.current) {
        onMoveQueueItem(dragRef.current, dropRef.current);
      }
      setDragState(null);
      dropRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [!!dragState, queue.length]);

  const getStyle = (i) => {
    if (!dragState) return { transition: "transform 0.2s ease" };
    if (i === dragState.index) return { transform: `translateY(${dragState.offset}px)`, zIndex: 10, opacity: 0.85, transition: "transform 0s", position: "relative" };
    if (dragState.index < i && i <= dropRef.current) return { transform: `translateY(-${itemH.current}px)`, transition: "transform 0.2s ease" };
    if (dropRef.current <= i && i < dragState.index) return { transform: `translateY(${itemH.current}px)`, transition: "transform 0.2s ease" };
    return { transition: "transform 0.2s ease" };
  };

  const isPlayingFromQueue = queueIdx >= 0;

  const startDrag = (e, i) => {
    const el = listRef.current?.children[i];
    if (!el) return;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    startY.current = cy;
    itemH.current = el.getBoundingClientRect().height;
    dragRef.current = i;
    dropRef.current = i;
    setDragState({ index: i, offset: 0 });
  };

  return (
    <div ref={listRef}>
      {currentId && !isPlayingFromQueue && (
        <TrackRow item={currentItem} isCurrent />
      )}
      {queue.length === 0 && !currentItem && <EmptyState message="Queue is empty" />}
      {queue.map((item, i) => {
        const isPlayed = isPlayingFromQueue && i < queueIdx;
        const isCurrent = isPlayingFromQueue && i === queueIdx;
        return (
          <div key={item.id || i}
            style={{ ...getStyle(i), opacity: isPlayed ? 0.35 : 1, willChange: dragState ? "transform" : "auto" }}>
            <TrackRow item={item}
              showRemove
              showDragHandle
              isCurrent={isCurrent}
              showPlay={!isCurrent}
              onPlay={() => onPlayFromQueue(i)}
              onRemove={() => onRemoveFromQueue(i)}
              onDragHandleMouseDown={(e) => { e.preventDefault(); startDrag(e, i); }}
              onDragHandleTouchStart={(e) => { e.preventDefault(); startDrag(e, i); }} />
          </div>
        );
      })}
    </div>
  );
}
