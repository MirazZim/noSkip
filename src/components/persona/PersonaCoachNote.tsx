import { Sparkles, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlagLevel } from "@/hooks/usePersonaRules";

interface Props {
  flagLevel: FlagLevel;
  note: string | null;
  /** When provided on a 'caution' note, renders a "Reframe" affordance. */
  onReframe?: () => void;
  className?: string;
}

/**
 * The AI coach's one-line read on a persona rule.
 * - healthy → calm affirmation
 * - caution → softer warning style + optional "Reframe" (advisory, never a gate)
 * - none / empty → renders nothing
 */
export function PersonaCoachNote({ flagLevel, note, onReframe, className }: Props) {
  if (!note || flagLevel === "none") return null;

  const isCaution = flagLevel === "caution";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] leading-snug",
        isCaution
          ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-700 dark:text-amber-300"
          : "border-primary/20 bg-primary/[0.05] text-foreground/75",
        className
      )}
    >
      <span className={cn("mt-[1px] shrink-0", isCaution ? "text-amber-500" : "text-primary")}>
        {isCaution ? <ShieldAlert className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{note}</p>
        {isCaution && onReframe && (
          <button
            type="button"
            onClick={onReframe}
            className="mt-1 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400 underline-offset-2 hover:underline"
          >
            Reframe this rule
          </button>
        )}
      </div>
    </div>
  );
}
