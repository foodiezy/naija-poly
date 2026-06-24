import { useState, useEffect } from "react";

interface SettingsPanelProps {
  muted: boolean;
  onToggleMute: () => void;
}

const HC_KEY = "odogwu:high-contrast";

// Compact left-column settings strip: sound + a high-contrast accessibility
// mode. High contrast toggles a class on <html> and persists across sessions;
// the CSS overrides live in index.css under `html.high-contrast`.
export default function SettingsPanel({ muted, onToggleMute }: SettingsPanelProps) {
  const [highContrast, setHighContrast] = useState<boolean>(
    () => typeof localStorage !== "undefined" && localStorage.getItem(HC_KEY) === "1"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", highContrast);
    try {
      localStorage.setItem(HC_KEY, highContrast ? "1" : "0");
    } catch {
      // localStorage may be unavailable (private mode) — non-fatal.
    }
  }, [highContrast]);

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
