import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const QUOTES = [
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { text: "The chains of habit are too weak to be felt until they are too strong to be broken.", author: "Samuel Johnson" },
  { text: "A knight who trains daily fears no battle; a knight who trains never fears every shadow.", author: "Medieval Proverb" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "First we make our habits, then our habits make us.", author: "John Dryden" },
  { text: "The post-modern self is a series of rituals performed until they become identity.", author: "Jean Baudrillard" },
  { text: "He who would conquer himself must first conquer the dawn.", author: "Templar Maxim" },
  { text: "Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.", author: "John C. Maxwell" },
  { text: "The habit is the intersection where the signifier meets the daily grind.", author: "Derrida, probably" },
  { text: "Motivation gets you started. Habit keeps you going.", author: "Jim Ryun" },
  { text: "As the blacksmith shapes iron through daily blows, so doth the steadfast soul forge its virtue.", author: "Monastic Wisdom" },
  { text: "Identity is not found but constructed through the repetition of daily acts.", author: "Judith Butler" },
];

export function HabitQuote() {
  const [quote, setQuote] = useState<typeof QUOTES[number] | null>(null);

  const pickRandom = () => {
    let next: typeof QUOTES[number];
    do {
      next = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    } while (next === quote && QUOTES.length > 1);
    setQuote(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {quote ? (
        <div className="space-y-2">
          <p className="text-sm italic text-foreground">"{quote.text}"</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">— {quote.author}</span>
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7" onClick={pickRandom}>
              <Sparkles className="h-3 w-3" />
              Another
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground" onClick={pickRandom}>
          <Sparkles className="h-3.5 w-3.5" />
          Inspire me
        </Button>
      )}
    </div>
  );
}
