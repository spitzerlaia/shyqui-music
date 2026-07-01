import ChannelAvatar from "./ChannelAvatar";

export default function ChannelCard({ channel, onSelect }) {
  return (
    <div className="channel-card" onClick={() => onSelect(channel)}>
      <ChannelAvatar name={channel.name} size="sm" />
      <div className="channel-card-name">{channel.name}</div>
    </div>
  );
}
