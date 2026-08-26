import { useEffect, useRef, useState } from "react";
import "./dice3d.css";

const FACE_ROTATION: Record<1 | 2 | 3 | 4 | 5 | 6, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 180, y: 0 },
};

export interface Dice3DProps {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  rolling: boolean;
  size?: number;
  onRollEnd?: () => void;
}

const DOTS: Record<number, string[]> = {
  1: ["center"],
  2: ["dtop dleft", "dbottom dright"],
  3: ["dtop dleft", "center", "dbottom dright"],
  4: ["dtop dleft", "dtop dright", "dbottom dleft", "dbottom dright"],
  5: ["center", "dtop dleft", "dtop dright", "dbottom dleft", "dbottom dright"],
  6: [
    "dtop dleft",
    "dtop dright",
    "dbottom dleft",
    "dbottom dright",
    "center dleft",
    "center dright",
  ],
};

function Face({ pips, className }: { pips: number; className: string }) {
  return (
    <div className={`dice-side ${className}`}>
      {DOTS[pips].map((cls, i) => (
        <div key={i} className={`dice-dot ${cls}`} />
      ))}
    </div>
  );
}

export default function Dice3D({ value, rolling, size = 100, onRollEnd }: Dice3DProps) {
  const [rotation, setRotation] = useState(FACE_ROTATION[value]);
  const spinCount = useRef(0);

  useEffect(() => {
    if (rolling) {
      spinCount.current += 1;
      const turnsX = 2 + (spinCount.current % 3);
      const turnsY = 2 + ((spinCount.current + 1) % 3);
      const target = FACE_ROTATION[value];
      setRotation({
        x: target.x + turnsX * 360,
        y: target.y + turnsY * 360,
      });
    }
    // No action on rolling -> false: the rotation reached during the
    // rolling-phase transition (base + turns*360) is already visually
    // correct and numerically stable, so resetting it here would cause
    // an unwanted second transition down to the bare angle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, value]);

  return (
    <div className="dice-wrapper" style={{ ["--dice-size" as any]: `${size}px` }}>
      <div
        className={`dice-cube ${rolling ? "is-rolling" : ""}`}
        style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "transform") onRollEnd?.();
        }}
      >
        <Face pips={1} className="front" />
        <Face pips={6} className="back" />
        <Face pips={2} className="top" />
        <Face pips={5} className="bottom" />
        <Face pips={3} className="right" />
        <Face pips={4} className="left" />
      </div>
    </div>
  );
}
