import { motion } from "framer-motion";
import { GameState, Player, Action } from "../../engine/types";
import { tokenEmoji } from "../../data/tokens";
import { RoomState } from "../../shared/room";
import { BOARD, ColorGroup } from "../../data/board";
import { netWorth, ownedTiles } from "../lib/holdings";

interface Props {
  engineState: GameState;
  mySessionId: string;
  liveState: RoomState | undefined;
  onSendAction?: (action: Action) => void;
}

const COLOR_GROUPS: ColorGroup[] = [
  "brown",
  "lightblue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "darkblue",
];

function monopolyCount(tiles: GameState["tiles"], playerId: string): number {
  return COLOR_GROUPS.filter((g) => {
    const tilesInGroup = BOARD.filter((t) => t.type === "property" && t.group === g);
    if (tilesInGroup.length === 0) return false;
    return tilesInGroup.every((t) => tiles[t.pos]?.ownerId === playerId);
  }).length;
}

function statusLabel(p: Player, isActive: boolean): { text: string; tone: string } {
  if (p.kicked) return { text: "Voted Out", tone: "bankrupt" };
  if (p.bankrupt) return { text: "Bankrupt", tone: "bankrupt" };
  if (p.inJail) return { text: "In Jail", tone: "jail" };
  if (isActive) return { text: "Playing", tone: "active" };
  return { text: "Waiting", tone: "waiting" };
}

export default function PlayerList({ engineState, mySessionId, liveState, onSendAction }: Props) {
  const { players, currentPlayerIndex, currentTurn, settings, tiles, votekicks } = engineState;
  const currentPlayer = players[currentPlayerIndex];
  const me = players.find(p => p.id === mySessionId);

  const getToken = (id: string) => {
    const lp = liveState?.lobbyPlayers?.get(id);
    return tokenEmoji(lp?.tokenId);
  };
  // Heuristic: server names AI players "Bot N" by convention.
  const isAI = (name: string) => /^Bot\s\d+/i.test(name);

  // Compute per-player metrics
  const playerStats = players.map((p) => ({
    id: p.id,
    cash: p.cash,
    properties: ownedTiles(tiles, p.id).length,
    monopolies: monopolyCount(tiles, p.id),
    netWorth: netWorth(p.cash, tiles, p.id),
  }));
  const maxNetWorth = Math.max(1, ...playerStats.map((s) => s.netWorth));
  const statsById = new Map(playerStats.map((s) => [s.id, s]));

  return (
    <div className="players-panel">
      <div className="players-panel-header">
        <span className="players-panel-title">Players</span>
        <div className="players-panel-round">
          <span className="round-label">Round</span>
          <span className="round-number">{currentTurn ?? 1}</span>
          {settings?.turnLimit > 0 && (
            <span className="round-limit">/ {settings.turnLimit}</span>
          )}
        </div>
      </div>

      <div className="players-panel-list">
        {players.map((p: Player) => {
          const isActive = p.id === currentPlayer?.id;
          const isMe = p.id === mySessionId;
          const status = statusLabel(p, isActive);
          const stats = statsById.get(p.id)!;
          const wealthPct = Math.max(2, Math.round((stats.netWorth / maxNetWorth) * 100));
          return (
            <motion.div
              key={p.id}
              layout
              className={`player-card${isActive ? " is-active" : ""}${isMe ? " is-me" : ""}${p.bankrupt ? " is-bankrupt" : ""}`}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
            >
              <div className="player-card-row">
                <div className={`player-card-avatar tone-${status.tone}`}>
                  <span className="player-card-avatar-emoji">{getToken(p.id)}</span>
                  {p.inJail && <span className="player-card-jail-badge" title="In Kirikiri Prison">🔒</span>}
                </div>

                <div className="player-card-middle">
                  <div className="player-card-name-row">
                    <span className="player-card-name">{p.name}</span>
                    {isMe && <span className="player-card-you-tag">YOU</span>}
                    {!isMe && isAI(p.name) && <span className="player-card-ai-tag">BOT</span>}
                    {!isMe && !p.bankrupt && !isAI(p.name) && !me?.bankrupt && onSendAction && (
                      <button 
                        className="votekick-btn"
                        style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '0.1rem 0.3rem', background: 'transparent', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', borderRadius: '2px', cursor: 'pointer' }}
                        onClick={() => {
                          if (window.confirm(`Vote to commot ${p.name}?`)) {
                            onSendAction({ type: "VOTE_KICK", targetId: p.id });
                          }
                        }}
                        title={`Votes: ${votekicks?.[p.id]?.length || 0}`}
                        disabled={votekicks?.[p.id]?.includes(mySessionId)}
                      >
                        {votekicks?.[p.id]?.includes(mySessionId) ? "Voted" : "Commot"} ({votekicks?.[p.id]?.length || 0})
                      </button>
                    )}
                  </div>
                  <div className="player-card-status-row">
                    <span className={`player-card-status status-${status.tone}`}>{status.text}</span>
                    <span className="player-card-chip" title="Properties owned">
                      🏘️ {stats.properties}
                    </span>
                    {stats.monopolies > 0 && (
                      <span className="player-card-chip is-monopoly" title="Color sets owned">
                        ⭐ {stats.monopolies}
                      </span>
                    )}
                  </div>
                </div>

                <div className="player-card-cash-block">
                  <div className="player-card-cash">₦{p.cash.toLocaleString()}</div>
                  <div className="player-card-networth" title="Net worth = cash + assets">
                    Net ₦{stats.netWorth.toLocaleString()}
                  </div>
                </div>
              </div>

              {!p.bankrupt && (
                <div className="player-card-wealthbar">
                  <div
                    className={`player-card-wealthbar-fill${isActive ? " active" : ""}${isMe ? " me" : ""}`}
                    style={{ width: `${wealthPct}%` }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
