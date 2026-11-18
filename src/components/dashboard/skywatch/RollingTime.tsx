// ─── Rolling time digits ──────────────────────────────────────────────────────
// Each digit is a little reel that rolls to its next number, odometer-style —
// every second, and in a blur when you drag through the day.

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function Reel({ ch }: { ch: string }) {
  if (!/\d/.test(ch)) return <span className="inline-block h-[1em] leading-[1em]">{ch}</span>;
  return (
    <span className="relative inline-block h-[1em] overflow-hidden" style={{ width: "1ch" }}>
      <span
        className="absolute inset-x-0 top-0 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1)]"
        style={{ transform: `translateY(-${Number(ch)}em)` }}
      >
        {DIGITS.map((d) => <span key={d} className="block h-[1em] text-center leading-[1em]">{d}</span>)}
      </span>
    </span>
  );
}

export function RollingTime({ date }: { date: Date }) {
  const h = date.getHours();
  const hm = `${h % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")}`;
  const ss = String(date.getSeconds()).padStart(2, "0");
  return (
    <time dateTime={date.toISOString()} className="inline-flex items-end tabular-nums">
      <span className="sr-only">{date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
      <span aria-hidden="true" className="flex text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]">
        {hm.split("").map((c, i) => <Reel key={`${hm.length}-${i}`} ch={c} />)}
      </span>
      <span aria-hidden="true" className="mb-[0.2em] ml-1 flex text-[13px] font-medium leading-none text-muted-foreground">
        :{ss.split("").map((c, i) => <Reel key={i} ch={c} />)}
        <span className="ml-1">{h < 12 ? "AM" : "PM"}</span>
      </span>
    </time>
  );
}
