import { useEffect, useState } from "react";
import { ChevronRight, Smartphone } from "lucide-react";
import { ReviewQueueDialog } from "./ReviewQueueDialog";
import { OPEN_REVIEW_EVENT, usePendingExpenses, useReviewSms } from "@/hooks/useSmsImport";

// Mounted once in AppLayout, so the confirm queue is reachable from every page:
//  • a pill above the page content while anything is waiting
//  • the dialog opens by itself once per browser session when there's work
//  • anything else can open it with openReviewQueue()
const AUTO_OPEN_KEY = "noskip:review-auto-opened";
const AMBER = "#f59e0b";

function alreadyAutoOpened(): boolean {
  try { return sessionStorage.getItem(AUTO_OPEN_KEY) === "1"; } catch { return true; }
}
function rememberAutoOpened() {
  try { sessionStorage.setItem(AUTO_OPEN_KEY, "1"); } catch { /* private mode — fine */ }
}

export function ReviewQueueLauncher() {
  const [open, setOpen] = useState(false);
  const { data: pending = [], isSuccess: pendingLoaded } = usePendingExpenses();
  const { data: reviewSms = [], isSuccess: reviewLoaded } = useReviewSms();
  const count = pending.length + reviewSms.length;

  useEffect(() => {
    if (!pendingLoaded || !reviewLoaded || count === 0 || alreadyAutoOpened()) return;
    rememberAutoOpened();
    setOpen(true);
  }, [pendingLoaded, reviewLoaded, count]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_REVIEW_EVENT, handler);
    return () => window.removeEventListener(OPEN_REVIEW_EVENT, handler);
  }, []);

  return (
    <>
      {count > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-all active:scale-[0.99]"
          style={{
            background: `${AMBER}12`,
            border: `1px solid ${AMBER}40`,
            animation: "reviewPillIn 0.3s ease both",
          }}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${AMBER}22` }}
          >
            <Smartphone className="h-3.5 w-3.5" style={{ color: AMBER }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold leading-tight">
              {count} payment{count > 1 ? "s" : ""} to confirm
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              From your SMS · takes a tap each
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: AMBER }} />
          <style>{`@keyframes reviewPillIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
        </button>
      )}
      <ReviewQueueDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
