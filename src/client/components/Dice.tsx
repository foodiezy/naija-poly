import { useEffect, useState, type CSSProperties } from "react";

type DiceValues = [number, number] | null;

const RESULT_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [180, 0],
};

type ResultStyle = CSSProperties & {
  "--codepen-result-x": string;
  "--codepen-result-y": string;
};

function CodePenDie({ value, rolling }: { value: number; rolling: boolean }) {
  const [rotateX, rotateY] = RESULT_ROTATION[value] ?? RESULT_ROTATION[1];
  const style: ResultStyle = {
    "--codepen-result-x": `${rotateX}deg`,
    "--codepen-result-y": `${rotateY}deg`,
  };

  return (
    <div className={`codepen-die-wrapper${rolling ? " is-rolling" : ""}`} aria-hidden="true">
      <div className="codepen-die-platform">
        <div className="codepen-die-result" style={style}>
          {/*
            Face structure and rolling motion adapted from “CSS3 Rolling Dice”
            by Tamer Aydın: https://codepen.io/tameraydin/pen/kMYreE
          */}
          <div className="codepen-die">
            <div className="codepen-side codepen-front">
              <div className="codepen-dot codepen-center" />
            </div>
            <div className="codepen-side codepen-front codepen-inner" />

            <div className="codepen-side codepen-top">
              <div className="codepen-dot codepen-dtop codepen-dleft" />
              <div className="codepen-dot codepen-dbottom codepen-dright" />
            </div>
            <div className="codepen-side codepen-top codepen-inner" />

            <div className="codepen-side codepen-right">
              <div className="codepen-dot codepen-dtop codepen-dleft" />
              <div className="codepen-dot codepen-center" />
              <div className="codepen-dot codepen-dbottom codepen-dright" />
            </div>
            <div className="codepen-side codepen-right codepen-inner" />

            <div className="codepen-side codepen-left">
              <div className="codepen-dot codepen-dtop codepen-dleft" />
              <div className="codepen-dot codepen-dtop codepen-dright" />
              <div className="codepen-dot codepen-dbottom codepen-dleft" />
              <div className="codepen-dot codepen-dbottom codepen-dright" />
            </div>
            <div className="codepen-side codepen-left codepen-inner" />

            <div className="codepen-side codepen-bottom">
              <div className="codepen-dot codepen-center" />
              <div className="codepen-dot codepen-dtop codepen-dleft" />
              <div className="codepen-dot codepen-dtop codepen-dright" />
              <div className="codepen-dot codepen-dbottom codepen-dleft" />
              <div className="codepen-dot codepen-dbottom codepen-dright" />
            </div>
            <div className="codepen-side codepen-bottom codepen-inner" />

            <div className="codepen-side codepen-back">
              <div className="codepen-dot codepen-dtop codepen-dleft" />
              <div className="codepen-dot codepen-dtop codepen-dright" />
              <div className="codepen-dot codepen-dbottom codepen-dleft" />
              <div className="codepen-dot codepen-dbottom codepen-dright" />
              <div className="codepen-dot codepen-center codepen-dleft" />
              <div className="codepen-dot codepen-center codepen-dright" />
            </div>
            <div className="codepen-side codepen-back codepen-inner" />

            <div className="codepen-side codepen-cover codepen-x" />
            <div className="codepen-side codepen-cover codepen-y" />
            <div className="codepen-side codepen-cover codepen-z" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dice({ values }: { values: DiceValues }) {
  const visibleValues: [number, number] = values ?? [1, 1];
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!values) {
      setRolling(false);
      return;
    }

    setRolling(true);
    const stopTimer = window.setTimeout(() => setRolling(false), 2000);
    return () => window.clearTimeout(stopTimer);
  }, [values?.[0], values?.[1], values === null]);

  const label = values
    ? `Dice rolled ${values[0]} and ${values[1]}, total ${values[0] + values[1]}`
    : "Dice waiting to be rolled";

  return (
    <div className="codepen-dice-stage" role="img" aria-label={label}>
      <div className="codepen-dice-pair" key={`${visibleValues.join("-")}-${rolling}`}>
        <CodePenDie value={visibleValues[0]} rolling={rolling} />
        <CodePenDie value={visibleValues[1]} rolling={rolling} />
      </div>
    </div>
  );
}
