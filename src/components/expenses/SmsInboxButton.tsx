import { CreditCard } from "lucide-react";
import { openReviewQueue, usePendingExpenses, useReviewSms } from "@/hooks/useSmsImport";

// Header button for the SMS payment queue, with a Messenger-style unread badge:
// a red count bubble on the icon's top-right corner that pops each time the
// number changes. Hidden when nothing is waiting.
const BADGE_RED = "#ff3b30";

export function SmsInboxButton() {
  const { data: pending = [] } = usePendingExpenses();
  const { data: reviewSms = [] } = useReviewSms();
  const count = pending.length + reviewSms.length;
  const unread = count > 0;

  return (
    <button
      onClick={openReviewQueue}
      title={unread ? `${count} SMS payment${count > 1 ? "s" : ""} to confirm` : "SMS payments: confirm or paste"}
      aria-label={unread ? `SMS payments, ${count} unread` : "SMS payments"}
      className="relative flex h-9 w-9 items-center justify-center rounded-2xl transition-all active:scale-95"
      style={{
        background: "hsl(var(--muted) / 0.6)",
        border: "1px solid hsl(var(--border) / 0.5)",
        color: unread ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
      }}
    >
      <CreditCard size={16} strokeWidth={unread ? 2.25 : 1.75} />

      {unread && (
        <span
          // Re-keyed on count so the pop replays whenever a new payment lands
          key={count}
          className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none text-white tabular-nums"
          style={{
            background: BADGE_RED,
            // Ring in the page background colour "cuts" the badge out of the button, like Messenger
            boxShadow: `0 0 0 2px hsl(var(--background)), 0 2px 6px ${BADGE_RED}66`,
            animation: "smsBadgePop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}

      <style>{`
        @keyframes smsBadgePop {
          0%   { transform: scale(0); }
          60%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes smsBadgePop { from { transform: none; } to { transform: none; } }
        }
      `}</style>
    </button>
  );
}
