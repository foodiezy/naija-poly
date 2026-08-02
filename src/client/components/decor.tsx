/**
 * Decorative game objects — the "floating stuff in the background" idea, done
 * as inline SVG so it costs zero network bytes and inherits `currentColor`.
 *
 * These are ornament, never information: every one is `aria-hidden`, and
 * nothing in the game is communicated by them alone. They exist because a flat
 * expanse of sand reads as a loading state, and because the objects are the
 * game — naira, okada, jollof, NEPA, land.
 *
 * Outline-only, 24×24, 1.6 stroke: at 4–8% opacity a filled shape turns into a
 * grey blob, while an outline still reads as a thing.
 */

type IconProps = { className?: string };

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DecorNaira({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" {...S} />
      <path d="M8 9v6M16 9v6M8 9l8 6M6 12h12" {...S} />
    </svg>
  );
}

export function DecorCoins({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="7" rx="7" ry="3" {...S} />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" {...S} />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" {...S} />
    </svg>
  );
}

export function DecorOkada({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="5.5" cy="17" r="3.5" {...S} />
      <circle cx="18.5" cy="17" r="3.5" {...S} />
      <path d="M5.5 17 9 9h5l3.5 8M9 9h7M14 9l2-4h2" {...S} />
    </svg>
  );
}

export function DecorPalm({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 21c0-6 .8-10 1.5-13" {...S} />
      <path
        d="M13.5 8c-2.4-2.2-5.4-2.6-7.5-.8M13.5 8c2-2.6 5-3.4 7.4-2M13.5 8c-3 .4-5.4 2.4-6.2 5.2M13.5 8c2.8 1 4.4 3.4 4.6 6.4"
        {...S}
      />
    </svg>
  );
}

export function DecorPot({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 10h16v4a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-4Z" {...S} />
      <path d="M2 10h20M8 7c0-1.5 1-2 1.5-3M14 7c0-1.5 1-2 1.5-3" {...S} />
    </svg>
  );
}

export function DecorNepa({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M13.5 2 5 13h5.5L9.5 22 19 10h-6l.5-8Z" {...S} />
    </svg>
  );
}

export function DecorPlane({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2.5 13.5 21 5l-4 9.5-6 1-2.5 5.5-1.5-5-5-2Z" {...S} />
    </svg>
  );
}

export function DecorHouse({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 11 12 3l9 8" {...S} />
      <path d="M5 10v10h14V10M10 20v-6h4v6" {...S} />
    </svg>
  );
}

const OBJECTS = [
  DecorNaira,
  DecorOkada,
  DecorPot,
  DecorPalm,
  DecorNepa,
  DecorCoins,
  DecorPlane,
  DecorHouse,
];

/**
 * A fixed, hand-placed scatter of the objects above. Positions are percentages
 * so it reflows with the container, and deliberately hand-picked rather than
 * random: a random scatter re-rolls on every render and clusters badly.
 */
const SPOTS = [
  { top: "7%", left: "5%", size: 76, rotate: -14 },
  { top: "16%", left: "83%", size: 60, rotate: 12 },
  { top: "43%", left: "2%", size: 54, rotate: 8 },
  { top: "60%", left: "87%", size: 82, rotate: -8 },
  { top: "76%", left: "10%", size: 64, rotate: 16 },
  { top: "33%", left: "72%", size: 48, rotate: -20 },
  { top: "86%", left: "63%", size: 56, rotate: 6 },
  { top: "5%", left: "45%", size: 50, rotate: -6 },
];

export function ScatterDecor({ className = "" }: { className?: string }) {
  return (
    <div className={`v2-scatter ${className}`.trim()} aria-hidden="true">
      {SPOTS.map((s, i) => {
        const Obj = OBJECTS[i % OBJECTS.length];
        return (
          <span
            key={i}
            className="v2-scatter-item"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              transform: `rotate(${s.rotate}deg)`,
            }}
          >
            <Obj />
          </span>
        );
      })}
    </div>
  );
}
