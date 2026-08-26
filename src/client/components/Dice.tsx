import type { CSSProperties } from "react";

type DiceValues = [number, number] | null;

const FACE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

const FACE_VALUES = {
  front: 1,
  back: 6,
  right: 3,
  left: 4,
  top: 2,
  bottom: 5,
} as const;

const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

type DieStyle = CSSProperties & {
  "--die-final-x": string;
  "--die-final-y": string;
  "--die-direction": number;
};

function DieFace({ side, value }: { side: keyof typeof FACE_VALUES; value: number }) {
  return (
    <div className={`od-die-face od-die-face-${side}`}>
      {FACE_PIPS[value].map((position) => (
        <span key={position} className={`od-die-pip od-die-pip-${position}`} />
      ))}
    </div>
  );
}

function Die({
  value,
  rolling,
  direction,
}: {
  value: number;
  rolling: boolean;
  direction: 1 | -1;
}) {
  const [rotateX, rotateY] = FACE_ROTATION[value] ?? FACE_ROTATION[1];
  const style: DieStyle = {
    "--die-final-x": `${rotateX}deg`,
    "--die-final-y": `${rotateY}deg`,
    "--die-direction": direction,
  };

  return (
    <div className={`od-die-scene${rolling ? " is-rolling" : ""}`} aria-hidden="true">
      <div className="od-die-cube" style={style}>
        {Object.entries(FACE_VALUES).map(([side, faceValue]) => (
          <DieFace key={side} side={side as keyof typeof FACE_VALUES} value={faceValue} />
        ))}
      </div>
    </div>
  );
}

export default function Dice({ values, rollKey }: { values: DiceValues; rollKey: string }) {
  const visibleValues: [number, number] = values ?? [1, 1];
  const label = values
    ? `Dice rolled ${values[0]} and ${values[1]}, total ${values[0] + values[1]}`
    : "Dice waiting to be rolled";

  return (
    <div
      className={`od-dice-stage${values ? " has-result" : " is-idle"}`}
      role="img"
      aria-label={label}
    >
      <div className="od-dice-pair" key={rollKey}>
        <Die value={visibleValues[0]} rolling={values !== null} direction={1} />
        <Die value={visibleValues[1]} rolling={values !== null} direction={-1} />
      </div>
      <span className="od-dice-caption">
        {values ? (
          <>
            <strong>{values[0] + values[1]}</strong> total
          </>
        ) : (
          "Roll the dice"
        )}
      </span>
    </div>
  );
}
