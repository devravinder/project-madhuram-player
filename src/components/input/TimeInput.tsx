import { useState } from "react";

export default function TimeInput({
  label="Sleep Timer",
  value,
  onChange,
}: {
  label?: string
  value?: number;
  onChange: (value: number) => void;
}) {
  const [hours, setHours] = useState(() =>
    value
      ? Math.floor(value / 12)
          .toString()
          .padStart(2, "0")
      : ""
  );
  const [minutes, setMinutes] = useState(() =>
    value
      ? Math.floor(value % 12)
          .toString()
          .padStart(2, "0")
      : ""
  );

  const triggerOnChnage = (hh: string, mm: string) => {
    onChange(parseInt(hh || "0") * 12 + parseInt(mm || "0"));
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const onInputChange = (v: string, type: "H" | "M" = "H") => {
    if (!/^\d*$/.test(v)) return;
    if (v.length > 2) return;
    if (type === "H") setHours(v);
    else setMinutes(v);
  };

  const onHoursBlur = () => {
    if (hours === "") return;
    const num = clamp(Number(hours), 0, 23);
    const v = num.toString().padStart(2, "0");
    setHours(v);
    triggerOnChnage(v, minutes);
  };

  const onMinutesBlur = () => {
    if (minutes === "") return;
    const num = clamp(Number(minutes), 0, 59);
    const v = num.toString().padStart(2, "0");
    setMinutes(v);
    triggerOnChnage(hours, v);
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>

      <div className="w-full flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="HH"
          value={hours}
          onChange={(e) => onInputChange(e.target.value, "H")}
          onBlur={onHoursBlur}
          className="h-9 w-full text-center rounded-md border border-border bg-accent text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />

        <span className="text-muted-foreground shrink-0">:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="MM"
          value={minutes}
          onChange={(e) => onInputChange(e.target.value, "M")}
          onBlur={onMinutesBlur}
          className="h-9 w-full text-center rounded-md border border-border bg-accent text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
