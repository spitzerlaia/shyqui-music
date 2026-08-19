import { THEMES } from "../themes";

function ColorRow({ label, value, onChange }) {
  return (
    <div className="theme-row">
      <input type="color" className="theme-picker" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="theme-hex">{value.toUpperCase()}</span>
      <span className="theme-hex-label">{label}</span>
    </div>
  );
}

export default function SettingsPanel({ theme, onThemeChange, onClose }) {
  const update = (patch) => onThemeChange({ ...theme, preset: "custom", ...patch });

  return (
    <div className="theme-panel">
      <div className="theme-title">
        <span>🎨 Colores</span>
        <button className="theme-close" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="theme-label">Paletas</div>
      <div className="theme-grid">
        {Object.entries(THEMES).map(([key, t]) => (
          <button
            key={key}
            className={`theme-swatch${theme.preset === key ? " active" : ""}`}
            style={{ background: t.accent }}
            title={t.name}
            onClick={() => onThemeChange({ ...t, preset: key })}
          />
        ))}
      </div>

      <div className="theme-label">Colores</div>
      <ColorRow label="Acento" value={theme.accent} onChange={(v) => update({ accent: v })} />
      <ColorRow label="Fondo" value={theme.bg} onChange={(v) => update({ bg: v })} />
      <ColorRow label="Texto" value={theme.text} onChange={(v) => update({ text: v })} />
      <ColorRow label="Texto suave" value={theme.textSoft} onChange={(v) => update({ textSoft: v })} />
      <ColorRow label="Sobre acento" value={theme.onAccent} onChange={(v) => update({ onAccent: v })} />
      <ColorRow label="Paneles (cristal)" value={theme.glass} onChange={(v) => update({ glass: v })} />
      <ColorRow label="Error / eliminar" value={theme.danger} onChange={(v) => update({ danger: v })} />
      <ColorRow label="Aviso" value={theme.warn} onChange={(v) => update({ warn: v })} />
      <ColorRow label="Estrellas" value={theme.star} onChange={(v) => update({ star: v })} />

      <button
        className="theme-reset"
        onClick={() => onThemeChange({ ...THEMES.rosa, preset: "rosa" })}
      >
        Restablecer
      </button>
    </div>
  );
}