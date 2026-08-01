import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Room } from "colyseus.js";
import { TOKENS, MAX_PLAYERS, tokenEmoji, tokenName } from "../../data/tokens";
import { ChatMessage } from "../../shared/chat";
import { RoomState, RoomSettings } from "../../shared/room";
import { countHumans } from "../lib/players";

// Starting cash is a FIXED set of presets — the host picks one of these, not an
// arbitrary amount. Keeps games balanced and the choice quick. All values sit
// inside the server-side cash clamp (100k–10M).
const CASH_PRESETS: { value: number; label: string }[] = [
  { value: 500_000, label: "₦500K" },
  { value: 1_000_000, label: "₦1M" },
  { value: 1_500_000, label: "₦1.5M" },
  { value: 3_000_000, label: "₦3M" },
  { value: 5_000_000, label: "₦5M" },
];

const DEFAULT_CASH = 1_500_000;
const DEFAULT_TURN_SECS = 120;

function cashLabel(value: number): string {
  const preset = CASH_PRESETS.find((p) => p.value === value);
  if (preset) return preset.label;
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `₦${Math.round(value / 1000)}K`;
}

/** Bottom sheet (<600px) / centered dialog (≥600px) — same primitive the join
 *  gate uses, so the lobby's overlays behave exactly like B2's. */
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="v2-overlay v2-overlay-bottom"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="v2-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="v2-sheet-handle" aria-hidden="true" />
        <header className="v2-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="v2-overlay-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Settings switch. A real <button> with aria-pressed — not a checkbox — so the
 *  whole 44px row is the target and the state is announced as on/off. */
function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="v2-toggle"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span>
        <b>{label}</b>
        {desc && <small>{desc}</small>}
      </span>
      <span className="v2-switch" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}

interface RoomLobbyViewProps {
  room: Room;
  roomState: RoomState | null;
  onCopyRoomCode: () => void;
  onSelectToken: (tokenId: string) => void;
  onAddAI: () => void;
  onUpdateSettings: (settings: RoomSettings) => void;
  onStartGame: () => void;
  chatMessages: ChatMessage[];
  onSendChatMessage: (text: string) => void;
  /** Leave the room — App's existing Exit path. Optional so the view still
   *  renders (minus the back chevron) if a caller doesn't wire it. */
  onLeave?: () => void;
}

/**
 * Room lobby (redesign step B3, spec §2).
 *
 * The lobby has ONE job: get more people into the room. So the share card is
 * the hero, the six host settings collapse to a single summary row, chat
 * collapses to a badge row, and every other affordance (token, bots, menu)
 * is a change-affordance rather than a step. Nothing here should ever have to
 * be opened for a game to start.
 */
