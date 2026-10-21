import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  label: string;
  onClose: () => void;
  /** Render prop: receives an animated `close` for in-content close buttons. */
  children: (close: () => void) => ReactNode;
}

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // iOS sheet curve
const DURATION = 420;

/**
 * iOS / Spotify–style bottom sheet:
 * - drag the grabber or header (or the content once scrolled to the top) to pull it down
 * - follows the finger with rubber-banding; flick or pull past ~25% to dismiss
 * - floats inset from the screen edges as a rounded, translucent glass card (Spotify-style)
 */
export function HabitSheet({ label, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  // ── visual state: y = px pulled down (0 = fully open) ──
  const apply = useCallback((y: number, animate: boolean) => {
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    if (!sheet) return;
    const h = sheet.offsetHeight || window.innerHeight;
    const p = Math.max(0, Math.min(1, 1 - y / h)); // 1 = open, 0 = closed
    const t = animate ? `${DURATION}ms ${EASE}` : "0s";
    sheet.style.transition = `transform ${t}, background-color ${t}, box-shadow ${t}`;
    sheet.style.transform = `translate3d(0, ${Math.max(y, 0) + Math.min(y, 0) * 0.25}px, 0)`;
    // frosted glass: the further you pull, the more the app shows through
    const g = Math.max(0, Math.min(1, y / (h * 0.3)));
    sheet.style.backgroundColor = `hsl(var(--card) / ${0.86 - g * 0.46})`;
    sheet.style.boxShadow = `0 18px 60px rgba(0,0,0,${0.5 - g * 0.25}), inset 0 0 0 1px hsl(0 0% 100% / ${0.08 + g * 0.12})`;
    const page = sheet.querySelector<HTMLElement>("[data-sheet-page]");
    if (page) {
      page.style.transition = animate ? `opacity ${t}` : "none";
      page.style.opacity = String(1 - g * 0.38);
    }
    if (overlay) {
      overlay.style.transition = `opacity ${t}`;
      overlay.style.opacity = String(p);
    }
  }, []);

  const resetApp = () => {
    const app = document.getElementById("root");
    if (!app) return;
    for (const k of ["transition", "transform", "transformOrigin", "borderRadius", "filter", "overflow"] as const) app.style[k] = "";
    document.body.style.background = "";
  };

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    apply((sheetRef.current?.offsetHeight ?? window.innerHeight) + 60, true); // clear the 8px float + shadow
    window.setTimeout(() => { resetApp(); onClose(); }, DURATION);
  }, [apply, onClose]);

  // open: start off-screen, then glide up
  useLayoutEffect(() => {
    apply(window.innerHeight, false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => apply(0, true)));
    return () => { cancelAnimationFrame(id); resetApp(); };
  }, [apply]);

  // growing past the mobile breakpoint: drop the sheet (desktop shows the side panel)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (mq.matches) { resetApp(); onClose(); } };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onClose]);

  // escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // latest callbacks, so the gesture listeners below attach once and never reset mid-drag
  const cb = useRef({ close });
  cb.current = { close };

  // ── gestures (non-passive so we can stop the page from scrolling while dragging) ──
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    let sx = 0, sy = 0, st = 0, dy = 0, dx = 0;
    let mode: "idle" | "pending" | "drag" | "scroll" = "idle";
    let fromGrab = false;

    const start = (e: TouchEvent) => {
      if (closing.current) return;
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; st = performance.now(); dy = 0; dx = 0;
      fromGrab = !!(e.target as HTMLElement).closest("[data-sheet-grab]");
      mode = "pending";
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle" || mode === "scroll") return;
      const t = e.touches[0];
      dx = t.clientX - sx; dy = t.clientY - sy;
      if (mode === "pending") {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) && (fromGrab || (scrollRef.current?.scrollTop ?? 0) <= 0)) mode = "drag";
        else if (fromGrab && dy < 0) mode = "drag"; // rubber-band upward on the grabber
        else { mode = "scroll"; return; }
      }
      if (mode === "drag") {
        e.preventDefault();
        apply(dy, false);
      }
    };
    const end = () => {
      const v = dy / Math.max(1, performance.now() - st); // px per ms
      if (mode === "drag") {
        const h = sheet.offsetHeight;
        if (dy > h * 0.25 || (v > 0.55 && dy > 30)) cb.current.close();
        else apply(0, true);
      }
      mode = "idle";
    };

    sheet.addEventListener("touchstart", start, { passive: true });
    sheet.addEventListener("touchmove", move, { passive: false });
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
    return () => {
      sheet.removeEventListener("touchstart", start);
      sheet.removeEventListener("touchmove", move);
      sheet.removeEventListener("touchend", end);
      sheet.removeEventListener("touchcancel", end);
    };
  }, [apply]);

  return createPortal(
    <>
      <style>{`
        .hsheet-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,0.28); opacity: 0; }
        /* floating glass card, inset from the edges with device-like corners */
        .hsheet-sheet {
          position: fixed; z-index: 61;
          left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px));
          max-height: calc(100dvh - 72px); display: flex; flex-direction: column; overflow: hidden;
          background-color: hsl(var(--card) / 0.86);
          backdrop-filter: blur(30px) saturate(1.8);
          -webkit-backdrop-filter: blur(30px) saturate(1.8);
          border-radius: 34px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.5), inset 0 0 0 1px hsl(0 0% 100% / 0.08);
          transform: translate3d(0, 110%, 0); will-change: transform;
        }
        .hsheet-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        /* see-through scrollbar: no track, a faint glassy thumb */
        .hsheet-scroll { scrollbar-width: thin; scrollbar-color: hsl(var(--foreground) / 0.22) transparent; }
        .hsheet-scroll::-webkit-scrollbar { width: 6px; background: transparent; }
        .hsheet-scroll::-webkit-scrollbar-track { background: transparent; }
        .hsheet-scroll::-webkit-scrollbar-thumb { background: hsl(var(--foreground) / 0.22); border-radius: 99px; border: 1px solid transparent; background-clip: padding-box; }
        .hsheet-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--foreground) / 0.4); background-clip: padding-box; }
        .hsheet-scroll::-webkit-scrollbar-corner { background: transparent; }
        /* Apple-style grabber: fixed at the very top of the sheet, outside the scroll area */
        .hsheet-grab {
          flex-shrink: 0; display: flex; justify-content: center;
          padding: 9px 0 4px; touch-action: none; cursor: grab;
        }
        .hsheet-bar {
          display: block; width: 36px; height: 5px; border-radius: 99px;
          background: hsl(var(--foreground) / 0.32);
        }
        @media (min-width: 1024px) { .hsheet-overlay, .hsheet-sheet { display: none !important; } }
      `}</style>
      <div ref={overlayRef} className="hsheet-overlay" onClick={close} />
      <div ref={sheetRef} className="hsheet-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="hsheet-grab" data-sheet-grab aria-hidden>
          <span className="hsheet-bar" />
        </div>
        <div ref={scrollRef} className="hsheet-scroll">
          <div data-sheet-page>
            {children(close)}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
