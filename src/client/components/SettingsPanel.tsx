import { useState, useEffect } from "react";
import * as sound from "../utils/sound";

interface SettingsPanelProps {
  muted: boolean;
  onToggleMute: () => void;
}

const HC_KEY = "odogwu:high-contrast";
const VOL_KEY = "odogwu:volume";

// Compact left-column settings strip: sound + a high-contrast accessibility
// mode. High contrast toggles a class on <html> and persists across sessions;
// the CSS overrides live in index.css under `html.high-contrast`.
export default function SettingsPanel({ muted, onToggleMute }: SettingsPanelProps) {
  const [highContrast, setHighContrast] = useState<boolean>(
    () => typeof localStorage !== "undefined" && localStorage.getItem(HC_KEY) === "1"
  );
  const [volume, setVolumeState] = useState<number>(() => {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(VOL_KEY);
      if (stored !== null) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed)) {
          sound.setVolume(parsed);
          return parsed;
        }
      }
    }
    return sound.getVolume();
  });

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", highContrast);
    try {
      localStorage.setItem(HC_KEY, highContrast ? "1" : "0");
    } catch {
      // localStorage may be unavailable (private mode) — non-fatal.
    }
  }, [highContrast]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolumeState(val);
    sound.setVolume(val);
    try {
      localStorage.setItem(VOL_KEY, val.toString());
    } catch {
      // ignore
    }
  };

  return (
    <div className="console-panel glass-panel settings-panel">
      <div className="settings-panel-header">⚙️ Settings</div>

      <button
        type="button"
        className="settings-row"
        onClick={onToggleMute}
        aria-pressed={!muted}
      >
        <span className="settings-row-label">{muted ? "🔇" : "🔊"} Sound</span>
        <span className={`settings-pill ${muted ? "" : "on"}`}>{muted ? "Off" : "On"}</span>
      </button>

      <div className={`settings-row settings-slider-row ${muted ? "muted-dim" : ""}`}>
        <span className="settings-row-label">🔉 Volume</span>
        <div className="settings-slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            disabled={muted}
            className="volume-slider"
            aria-label="Master Volume"
          />
          <span className="settings-slider-val">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      <button
        type="button"
        className="settings-row"
        onClick={() => setHighContrast((v) => !v)}
        aria-pressed={highContrast}
      >
        <span className="settings-row-label">🌗 High Contrast</span>
        <span className={`settings-pill ${highContrast ? "on" : ""}`}>{highContrast ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
