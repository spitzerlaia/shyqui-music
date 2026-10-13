
import { THEMES } from "../themes";

function ColorRow({ label, value, onChange }) {
  return (
    <div className="theme-row">
      <input
        type="color"
        className="theme-picker"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="theme-hex">{value.toUpperCase()}</span>
      <span className="theme-hex-label">{label}</span>
    </div>
  );
}

export default function SettingsPanel({
  theme,
  onThemeChange,
  onClose,
  backgroundImage = "",
  onBackgroundUpload,
  onBackgroundRemove,
  backgroundOpacity = 0.25,
  onBackgroundOpacityChange,
  backgroundBlur = 0,
  onBackgroundBlurChange,
  backgroundDarkness = 0.35,
  onBackgroundDarknessChange,
}) {
  const update = (patch) =>
    onThemeChange({ ...theme, preset: "custom", ...patch });

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onBackgroundUpload?.(file);

    // Permite volver a seleccionar el mismo archivo.
    e.target.value = "";
  };

  return (
    <div className="theme-panel">
      <div className="theme-title">
        <span>🎨 Appearance</span>
        <button
          className="theme-close"
          onClick={onClose}
          title="Cerrar"
        >
          ✕
        </button>
      </div>

      {/* PREDEFINED THEMES */}
      <div className="theme-label">Predefined</div>

      <div className="theme-grid">
        {Object.entries(THEMES).map(([key, t]) => (
          <button
            key={key}
            className={`theme-swatch${
              theme.preset === key ? " active" : ""
            }`}
            style={{ background: t.accent }}
            title={t.name}
            onClick={() => onThemeChange({ ...t, preset: key })}
          />
        ))}
      </div>

      {/* BACKGROUND IMAGE */}
      <div className="theme-label">Background image</div>

      <div className="background-settings">
        {backgroundImage && (
          <div className="background-preview">
            <img
              src={backgroundImage}
              alt="BG preview"
            />
          </div>
        )}

        <label className="background-upload">
          <span>
            {backgroundImage ? "Change image" : "Choose image"}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
          />
        </label>

        {backgroundImage && (
          <button
            type="button"
            className="theme-reset"
            onClick={onBackgroundRemove}
          >
            Remove image
          </button>
        )}


        <div className="background-control">
          <label>
            <span>Opacity</span>
            <span>{Math.round(backgroundOpacity * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={backgroundOpacity}
            onChange={(e) =>
              onBackgroundOpacityChange?.(Number(e.target.value))
            }
          />
        </div>

        <div className="background-control">
          <label>
            <span>Blur</span>
            <span>{backgroundBlur}px</span>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={backgroundBlur}
            onChange={(e) =>
              onBackgroundBlurChange?.(Number(e.target.value))
            }
          />
        </div>

        <div className="background-control">
          <label>
            <span>Darkness</span>
            <span>{Math.round(backgroundDarkness * 100)}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="0.9"
            step="0.05"
            value={backgroundDarkness}
            onChange={(e) =>
              onBackgroundDarknessChange?.(Number(e.target.value))
            }
          />
        </div>
      </div>

      {/* COLORS */}
      <div className="theme-label">Colors</div>

      <ColorRow
        label="Accent"
        value={theme.accent}
        onChange={(v) => update({ accent: v })}
      />
      <ColorRow
        label="Background"
        value={theme.bg}
        onChange={(v) => update({ bg: v })}
      />
      <ColorRow
        label="Text"
        value={theme.text}
        onChange={(v) => update({ text: v })}
      />
      <ColorRow
        label="Soft text"
        value={theme.textSoft}
        onChange={(v) => update({ textSoft: v })}
      />
      <ColorRow
        label="Text on accent"
        value={theme.onAccent}
        onChange={(v) => update({ onAccent: v })}
      />
      <ColorRow
        label="Panels (glass)"
        value={theme.glass}
        onChange={(v) => update({ glass: v })}
      />
      <ColorRow
        label="Error / delete"
        value={theme.danger}
        onChange={(v) => update({ danger: v })}
      />
      <ColorRow
        label="Warning"
        value={theme.warn}
        onChange={(v) => update({ warn: v })}
      />
      <ColorRow
        label="Stars"
        value={theme.star}
        onChange={(v) => update({ star: v })}
      />

      <button
        className="theme-reset"
        onClick={() =>
          onThemeChange({ ...THEMES.rosa, preset: "rosa" })
        }
      >
        Reset colors
      </button>
    </div>
  );
}
