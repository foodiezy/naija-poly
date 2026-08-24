import React, { useState } from "react";
import { ScatterDecor } from "./decor";
import { getStats } from "../utils/stats";
import { loadPlayerName, MAX_NAME_LENGTH, savePlayerName } from "../utils/playerName";
import { GAME_GUIDE, markGameGuideSeen } from "../lib/gameGuide";

interface LandingViewProps {
  onCreateRoom: (name: string) => Promise<void>;
  onJoinRoom: (name: string, roomId: string) => Promise<void>;
  onQuickMatch?: (name: string) => Promise<void>;
}

// 3-step strip icons — inline SVG from the approved mockup, recolored via
// currentColor so the CSS owns the tone (--pri).
const STEPS = [
  {
    label: "Roll",
    sub: "two dice, waka",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect
          x="3"
          y="3"
          width="16"
          height="16"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        <circle cx="14" cy="14" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Buy land",
    sub: "own the city",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path
          d="M4 11 11 4l7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6 10v8h10v-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "Collect rent",
    sub: "become Odogwu",
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path
          d="M6 4h10M6 8h10M7 4c0 6 8 8 8 14M15 4c0 6-8 8-8 14M6 18h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function LandingView({ onCreateRoom, onJoinRoom, onQuickMatch }: LandingViewProps) {
  const [name, setName] = useState(loadPlayerName);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState<"create" | "join" | "quick" | null>(null);
  const stats = getStats();
  const cleanName = name.trim();

  const handleNameChange = (next: string) => {
    setName(next.slice(0, MAX_NAME_LENGTH));
  };

  const handleCreate = async () => {
    if (!cleanName) return;
    savePlayerName(cleanName);
    setBusy("create");
    try {
      await onCreateRoom(cleanName);
    } finally {
      setBusy(null);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanName || !code.trim()) return;
    savePlayerName(cleanName);
    setBusy("join");
    try {
      await onJoinRoom(cleanName, code.trim());
    } finally {
      setBusy(null);
    }
  };

  const handleQuickMatch = async () => {
    if (!onQuickMatch || !cleanName) return;
    savePlayerName(cleanName);
    setBusy("quick");
    try {
      await onQuickMatch(cleanName);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="v2-landing">
      <div className="v2-adire" aria-hidden="true" />
      <ScatterDecor />

      <main className="v2-landing-col">
        <h1 className="v2-wordmark">
          ODOGWU
          <br />
          <em>EMPIRE</em>
        </h1>
        <p className="v2-tagline">Buy Naija land. Bankrupt your friends.</p>

        <label className="v2-name-field">
          <span>Enter your name</span>
          <input
            className="v2-input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Fuad"
            onChange={(e) => handleNameChange(e.target.value)}
            autoComplete="nickname"
          />
          <small>This is the name other players will see.</small>
        </label>

        <button
          type="button"
          className="v2-btn v2-btn-pri"
          onClick={handleCreate}
          disabled={busy !== null || !cleanName}
        >
          {busy === "create" ? "Connecting…" : "Start a game"}
        </button>

        <div className="v2-landing-links">
          <button
            type="button"
            className="v2-tlink"
            aria-expanded={codeOpen}
            onClick={() => setCodeOpen((v) => !v)}
          >
            I have a code
          </button>
          <span className="v2-link-dot" aria-hidden="true">
            ·
          </span>
          <button type="button" className="v2-tlink" onClick={() => setShowRules(true)}>
            How to play
          </button>
        </div>

        {codeOpen && (
          <form className="v2-code-box" onSubmit={handleJoin}>
            <input
              className="v2-input"
              placeholder="Room code (e.g. B8SD3)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={12}
              disabled={busy !== null}
              aria-label="Room code"
            />
            <button
              type="submit"
              className="v2-btn v2-btn-pri"
              disabled={busy !== null || !cleanName || !code.trim()}
            >
              {busy === "join" ? "Joining…" : "Join room"}
            </button>
            {onQuickMatch && (
              <button
                type="button"
                className="v2-btn v2-btn-sec"
                onClick={handleQuickMatch}
                disabled={busy !== null || !cleanName}
              >
                {busy === "quick" ? "Searching…" : "Quick match"}
              </button>
            )}
          </form>
        )}

        {stats.gamesPlayed > 0 && (
          <div className="v2-stats-chip">
            {stats.gamesPlayed} {stats.gamesPlayed === 1 ? "game" : "games"} · {stats.wins}{" "}
            {stats.wins === 1 ? "win" : "wins"}
          </div>
        )}
      </main>

      <div className="v2-steps">
        {STEPS.map((step) => (
          <div className="v2-step" key={step.label}>
            {step.icon}
            <b>{step.label}</b>
            <span>{step.sub}</span>
          </div>
        ))}
      </div>

      <footer className="v2-landing-foot">2–6 players · No download required · Free</footer>

      {showRules && (
        <div
          className="v2-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="How to play"
          onClick={() => setShowRules(false)}
        >
          <div className="v2-overlay-card" onClick={(e) => e.stopPropagation()}>
            <header className="v2-overlay-head">
              <h2>How to play</h2>
              <button
                type="button"
                className="v2-overlay-x"
                aria-label="Close"
                onClick={() => setShowRules(false)}
              >
                ✕
              </button>
            </header>
            <div className="v2-overlay-body">
              {GAME_GUIDE.map((step) => (
                <div className="v2-rule" key={step.title}>
                  <span className="v2-rule-emoji" aria-hidden="true">
                    {step.emoji}
                  </span>
                  <div>
                    <b>{step.title}</b>
                    <p>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <footer className="v2-overlay-foot">
              <button
                type="button"
                className="v2-btn v2-btn-pri"
                onClick={() => {
                  markGameGuideSeen();
                  setShowRules(false);
                }}
              >
                Make we go!
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
