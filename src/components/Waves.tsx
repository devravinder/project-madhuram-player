import { tv } from "tailwind-variants";

const wave = tv({
  base: "shrink-0 min-w-1 w-1 bg-primary rounded-full transition-all",
  variants: { start: { true: "animate-wave", false: "h-[30%]" } },
});

export default function Waves({
  start,
  noOfWaves = 5,
}: {
  start: boolean;
  noOfWaves?: number;
}) {
  return (
    <div className="w-full h-full shrink-0 flex flex-row justify-between items-center">
      {[...Array(noOfWaves)].map((_, i) => (
        <div
          key={i}
          className={wave({ start })}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}
