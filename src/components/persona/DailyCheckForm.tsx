import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ScenarioInput {
  title: string;
  prompt: string;
  yesOutcome: string;
  noOutcome: string;
}

export function parseMindsetAndScenarios(description: string): {
  mindset: string;
  scenarios: ScenarioInput[];
} {
  const [mindsetPart, dcPart] = description.split(/\n---+\n/);
  if (!dcPart) return { mindset: description, scenarios: [] };

  const scenarios: ScenarioInput[] = [];
  for (const block of dcPart.split(/\n\n+/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const s: ScenarioInput = { title: "", prompt: "", yesOutcome: "", noOutcome: "" };
    for (const line of lines) {
      if (/^\*\*[^*]+\*\*$/.test(line)) {
        s.title = line.replace(/\*\*/g, "");
      } else if (line.startsWith("→")) {
        s.prompt = line.slice(1).trim()
          .replace(/^Ask yourself:\s*/i, "")
          .replace(/^\*/, "").replace(/\*$/, "");
      } else if (line.startsWith("* **Yes:**")) {
        s.yesOutcome = line.replace("* **Yes:**", "").trim();
      } else if (line.startsWith("* **No:**")) {
        s.noOutcome = line.replace("* **No:**", "").trim();
      }
    }
    if (s.title || s.prompt) scenarios.push(s);
  }

  return { mindset: mindsetPart || "", scenarios };
}

export function buildDescription(mindset: string, scenarios: ScenarioInput[]): string {
  const active = scenarios.filter((s) => s.title.trim() || s.prompt.trim());
  if (active.length === 0) return mindset;

  const dc = active.map((s) => {
    const lines: string[] = [];
    if (s.title.trim()) lines.push(`**${s.title.trim()}**`);
    if (s.prompt.trim()) lines.push(`→ Ask yourself: *${s.prompt.trim()}*`);
    if (s.yesOutcome.trim()) lines.push(`* **Yes:** ${s.yesOutcome.trim()}`);
    if (s.noOutcome.trim()) lines.push(`* **No:** ${s.noOutcome.trim()}`);
    return lines.join("\n");
  }).join("\n\n");

  return `${mindset}\n---\n${dc}`;
}

interface Props {
  scenarios: ScenarioInput[];
  onChange: (scenarios: ScenarioInput[]) => void;
  disabled?: boolean;
}

export function DailyCheckForm({ scenarios, onChange, disabled }: Props) {
  const update = (i: number, patch: Partial<ScenarioInput>) =>
    onChange(scenarios.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const remove = (i: number) => onChange(scenarios.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2.5">
      {scenarios.map((s, i) => (
        <div key={i} className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
          {/* Scenario title */}
          <div className="flex items-center gap-2">
            <Input
              value={s.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Scenario (e.g. Praise comes in)"
              className="h-8 text-[12.5px] font-semibold"
              disabled={disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Decision prompt */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-primary/70 shrink-0 pl-0.5">→</span>
            <Input
              value={s.prompt}
              onChange={(e) => update(i, { prompt: e.target.value })}
              placeholder="Ask yourself: did I meet my own standard?"
              className="h-8 text-[12px]"
              disabled={disabled}
            />
          </div>

          {/* Yes / No outcomes */}
          <div className="space-y-1.5 pl-5">
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
                Yes
              </span>
              <Input
                value={s.yesOutcome}
                onChange={(e) => update(i, { yesOutcome: e.target.value })}
                placeholder="Accept it and keep moving."
                className="h-7 text-[12px]"
                disabled={disabled}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                No
              </span>
              <Input
                value={s.noOutcome}
                onChange={(e) => update(i, { noOutcome: e.target.value })}
                placeholder="The praise is just noise. Discard it."
                className="h-7 text-[12px]"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-[12px] h-8 border-dashed"
        onClick={() => onChange([...scenarios, { title: "", prompt: "", yesOutcome: "", noOutcome: "" }])}
        disabled={disabled}
      >
        <Plus className="h-3.5 w-3.5" />
        Add scenario
      </Button>
    </div>
  );
}