export default function RoomLobbyView({
  room,
  roomState,
  onCopyRoomCode,
  onSelectToken,
  onAddAI,
  onUpdateSettings,
  onStartGame,
  chatMessages,
  onSendChatMessage,
  onLeave,
}: RoomLobbyViewProps) {
  const isHost = roomState?.hostId === room.sessionId;
  const players = useMemo(
    () => (roomState?.lobbyPlayers ? Array.from(roomState.lobbyPlayers.entries()) : []),
    [roomState?.lobbyPlayers],
  );
  const playerCount = players.length;
  const roomFull = playerCount >= MAX_PLAYERS;
  const myTokenId = roomState?.lobbyPlayers?.get(room.sessionId)?.tokenId;
  const humanCount = countHumans(players.map(([id]) => id));
  const hasBots = playerCount > humanCount;

  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Waiting timer: while the room can't start yet (fewer than 2 players), count
  // how long we've been waiting so the host knows to nudge friends. Capped at
  // 5:00 so it never counts up forever.
  const [waitSecs, setWaitSecs] = useState(0);
  useEffect(() => {
    if (playerCount >= 2) {
      setWaitSecs(0);
      return;
    }
    const id = setInterval(() => setWaitSecs((s) => Math.min(s + 1, 300)), 1000);
    return () => clearInterval(id);
  }, [playerCount]);
  const waitLabel = `${Math.floor(waitSecs / 60)}:${(waitSecs % 60)
    .toString()
    .padStart(2, "0")}${waitSecs >= 300 ? "+" : ""}`;

  // Social share: prefilled invite for WhatsApp / X / Telegram, plus the native
  // share sheet on devices that support it. Same ?room= link the copy button uses.
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;
  const shareMsg = `🎲 Join my Odogwu Empire game — buy Naija land, collect rent & bankrupt your friends! Room ${room.roomId}:`;
  const shareFull = `${shareMsg} ${inviteUrl}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(shareFull)}`;
  const xLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareMsg,
  )}&url=${encodeURIComponent(inviteUrl)}`;
  const tgLink = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(
    shareMsg,
  )}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: "Odogwu Empire", text: shareMsg, url: inviteUrl });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  // Lobby chat: general (non-DM) messages only, with an unread count that
  // clears while the panel is open.
  const generalMessages = useMemo(() => chatMessages.filter((m) => !m.toId), [chatMessages]);
  const [seenCount, setSeenCount] = useState(generalMessages.length);
  useEffect(() => {
    if (chatOpen) setSeenCount(generalMessages.length);
  }, [chatOpen, generalMessages.length]);
  const unread = Math.max(0, generalMessages.length - seenCount);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [generalMessages.length, chatOpen]);

  const [draft, setDraft] = useState("");
  const sendChat = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendChatMessage(text);
    setDraft("");
  };

  const startingCash = roomState?.startingCash || DEFAULT_CASH;
  const turnTimerEnabled = roomState?.turnTimerEnabled ?? false;
  const turnTimeoutSecs = roomState?.turnTimeoutSecs || DEFAULT_TURN_SECS;
  const optionsSummary = [
    cashLabel(startingCash),
    roomState?.chaosMode ? "Chaos" : "Classic",
    turnTimerEnabled ? `${turnTimeoutSecs}s timer` : "No timer",
  ].join(" · ");

  const emptySlots = Math.max(0, MAX_PLAYERS - playerCount);

  return (
    <div className="v2-lobby">
      <header className="v2-lobby-bar">
        {onLeave && (
          <button type="button" className="v2-iconbtn" aria-label="Leave room" onClick={onLeave}>
            ‹
          </button>
        )}
        <h1>Room lobby</h1>
        <button
          type="button"
          className="v2-iconbtn v2-iconbtn-end"
          aria-label="More options"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          ⋮
        </button>
      </header>

      <div className="v2-lobby-body">
        {/* ── Share card: the hero. Everything else is secondary to this. ── */}
        <section className="v2-card v2-share">
          <button
            type="button"
            className="v2-code"
            onClick={onCopyRoomCode}
            aria-label={`Room code ${room.roomId} — tap to copy the invite link`}
          >
            <span className="v2-code-num">{room.roomId}</span>
            <span className="v2-code-l">tap to copy</span>
          </button>

          <a className="v2-btn v2-btn-pri" href={waLink} target="_blank" rel="noopener noreferrer">
            Invite on WhatsApp
          </a>

          <div className="v2-two-up">
            <button type="button" className="v2-btn v2-btn-sec" onClick={onCopyRoomCode}>
              Copy link
            </button>
            {canNativeShare && (
              <button type="button" className="v2-btn v2-btn-sec" onClick={handleNativeShare}>
                Share…
              </button>
            )}
          </div>

          {isHost && (
            <p className="v2-share-note">Once the game starts the room locks — invite first.</p>
          )}
        </section>

        {/* ── Players: empty slots keep the room from looking broken. ── */}
        <section className="v2-card v2-players">
          <div className="v2-card-label">
            Players · {playerCount}/{MAX_PLAYERS}
          </div>

          {players.map(([pId, pData]) => (
            <div className="v2-prow" key={pId}>
              <span className="v2-av" aria-hidden="true">
                {tokenEmoji(pData.tokenId)}
              </span>
              <b>{pData.name}</b>
              {pId === room.sessionId && <span className="v2-you">(you)</span>}
              {pId === roomState?.hostId && <span className="v2-host">HOST</span>}
            </div>
          ))}

          {Array.from({ length: emptySlots }).map((_, i) => (
            <div className="v2-slot" key={`slot-${i}`}>
              <i aria-hidden="true" />
              Waiting for player…
            </div>
          ))}

          {playerCount < 2 && (
            <div className="v2-wait">
              <b>⏱ Waiting for players… {waitLabel}</b>
              {waitSecs >= 60 && (
                <span>
                  Nobody don join yet — share the invite{isHost ? " or add a bot 🤖" : ""}.
                </span>
              )}
            </div>
          )}
        </section>

        {/* ── Your token: a change-affordance, never a required step (the
             server auto-assigns one on join). ── */}
        <section className="v2-card v2-token-row">
          <span className="v2-av" aria-hidden="true">
            {tokenEmoji(myTokenId)}
          </span>
          <span className="v2-token-me">
            <b>Your token</b>
            <span>{tokenName(myTokenId)}</span>
          </span>
          <button
            type="button"
            className="v2-tlink v2-token-change"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen(true)}
          >
            Change
          </button>
        </section>

        {/* ── Game options (host): one row. The defaults are good enough that
             it never has to be opened. ── */}
        {isHost && (
          <section className="v2-card v2-options">
            <button
              type="button"
              className="v2-disclosure"
              aria-expanded={optionsOpen}
              aria-controls="lobby-game-options"
              onClick={() => setOptionsOpen((v) => !v)}
            >
              Game options
              <span>
                {optionsSummary}
                <i className="v2-chev" aria-hidden="true">
                  ›
                </i>
              </span>
            </button>

            {optionsOpen && (
              <div className="v2-opts" id="lobby-game-options">
                <div>
                  <div className="v2-opt-label">
                    Starting cash
                    <em>₦{startingCash.toLocaleString()}</em>
                  </div>
                  <div className="v2-preset-grid">
                    {CASH_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        className="v2-preset"
                        aria-pressed={startingCash === p.value}
                        onClick={() => onUpdateSettings({ startingCash: p.value })}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="v2-field">
                  <span>Turn limit (0 = ∞)</span>
                  <input
                    type="number"
                    className="v2-num"
                    value={roomState?.turnLimit || 0}
                    min={0}
                    max={500}
                    onChange={(e) => onUpdateSettings({ turnLimit: Number(e.target.value) })}
                  />
                </label>

                <Toggle
                  label="Mama Put Pot"
                  desc="Fines and taxes pile up at the Rest Stop — land there, chop the lot."
                  checked={roomState?.freeParkingJackpot || false}
                  onChange={(v) => onUpdateSettings({ freeParkingJackpot: v })}
                />

                <Toggle
                  label="⚡ Chaos Mode"
                  desc={
                    'Adds Naija chaos cards — e.g. "NEPA don take light" freezes all rent for a round.'
                  }
                  checked={roomState?.chaosMode || false}
                  onChange={(v) => onUpdateSettings({ chaosMode: v })}
                />

                <Toggle
                  label="Secret objectives"
                  checked={roomState?.secretObjectives || false}
                  onChange={(v) => onUpdateSettings({ secretObjectives: v })}
                />

                <Toggle
                  label="Turn timer"
                  checked={turnTimerEnabled}
                  onChange={(v) => onUpdateSettings({ turnTimerEnabled: v })}
                />

                {turnTimerEnabled && (
                  <label className="v2-field v2-field-sub">
                    <span>Seconds per turn</span>
                    <input
                      type="number"
                      className="v2-num"
                      value={turnTimeoutSecs}
                      min={15}
                      max={600}
                      step={15}
                      onChange={(e) =>
                        onUpdateSettings({ turnTimeoutSecs: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Chat: one row on mobile, a live panel on desktop. Never half
             the lobby. ── */}
        <button
          type="button"
          className="v2-card v2-chat-row"
          aria-haspopup="dialog"
          aria-expanded={chatOpen}
          onClick={() => setChatOpen(true)}
        >
          💬 Lobby chat
          {unread > 0 && <span className="v2-badge">{unread}</span>}
        </button>

        <div
          className="v2-overlay v2-overlay-bottom v2-chat-wrap"
          data-open={chatOpen}
          onClick={() => setChatOpen(false)}
        >
          <section className="v2-chat-panel" onClick={(e) => e.stopPropagation()}>
            <div className="v2-sheet-handle" aria-hidden="true" />
            <header className="v2-sheet-head">
              <h2>Lobby chat</h2>
              <button
                type="button"
                className="v2-overlay-x v2-chat-close"
                aria-label="Close chat"
                onClick={() => setChatOpen(false)}
              >
                ✕
              </button>
            </header>

            <div className="v2-chat-log" ref={logRef}>
              {generalMessages.length === 0 ? (
                <p className="v2-chat-empty">Nobody don talk yet. Say hello!</p>
              ) : (
                generalMessages.map((msg, idx) => (
                  <p
                    className={msg.senderId === room.sessionId ? "v2-msg is-me" : "v2-msg"}
                    key={`${msg.timestamp}-${idx}`}
                  >
                    <b>{msg.senderName}:</b> {msg.text}
                  </p>
                ))
              )}
            </div>

            <form className="v2-chat-form" onSubmit={sendChat}>
              <input
                className="v2-input"
                placeholder="Type a message…"
                value={draft}
                maxLength={240}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Chat message"
              />
              <button
                type="submit"
                className="v2-btn v2-btn-pri v2-chat-send"
                disabled={!draft.trim()}
              >
                Send
              </button>
            </form>
          </section>
        </div>

        {isHost && (
          <button
            type="button"
            className="v2-btn v2-btn-sec v2-bots"
            onClick={onAddAI}
            disabled={roomFull}
          >
            {roomFull ? "Room don full" : hasBots ? "➕ Add another bot" : "🤖 Play with bots"}
          </button>
        )}
      </div>

      {/* ── Sticky bottom bar: the one action that matters. ── */}
      <div className="v2-lobby-foot">
        <div className="v2-foot-in">
          {isHost ? (
            <>
              <button
                type="button"
                className="v2-btn v2-btn-pri"
                onClick={onStartGame}
                disabled={playerCount < 2}
              >
                {playerCount < 2 ? "Waiting for more players…" : "Start game"}
              </button>
              {humanCount === 1 && playerCount >= 2 && (
                <span className="v2-foot-note">
                  Playing solo with bots — friends can't join once you start.
                </span>
              )}
            </>
          ) : (
            <div className="v2-wait-pill">⏳ Waiting for host…</div>
          )}
        </div>
      </div>

      {menuOpen && (
        <Sheet title="Room options" onClose={() => setMenuOpen(false)}>
          <div className="v2-menu">
            <a
              className="v2-menu-item"
              href={xLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              ✖️ Share on X
            </a>
            <a
              className="v2-menu-item"
              href={tgLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              ✈️ Share on Telegram
            </a>
            <button
              type="button"
              className="v2-menu-item"
              onClick={() => {
                onCopyRoomCode();
                setMenuOpen(false);
              }}
            >
              🔗 Copy invite link
            </button>
            {onLeave && (
              <button type="button" className="v2-menu-item is-danger" onClick={onLeave}>
                🚪 Leave room
              </button>
            )}
          </div>
        </Sheet>
      )}

      {pickerOpen && (
        <Sheet title="Your token" onClose={() => setPickerOpen(false)}>
          <div className="v2-token-grid">
            {TOKENS.map((token) => {
              // Taken = held by SOMEONE ELSE; your own token stays selectable.
              const takenBy = players.find(
                ([pId, pData]) => pData.tokenId === token.id && pId !== room.sessionId,
              )?.[1].name;
              const isMine = myTokenId === token.id;
              return (
                <button
                  key={token.id}
                  type="button"
                  className="v2-token-opt"
                  aria-pressed={isMine}
                  disabled={!!takenBy}
                  title={takenBy ? `Taken by ${takenBy}` : token.name}
                  onClick={() => {
                    onSelectToken(token.id);
                    setPickerOpen(false);
                  }}
                >
                  <em aria-hidden="true">{token.emoji}</em>
                  <b>{token.name}</b>
                  {takenBy && <small>Taken</small>}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}
