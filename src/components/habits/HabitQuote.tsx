import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const QUOTES = [
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { text: "The chains of habit are too weak to be felt until they are too strong to be broken.", author: "Miraz Zim" },
  { 
    text: "Excellence is an art won by training and habituation.", 
    author: "Will Durant" 
  },
  { 
    text: "Quality is not an act, it is a habit.", 
    author: "Will Durant (on Aristotle)" 
  },
  { 
    text: "Your net worth to the world is usually determined by what remains after your bad habits are subtracted from your good ones.", 
    author: "Benjamin Franklin" 
  },
  { text: "A knight who trains daily fears no battle; a knight who trains never fears every shadow.", author: "Medieval Proverb" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "First we make our habits, then our habits make us.", author: "John Dryden" },
  { text: "The post-modern self is a series of rituals performed until they become identity.", author: "Jean Baudrillard" },
  { text: "He who would conquer himself must first conquer the dawn.", author: "Templar Maxim" },
  { text: "Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.", author: "John C. Maxwell" },
  { text: "Motivation gets you started. Habit keeps you going.", author: "Jim Ryun" },
  { text: "As the blacksmith shapes iron through daily blows, so doth the steadfast soul forge its virtue.", author: "Monastic Wisdom" },
  { text: "Identity is not found but constructed through the repetition of daily acts.", author: "Judith Butler" },
];

const SparklesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
    <path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z" opacity="0.6"/>
    <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z" opacity="0.6"/>
  </svg>
);

export function HabitQuote() {
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [direction, setDirection] = useState("next");

  const [dragOffset, setDragOffset] = useState(0);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const navigate = useCallback((dir: "next" | "prev") => {
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

  const goTo = useCallback((index: number) => {
    if (isAnimating || index === current) return;
    setDirection(index > current ? "next" : "prev");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrent(index);
      setIsAnimating(false);
    }, 300);
  }, [isAnimating, current]);

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    setDragOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      isDragging.current = false;
      setDragOffset(0);
      return;
    }
    e.preventDefault();
    setDragOffset(Math.max(-80, Math.min(80, deltaX * 0.6)));
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    setDragOffset(0);
    isDragging.current = false;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) >= 40) navigate(deltaX < 0 ? "next" : "prev");
  }, [navigate]);

  const quote = QUOTES[current];

  const slideStyle: React.CSSProperties = {
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
      {/* Background glow */}
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
          Daily Habit
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-border/60 via-border/20 to-transparent" />
        <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-muted text-muted-foreground">
          <SparklesIcon />
        </div>
      </div>

      {/* Quote body — slides on swipe, fades on navigate */}
      <div className="relative px-5 py-4 flex gap-4 items-start cursor-grab active:cursor-grabbing" style={slideStyle}>
        {/* Big decorative quote mark */}
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

      {/* Bottom controls — identical to MedievalQuote */}
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

      {/* Ghost sparkle icon */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden>
        <svg
          width="88" height="88" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.03 }}
        >
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
          <path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z" opacity="0.6"/>
          <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z" opacity="0.6"/>
        </svg>
      </div>
    </div>
  );
}
