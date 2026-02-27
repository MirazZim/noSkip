import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Sword, Shield, Crown, Scroll, Flame, Landmark, Star, ChevronLeft, ChevronRight } from "lucide-react";

const QUOTES = [
  { text: "A wise man doth not hoard his gold, but spendeth it with purpose and honour.", author: "The Code of the Ledger", icon: Scroll },
  { text: "He who keepeth account of every coin shall never be a servant to debt.", author: "The Merchant's Creed", icon: Crown },
  { text: "Discipline in thy purse is the truest armour against the siege of ruin.", author: "Sir Edmund the Frugal", icon: Shield },
  { text: "Spend not thy silver on fleeting pleasures, but invest in the fortress of thy future.", author: "The Order of the Golden Quill", icon: Landmark },
  { text: "A knight who knoweth his expenses fighteth not in the dark.", author: "The Treasury Scrolls", icon: Sword },
  { text: "Even the mightiest castle was built one stone — and one coin — at a time.", author: "The Builder's Proverb", icon: Landmark },
  { text: "To master thy wealth is to master thyself; there is no greater conquest.", author: "The Sage of Ironhall", icon: Crown },
  { text: "Let every coin tell a tale of wisdom, not of folly.", author: "The Chronicler's Oath", icon: Scroll },
  { text: "Guard thy gold as thou wouldst guard thy honour — with vigilance and resolve.", author: "The Shield-Bearer's Maxim", icon: Shield },
  { text: "The road to ruin is paved with untracked spending. Map thy journey, brave soul.", author: "The Pilgrim's Ledger", icon: Flame },
  { text: "Fear not the tally of thy debts — face them, and they shall crumble like old ramparts.", author: "Lord Aldric the Steadfast", icon: Sword },
  { text: "A full treasury without a plan is but a dragon's hoard — useless and cursed.", author: "The Alchemist's Warning", icon: Flame },
  { text: "Wealth ungoverned is a river unbanked — it floods all it toucheth into ruin.", author: "The River Sage of Ashenveil", icon: Scroll },
  { text: "Count thy blessings in coin and character alike, for both may be spent and both may be earned.", author: "The Twin Ledger Principle", icon: Star },
  { text: "He who compareth his hoard to his neighbour's shall know only envy; he who compareth it to his goals shall know only progress.", author: "The Monastery of Modest Means", icon: Crown },
  { text: "The blacksmith forges iron with fire; the treasurer forges fortune with patience.", author: "Guild of the Iron Purse", icon: Flame },
  { text: "Thine expenses are a mirror — gaze upon them and thou shalt see thy true values.", author: "The Oracle of the Counting House", icon: Scroll },
  { text: "Not the size of the purse, but the wisdom of the hand that holdeth it, maketh the noble man.", author: "Lady Seraphine of the Silver Keep", icon: Crown },
  { text: "Every debt is a chain; every saved coin, a key.", author: "The Liberated Knight's Chronicle", icon: Shield },
  { text: "Waste not thy morning hours nor thy evening gold — both, once gone, returneth not.", author: "The Twin Wisdoms of Thornwick", icon: Star },
];

const ORNAMENTS = ["✦", "⟡", "✧", "◈", "⬡"];

