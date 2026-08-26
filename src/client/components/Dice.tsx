import { useEffect, useState } from "react";
import Dice3D from "./Dice3D";

type DiceValues = [number, number] | null;

interface DiceProps {
  values: DiceValues;
  rolling?: boolean;
}

export default function Dice({ values, rolling = false }: DiceProps) {
  const [lastValues, setLastValues] = useState<[number, number]>([1, 1]);

  useEffect(() => {
    if (values) setLastValues(values);
  }, [values]);

  const label = values
    ? `Dice rolled ${values[0]} and ${values[1]}, total ${values[0] + values[1]}`
    : "Dice waiting to be rolled";

  return (
    <div className="codepen-dice-stage" role="img" aria-label={label}>
      <div
        className="codepen-dice-pair"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "16px",
          width: "100%",
          margin: 0,
          padding: 0,
        }}
      >
        <Dice3D value={lastValues[0] as 1 | 2 | 3 | 4 | 5 | 6} rolling={rolling} size={90} />
        <Dice3D value={lastValues[1] as 1 | 2 | 3 | 4 | 5 | 6} rolling={rolling} size={90} />
      </div>
    </div>
  );
}
