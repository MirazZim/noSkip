import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths, isSameMonth } from "date-fns";

interface MonthPickerProps {
  month: Date;
  onChange: (month: Date) => void;
}

export function MonthPicker({ month, onChange }: MonthPickerProps) {
  const isCurrentMonth = isSameMonth(month, new Date());

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card shadow-sm p-0.5">
      <button
        onClick={() => onChange(subMonths(month, 1))}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="flex flex-col items-center min-w-[72px] sm:min-w-[90px] px-1 select-none">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 leading-none">
          {format(month, "yyyy")}
        </span>
        <span className="text-xs sm:text-sm font-black tracking-tight text-foreground leading-tight">
          {format(month, "MMM")}
        </span>
      </div>

      <button
        onClick={() => onChange(addMonths(month, 1))}
        disabled={isCurrentMonth}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-25 disabled:pointer-events-none"
        aria-label="Next month"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
