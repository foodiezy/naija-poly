import { useEffect, useState, type ReactNode } from "react";
import type { Action, GameState } from "../../engine/types";
import type { RoomState } from "../../shared/room";
import { DESKTOP_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import Sheet from "./Sheet";
import { ScatterDecor } from "./decor";
import ShellTopBar from "./ShellTopBar";
import TurnStrip from "./TurnStrip";
import ContextTicker from "./ContextTicker";
import ActionBar from "./ActionBar";

/**
 * The in-game shell (redesign step B5 · spec §2).
 *
 * Mobile is five fixed bands with NO page scroll — top bar, turn strip, board,
 * ticker, action bar — replacing a layout that stacked three columns into one
 * long scrolling page where the turn timer ran while your buttons sat off
 * screen. Desktop keeps three columns, but the global app header/footer are
 * gone: the shell's own top bar carries the room, your cash and the status
 * chips that used to be banners inside the board.
 *
 * The rails are SLOTS, not children this component builds. That keeps App as
 * the single composition root and lets the same `chat` element live in the
 * desktop dock or the mobile sheet while being mounted exactly once — two
 * copies would double ChatPanel's unread bookkeeping and its scroll effects.
 */

interface Props {
  engineState: GameState;
  roomState: RoomState | null;
  mySessionId: string;
  roomId: string;
  muted: boolean;
  myTokenWalking: boolean;
  /** Total chat messages, for the unread dot while the chat sheet is closed. */
  chatMessageCount: number;
  onToggleMute: () => void;
  onCopyRoomCode: () => void;
  onLeave: () => void;
  onHowToPlay: () => void;
  onSendAction: (action: Action) => void;
  onShowResults: () => void;
  /** The board. */
  board: ReactNode;
  /** ControlPanel — right rail on desktop, the `⋯` sheet on mobile. */
  sidebar: ReactNode;
  /** ChatPanel — left dock on desktop, the `💬` sheet on mobile. */
  chat: ReactNode;
  /** GameFeed — desktop left rail only; mobile reads it in the ticker and the
   * history sheet, so it is never mounted on a phone. */
  feed: ReactNode;
  /** Decision sheets, inspectors and other portalled overlays. */
  overlays?: ReactNode;
}

export default function GameShell({
  engineState,
  roomState,
  mySessionId,
  roomId,
  muted,
  myTokenWalking,
  chatMessageCount,
  onToggleMute,
  onCopyRoomCode,
  onLeave,
  onHowToPlay,
  onSendAction,
  onShowResults,
  board,
  sidebar,
  chat,
  feed,
  overlays,
}: Props) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  // Unread is only meaningful while the chat is out of sight. On desktop it is
  // permanently docked, so the count stays pinned to "all seen" and ChatPanel's
  // own per-channel dots do the work.
  const [seenChat, setSeenChat] = useState(chatMessageCount);
  useEffect(() => {
    if (isDesktop || chatOpen) setSeenChat(chatMessageCount);
  }, [isDesktop, chatOpen, chatMessageCount]);
  const unreadChat = isDesktop || chatOpen ? 0 : Math.max(0, chatMessageCount - seenChat);

  // A sheet that is open when the layout flips would leave its content mounted
  // twice (sheet + rail). Close the rail-backed ones on the way to desktop.
  useEffect(() => {
    if (isDesktop) {
      setActionsOpen(false);
      setChatOpen(false);
    }
  }, [isDesktop]);

  const log = engineState.log ?? [];

  return (
    <div className="v2-shell view-fade">
      <ShellTopBar
        roomId={roomId}
        engineState={engineState}
        mySessionId={mySessionId}
        muted={muted}
        onToggleMute={onToggleMute}
        onCopyRoomCode={onCopyRoomCode}
        onOpenMenu={() => setMenuOpen(true)}
        onLeave={onLeave}
        onHowToPlay={onHowToPlay}
      />

      <TurnStrip engineState={engineState} roomState={roomState} mySessionId={mySessionId} />

      {isDesktop && (
        <aside className="v2-shell-rail v2-shell-rail-left">
          {chat}
          {feed}
        </aside>
      )}

      <main className="v2-shell-board">
        {/* The band is taller than the board on most phones. Sand with nothing
            on it reads as a loading state, so it gets the adire crosshatch plus
            the game's own objects drifting behind the board — all inline SVG
            and CSS gradients, no bytes. */}
        <div className="v2-adire" aria-hidden="true" />
        <ScatterDecor />
        {board}
      </main>

      {isDesktop && <aside className="v2-shell-rail v2-shell-rail-right">{sidebar}</aside>}

      <ContextTicker
        engineState={engineState}
        mySessionId={mySessionId}
        onOpenLog={() => setLogOpen(true)}
      />

      <ActionBar
        engineState={engineState}
        mySessionId={mySessionId}
        myTokenWalking={myTokenWalking}
        unreadChat={unreadChat}
        onSendAction={onSendAction}
        onOpenActions={() => setActionsOpen(true)}
        onOpenChat={() => setChatOpen(true)}
        onShowResults={onShowResults}
      />

      {overlays}

      <Sheet
        level="info"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Game menu"
        maxWidth={420}
      >
        <div className="v2-menu-list">
          <button
            className="v2-menu-item"
            onClick={() => {
              onCopyRoomCode();
              setMenuOpen(false);
            }}
          >
            🔗 <span>Copy invite link</span>
            <em>{roomId}</em>
          </button>
          <button
            className="v2-menu-item"
            onClick={() => {
              onHowToPlay();
              setMenuOpen(false);
            }}
          >
            📖 <span>How to play</span>
          </button>
          <button
            className="v2-menu-item"
            onClick={() => {
              onToggleMute();
              setMenuOpen(false);
            }}
          >
            {muted ? "🔇" : "🔊"} <span>{muted ? "Unmute sounds" : "Mute sounds"}</span>
          </button>
          <button className="v2-menu-item v2-menu-item-bad" onClick={onLeave}>
            🚪 <span>Leave game</span>
          </button>
        </div>
      </Sheet>

      <Sheet
        level="info"
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title="Actions"
        maxWidth={560}
      >
        <div className="v2-shell-sheet-panel">{sidebar}</div>
      </Sheet>

      {!isDesktop && (
        <Sheet
          level="info"
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          title="Chat"
          maxWidth={560}
        >
          <div className="v2-shell-sheet-panel">{chat}</div>
        </Sheet>
      )}

      <Sheet
        level="info"
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="What don happen"
        maxWidth={560}
      >
        <ol className="v2-history">
          {log.length === 0 && <li className="v2-history-empty">Nothing don happen yet.</li>}
          {/* Newest first: engine pushes, so the tail is the freshest line. */}
          {log
            .slice()
            .reverse()
            .map((line, i) => (
              <li key={log.length - i}>{line}</li>
            ))}
        </ol>
      </Sheet>
    </div>
  );
}
