// =============================================================================
// client/utils/stats.ts — persistent player stats via localStorage
// =============================================================================

const STATS_KEY = "odogwu_empire_stats";

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  totalEarnings: number;  // cumulative net worth across all games
  bestNetWorth: number;   // highest single-game net worth
  lastPlayed: string;     // ISO date string
}

const DEFAULT_STATS: PlayerStats = {
  gamesPlayed: 0,
  wins: 0,
  totalEarnings: 0,
  bestNetWorth: 0,
  lastPlayed: "",
};

export function getStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function recordGameResult(won: boolean, netWorth: number): void {
  const stats = getStats();
  stats.gamesPlayed += 1;
  if (won) stats.wins += 1;
  stats.totalEarnings += netWorth;
  if (netWorth > stats.bestNetWorth) stats.bestNetWorth = netWorth;
  stats.lastPlayed = new Date().toISOString();
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function clearStats(): void {
  try {
    localStorage.removeItem(STATS_KEY);
  } catch {
    // ignore
  }
}
