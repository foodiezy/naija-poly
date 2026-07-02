import { useState } from "react";
import { BOARD } from "../../data/board";
import { tileImageUrl, tileFallbackEmoji, tileFallbackGradient } from "../tileImages";

interface Props {
  pos: number;
  /** Extra class for sizing/shape at the call site. */
  className?: string;
}

/**
 * Real photo of the tile's real-world place, with a graceful themed fallback.
 * If no URL is mapped, or the CDN image fails to load, we render an on-theme
 * gradient + emoji instead of a broken-image icon.
 */
export default function TileImage({ pos, className }: Props) {
  const [failed, setFailed] = useState(false);
  const tile = BOARD[pos];
  const url = tileImageUrl(pos);

  if (!tile) return null;

  if (!url || failed) {
    return (
      <div
        className={`tile-image tile-image-fallback ${className ?? ""}`}
        style={{ background: tileFallbackGradient(tile) }}
        role="img"
        aria-label={tile.name}
      >
        <span className="tile-image-fallback-emoji">{tileFallbackEmoji(tile)}</span>
      </div>
    );
  }

  return (
    <img
      className={`tile-image ${className ?? ""}`}
      src={url}
      alt={tile.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
