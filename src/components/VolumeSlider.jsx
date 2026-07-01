export default function VolumeSlider({ value, onChange, disabled, showPercent, className = "" }) {
  const style = {
    background: `linear-gradient(to right, #00f5ff 0%, #00f5ff ${value * 100}%, rgba(255,255,255,0.08) ${value * 100}%, rgba(255,255,255,0.08) 100%)`
  };
  return (
    <>
      <input type="range" className={`volume-bar ${className}`} disabled={disabled}
        min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} style={style} />
      {showPercent && <span className="settings-vol-num">{Math.round(value * 100)}%</span>}
    </>
  );
}
