export default function ChannelAvatar({ name, size = "md", className = "" }) {
  const sz = size === "sm" ? 44 : size === "lg" ? 64 : 56;
  const cls = size === "sm" ? "channel-card-avatar" : "channel-avatar";
  return (
    <div className={`${cls} ${className}`} style={{ width: sz, height: sz, fontSize: sz * 0.4 }}>
      {name ? name.charAt(0).toUpperCase() : "?"}
    </div>
  );
}
