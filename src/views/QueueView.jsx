import EmptyState from "../components/EmptyState";
import TrackRow from "../components/TrackRow";

export default function QueueView({ queue, currentId, currentTitle, currentThumb, currentTime, duration, onPlayFromQueue, onRemoveFromQueue }) {
  const currentItem = currentId ? { id: currentId, title: currentTitle, thumbnail: currentThumb, duration: currentTime } : null;

  return (
    <>
      {currentItem && (
        <TrackRow item={currentItem} isCurrent />
      )}
      {queue.length === 0 && !currentItem && <EmptyState message="Queue is empty" />}
      {queue.map((item, i) => (
        <TrackRow key={`${item.id}-${i}`} item={item}
          showRemove showPlay={false}
          onRowClick={() => onPlayFromQueue(i)}
          onRemove={() => onRemoveFromQueue(i)} />
      ))}
    </>
  );
}
