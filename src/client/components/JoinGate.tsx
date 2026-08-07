import { useState } from "react";
import NamePill from "./NamePill";
import { loadPlayerName, savePlayerName } from "../utils/playerName";

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

  const handleNameChange = (next: string) => {
    setName(next);
    savePlayerName(next);
  };

  const handleJoin = async () => {
    setJoining(true);
    await onJoin(name, roomCode);
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
            <NamePill name={name} onChange={handleNameChange} variant="lg" />
            <button
              type="button"
              className="v2-btn v2-btn-pri"
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? "Joining…" : `Join as ${name}`}
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
