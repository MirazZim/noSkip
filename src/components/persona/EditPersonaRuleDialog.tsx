import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useUpdatePersonaRule, type CoachReaction, type PersonaRule } from "@/hooks/usePersonaRules";
import { PersonaCoachNote } from "./PersonaCoachNote";
import { DailyCheckForm, buildDescription, parseMindsetAndScenarios, type ScenarioInput } from "./DailyCheckForm";
import { toast } from "sonner";

const MAX_LEN = 120;
const MAX_MINDSET_LEN = 1000;

interface Props {
  rule: PersonaRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPersonaRuleDialog({ rule, open, onOpenChange }: Props) {
  const [text, setText] = useState(rule.name);
  const [mindsetText, setMindsetText] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([]);
  const [reaction, setReaction] = useState<CoachReaction | null>(null);
  const updateRule = useUpdatePersonaRule();

  useEffect(() => {
    if (open) {
      setText(rule.name);
      const parsed = parseMindsetAndScenarios(rule.description ?? "");
      setMindsetText(parsed.mindset);
      setScenarios(parsed.scenarios);
      setReaction(null);
    }
  }, [open, rule.id, rule.name, rule.description]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const description = buildDescription(mindsetText.trim(), scenarios);
    try {
      const result = await updateRule.mutateAsync({
        id: rule.id,
        text: trimmed,
        description: description || undefined,
      });
      setReaction(result);
    } catch {
      toast.error("Failed to update rule");
    }
  };

  const saved = reaction !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Reframe your rule</DialogTitle>
          <DialogDescription>
            Editing re-runs the coach's read. Your streak history stays intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule name */}
          <div className="space-y-2">
            <Label htmlFor="persona-rule-edit">Your rule</Label>
            <Textarea
              id="persona-rule-edit"
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, MAX_LEN)); setReaction(null); }}
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <p className="text-right text-[11px] text-muted-foreground">{text.length}/{MAX_LEN}</p>
          </div>

          {/* Mindset */}
          <div className="space-y-2">
            <Label htmlFor="persona-mindset-edit">
              Mindset & principles
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">optional</span>
            </Label>
            <Textarea
              id="persona-mindset-edit"
              value={mindsetText}
              onChange={(e) => setMindsetText(e.target.value.slice(0, MAX_MINDSET_LEN))}
              placeholder={"Explain the mindset behind this rule — why it matters, what it looks like in practice.\n\nStart a line with > to make it a power statement.\n> Seal your lips. Open them only when the work is done."}
              rows={5}
              className="resize-none text-[13px] leading-relaxed"
            />
            {mindsetText.length > 0 && (
              <p className="text-right text-[11px] text-muted-foreground">{mindsetText.length}/{MAX_MINDSET_LEN}</p>
            )}
          </div>

          {/* Daily Check */}
          <div className="space-y-2">
            <Label>
              Daily Check
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">optional</span>
            </Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Decision scenarios that appear inside the Mindset card.
            </p>
            <DailyCheckForm scenarios={scenarios} onChange={setScenarios} disabled={saved} />
          </div>

          {saved && reaction!.flag_level !== "none" && (
            <PersonaCoachNote flagLevel={reaction!.flag_level} note={reaction!.coach_note} />
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {saved ? "Done" : "Cancel"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!text.trim() || updateRule.isPending}
            >
              {updateRule.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading…
                </span>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
