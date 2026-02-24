import { useState, useEffect, useRef } from "react";

const QUOTES = [
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { text: "The chains of habit are too weak to be felt until they are too strong to be broken.", author: "Samuel Johnson" },
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
  const [quote, setQuote] = useState<typeof QUOTES[number] | null>(null);
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const pickRandom = () => {
    if (animating) return;
    setAnimating(true);
    setVisible(false);

    timeoutRef.current = setTimeout(() => {
      let next: typeof QUOTES[number];
      do {
        next = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      } while (next === quote && QUOTES.length > 1);
      setQuote(next);
      setAnimating(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    }, 220);
  };

  // Auto-show first quote on mount
  useEffect(() => {
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setQuote(randomQuote);
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        .hq-wrap {
          position: relative;
          border-radius: 16px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .hq-wrap:hover { border-color: hsl(var(--primary) / 0.3); }

        /* Subtle top-left glow accent */
        .hq-glow {
          position: absolute;
          top: -40px; left: -40px;
          width: 120px; height: 120px;
          background: radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 70%);
          pointer-events: none;
          border-radius: 50%;
        }

        .hq-inner {
          position: relative;
          display: flex;
          align-items: stretch;
          gap: 0;
          min-height: 72px;
        }

        /* Left accent bar with icon */
        .hq-accent {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 18px 14px;
          gap: 8px;
          flex-shrink: 0;
          border-right: 1px solid hsl(var(--border));
        }
        .hq-icon {
          width: 30px; height: 30px;
          border-radius: 9px;
          background: hsl(var(--primary) / 0.1);
          color: hsl(var(--primary));
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .hq-quotemark {
          font-size: 28px;
          line-height: 1;
          color: hsl(var(--primary) / 0.2);
          font-family: Georgia, serif;
          font-weight: 700;
          letter-spacing: -2px;
          user-select: none;
        }

        /* Content */
        .hq-content {
          flex: 1;
          padding: 16px 18px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }

        .hq-text {
          font-size: 13.5px;
          line-height: 1.6;
          color: hsl(var(--foreground));
          font-style: italic;
          letter-spacing: -0.005em;
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .hq-text--visible {
          opacity: 1;
          transform: translateY(0);
        }

        .hq-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 0.3s ease 0.06s, transform 0.3s ease 0.06s;
        }
        .hq-footer--visible {
          opacity: 1;
          transform: translateY(0);
        }

        .hq-author {
          font-size: 11px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hq-author::before {
          content: '— ';
          opacity: 0.5;
        }

        .hq-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 20px;
          border: 1px solid hsl(var(--border));
          background: transparent;
          color: hsl(var(--muted-foreground));
          font-size: 11px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          letter-spacing: 0.02em;
          transition: all 0.15s ease;
        }
        .hq-btn:hover {
          border-color: hsl(var(--primary) / 0.4);
          color: hsl(var(--primary));
          background: hsl(var(--primary) / 0.05);
        }
        .hq-btn:active { transform: scale(0.95); }
        .hq-btn:disabled { opacity: 0.4; cursor: default; }

        /* Spinning sparkle on click */
        .hq-btn-icon {
          display: flex; align-items: center;
          transition: transform 0.4s ease;
        }
        .hq-btn:not(:disabled):active .hq-btn-icon {
          transform: rotate(180deg);
        }
      `}</style>

      <div className="hq-wrap">
        <div className="hq-glow" />
        <div className="hq-inner">
          {/* Left accent */}
          <div className="hq-accent">
            <div className="hq-icon">
              <SparklesIcon />
            </div>
            <span className="hq-quotemark">"</span>
          </div>

          {/* Content */}
          <div className="hq-content">
            {quote && (
              <>
                <p className={`hq-text ${visible ? "hq-text--visible" : ""}`}>
                  {quote.text}
                </p>
                <div className={`hq-footer ${visible ? "hq-footer--visible" : ""}`}>
                  <span className="hq-author">{quote.author}</span>
                  <button
                    className="hq-btn"
                    onClick={pickRandom}
                    disabled={animating}
                  >
                    <span className="hq-btn-icon"><SparklesIcon /></span>
                    Inspire me
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}