export function MedievalQuote() {
  const startIndex = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
    return dayOfYear % QUOTES.length;
  }, []);

  const [current, setCurrent] = useState(startIndex);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState("next");

  // Swipe tracking refs
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isDragging = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  const navigate = useCallback((dir) => {
    if (isAnimating) return;
    setDirection(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setCurrent((prev) =>
        dir === "next"
          ? (prev + 1) % QUOTES.length
          : (prev - 1 + QUOTES.length) % QUOTES.length
      );
      setIsAnimating(false);
    }, 300);
  }, [isAnimating]);

  const goTo = useCallback((index) => {
    if (isAnimating || index === current) return;
    setDirection(index > current ? "next" : "prev");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrent(index);
      setIsAnimating(false);
    }, 300);
  }, [isAnimating, current]);

  // ── Touch handlers ──────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    setDragOffset(0);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging.current || touchStartX.current === null) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // If scrolling vertically, don't hijack the swipe
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      isDragging.current = false;
      setDragOffset(0);
      return;
    }

    // Prevent page scroll while swiping horizontally
    e.preventDefault();

    // Clamp drag offset for a natural rubber-band feel
    const clamped = Math.max(-80, Math.min(80, deltaX * 0.6));
    setDragOffset(clamped);
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!isDragging.current || touchStartX.current === null) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const SWIPE_THRESHOLD = 40;

    setDragOffset(0);
    isDragging.current = false;
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      navigate(deltaX < 0 ? "next" : "prev");
    }
  }, [navigate]);
  // ────────────────────────────────────────────────────────────

  const quote = QUOTES[current];
  const ornament = ORNAMENTS[current % ORNAMENTS.length];
  const Icon = quote.icon;

  const slideStyle = {
    transition: isAnimating ? "opacity 0.3s ease, transform 0.3s ease" : "transform 0.15s ease",
    opacity: isAnimating ? 0 : 1,
    transform: isAnimating
      ? `translateX(${direction === "next" ? "-12px" : "12px"})`
      : `translateX(${dragOffset}px)`,
    willChange: "transform",
    touchAction: "pan-y",
  };

  return (
    <div
      className="relative rounded-2xl border border-border/70 bg-card overflow-hidden shadow-sm select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background geometry */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 90% 50%, hsl(var(--primary) / 0.04) 0%, transparent 60%),
            radial-gradient(ellipse at 10% 50%, hsl(var(--muted) / 0.6) 0%, transparent 50%)
          `,
        }}
      />

      {/* Header row */}
      <div className="relative flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border/40">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
          Daily Wisdom
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-border/60 via-border/20 to-transparent" />
        <span className="text-muted-foreground/30 text-sm">{ornament}</span>
        <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Quote body — swipeable area */}
      <div
        className="relative px-5 py-4 flex gap-4 items-start cursor-grab active:cursor-grabbing"
        style={slideStyle}
      >
        <div
          className="select-none shrink-0 font-black leading-none text-[72px] text-muted-foreground/10 -mt-3 -ml-1"
          style={{ fontFamily: "Georgia, serif", lineHeight: 1 }}
          aria-hidden
        >
          "
        </div>
        <blockquote className="flex-1 min-w-0">
          <p
            className="text-sm leading-relaxed text-foreground/85"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
          >
            {quote.text}
          </p>
          <footer className="mt-3 flex items-center gap-2">
            <div className="h-px w-4 bg-border" />
            <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {quote.author}
            </span>
          </footer>
        </blockquote>
      </div>

      {/* Bottom controls */}
      <div className="px-5 pb-4 flex items-center justify-between gap-3">
        {/* Dot indicators */}
        <div className="flex items-center gap-1.5 flex-wrap max-w-[60%]">
          {QUOTES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="rounded-full transition-all duration-300 focus:outline-none"
              style={{
                width: i === current ? "20px" : "6px",
                height: "6px",
                background: i === current ? "hsl(var(--primary))" : "hsl(var(--border))",
                opacity: i === current ? 1 : 0.5,
              }}
              aria-label={`Go to quote ${i + 1}`}
            />
          ))}
        </div>

        {/* Prev / Next buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => navigate("prev")}
            className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted hover:bg-muted/80 transition-colors focus:outline-none"
            aria-label="Previous quote"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate("next")}
            className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted hover:bg-muted/80 transition-colors focus:outline-none"
            aria-label="Next quote"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Ghost icon */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden>
        <Icon className="text-foreground" style={{ width: 88, height: 88, opacity: 0.03 }} />
      </div>
    </div>
  );
}
