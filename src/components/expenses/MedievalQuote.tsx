import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Sword, Shield, Crown, Scroll, Flame, Landmark, Star, ChevronLeft, ChevronRight } from "lucide-react";

const QUOTES = [
  { text: "Do not save what is left after spending, but spend what is left after saving.", author: "Warren Buffett", icon: Crown },
  { text: "A budget is telling your money where to go instead of wondering where it went.", author: "Dave Ramsey", icon: Scroll },
  { text: "bro your bank account doesn't lie. every dumb purchase is still sitting there in the history. own it and fix it 💀", author: "Miraz Zim", icon: Flame },
  { text: "Spend less than you make. Always be saving something. Put it into a tax-deferred account. Over time it will amount to something.", author: "Charlie Munger", icon: Landmark },
  { text: "It's not how much money you make, but how much money you keep and how hard it works for you.", author: "Robert Kiyosaki", icon: Star },
  { text: "Beware of little expenses. A small leak will sink a great ship.", author: "Benjamin Franklin", icon: Scroll },
  { text: "tracking your expenses isn't boring — it's finding out exactly which subscriptions are quietly robbing you every month fr", author: "Miraz Zim", icon: Shield },
  { text: "If you buy things you do not need, soon you will have to sell things you need.", author: "Warren Buffett", icon: Sword },
  { text: "A big part of financial freedom is having your heart and mind free from worry — and that starts with tracking every expense.", author: "Suze Orman", icon: Star },
  { text: "You must gain control over your money or the lack of it will forever control you.", author: "Dave Ramsey", icon: Crown },
  { text: "no cap, the most glow-up you can have in your 20s is knowing where every single taka actually went", author: "Miraz Zim", icon: Flame },
  { text: "An expense is something that takes money out of your pocket. Know every single one of them.", author: "Robert Kiyosaki", icon: Scroll },
  { text: "If you want to change the fruits, you will first have to change the roots — starting with your spending.", author: "T. Harv Eker", icon: Landmark },
  { text: "Chains of habit are too light to be felt until they are too heavy to be broken — especially spending habits.", author: "Warren Buffett", icon: Shield },
  { text: "that 'small' daily expense you're not tracking? multiply it by 365. now you see the villain 📊", author: "Miraz Zim", icon: Sword },
  { text: "We buy things we don't need with money we don't have to impress people we don't like.", author: "Dave Ramsey", icon: Flame },
  { text: "Rich people manage their money well. Poor people mismanage their money well.", author: "T. Harv Eker", icon: Crown },
  { text: "you're not broke, you just have 6 active subscriptions, daily takeout, and zero budget. that's a you problem with a spreadsheet solution", author: "Miraz Zim", icon: Star },
  { text: "I have nothing to say to people trying to figure out how to spend more. I only talk to people who want to spend less.", author: "Charlie Munger", icon: Scroll },
  { text: "The only way to permanently take control of your financial life is to fix the root problem — unconscious spending.", author: "Suze Orman", icon: Shield },
  { text: "Chains of habit are too light to be felt until they are too heavy to be broken — especially spending habits.", author: "Warren Buffett", icon: Flame },
  { text: "every time you log an expense you're choosing to be the main character of your own financial story. NPC behaviour is just not logging it 💀", author: "Miraz Zim", icon: Crown },
  { text: "The rich focus on their asset columns while everyone else focuses on their income. Watch your expenses.", author: "Robert Kiyosaki", icon: Sword },
  { text: "Financial peace isn't the acquisition of stuff. It's learning to live on less than you make.", author: "Dave Ramsey", icon: Landmark },
  { text: "An investment in knowledge pays the best interest — but only if you're not drowning in unnecessary expenses first.", author: "Benjamin Franklin", icon: Star },
  { text: "the villain era is cutting the stuff you don't need and watching your savings actually move. it's giving financial plot twist 📈", author: "Miraz Zim", icon: Scroll },
  { text: "It's not about how much money you make, but how much money you keep.", author: "Warren Buffett", icon: Shield },
  { text: "lowkey the most powerful thing you can do today is open this app and actually look at what you spent last week. scary but necessary.", author: "Miraz Zim", icon: Flame },
  { text: "Spend less than you earn — always. It is the one rule that never fails.", author: "Charlie Munger", icon: Crown },
  { text: "A small daily expense, untracked, is the quiet thief of every big financial goal.", author: "Dave Ramsey", icon: Scroll },
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
