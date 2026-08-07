import { useState } from "react";
import { loadPlayerName, MAX_NAME_LENGTH, savePlayerName } from "../utils/playerName";

interface JoinGateProps {
  /** The invite code from ?room=CODE. */
  roomCode: string;
  onJoin: (name: string, roomId: string) => Promise<void>;
  /** Clear the invite state and fall back to the landing screen. */
  onStartOwn: () => void;
}

/**
 * The ONLY screen an invite-link clicker sees: a bottom sheet with one job —
 * "Join as {name}". No landing hero, no rules, no competing CTAs.
 *
 * Failure detection: useGameRoom.joinRoom never throws (it toasts and
 * resolves), so success is observed structurally — a successful join sets
 * `room` in App, which unmounts this gate before the post-await state updates
 * land (they become no-ops). If we're still mounted after the await, the join
 * failed, and the sheet swaps to "start your own game" in place — no
 * toast-only dead end.
 */
export default function JoinGate({ roomCode, onJoin, onStartOwn }: JoinGateProps) {
  const [name, setName] = useState(loadPlayerName);
  const [joining, setJoining] = useState(false);
  const [failed, setFailed] = useState(false);
  const cleanName = name.trim();

  const handleNameChange = (next: string) => {
    setName(next.slice(0, MAX_NAME_LENGTH));
  };

  const handleJoin = async () => {
    if (!cleanName) return;
    savePlayerName(cleanName);
    setJoining(true);
    await onJoin(cleanName, roomCode);
    // Only reachable in a render that matters when the join failed (see above).
    setJoining(false);
    setFailed(true);
  };

  return (
    <div className="v2-joingate">
      <div className="v2-sheet" role="dialog" aria-label="Join game invitation">
        <div className="v2-sheet-handle" aria-hidden="true" />

        {!failed ? (
          <>
            <h1 className="v2-join-title">You don been invited!</h1>
            <p className="v2-join-sub">
              Room <b>{roomCode.toUpperCase()}</b>
            </p>
            <label className="v2-name-field v2-name-field-lg">
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
              onClick={handleJoin}
              disabled={joining || !cleanName}
            >
              {joining ? "Joining…" : cleanName ? `Join as ${cleanName}` : "Enter name to join"}
            </button>
          </>
        ) : (
          <>
            <h1 className="v2-join-title">We no fit join that room</h1>
            <p className="v2-join-sub">
              The game don start already, the room don full, or e don close.
            </p>
            <button type="button" className="v2-btn v2-btn-pri" onClick={onStartOwn}>
              Start your own game
            </button>
            <button
              type="button"
              className="v2-tlink v2-join-retry"
              onClick={() => setFailed(false)}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
