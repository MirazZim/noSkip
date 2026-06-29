import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useAddPersonaRule, type CoachReaction } from "@/hooks/usePersonaRules";
import { PersonaCoachNote } from "./PersonaCoachNote";
import { DailyCheckForm, buildDescription, type ScenarioInput } from "./DailyCheckForm";
import { toast } from "sonner";

const MAX_LEN = 120;
const MAX_MINDSET_LEN = 1000;

export function AddPersonaRuleDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mindsetText, setMindsetText] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([]);
  const [reaction, setReaction] = useState<CoachReaction | null>(null);
  const addRule = useAddPersonaRule();

  const reset = () => {
    setText("");
    setMindsetText("");
    setScenarios([]);
    setReaction(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const description = buildDescription(mindsetText.trim(), scenarios);
    try {
      const result = await addRule.mutateAsync({
        text: trimmed,
        description: description || undefined,
      });
      setReaction(result);
    } catch {
      toast.error("Failed to create rule");
    }
  };

  const saved = reaction !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Define a persona rule</DialogTitle>
          <DialogDescription>
            An identity you want to live by, tracked daily as a streak.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule name */}
          <div className="space-y-2">
            <Label htmlFor="persona-rule">Your rule</Label>
            <Textarea
              id="persona-rule"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              placeholder="e.g. Stay in control when provoked"
              rows={2}
              disabled={saved}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !saved) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <p className="text-right text-[11px] text-muted-foreground">{text.length}/{MAX_LEN}</p>
          </div>

          {!saved && (
            <>
              {/* Mindset */}
              <div className="space-y-2">
                <Label htmlFor="persona-mindset">
                  Mindset & principles
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">optional</span>
                </Label>
                <Textarea
                  id="persona-mindset"
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
                <div className="flex items-center gap-2">
                  <Label>
                    Daily Check
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">optional</span>
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  Decision scenarios that appear inside the Mindset card.
                </p>
                <DailyCheckForm scenarios={scenarios} onChange={setScenarios} />
              </div>
            </>
          )}

          {/* Coach reaction */}
          {saved && (
            <div className="space-y-2">
              {reaction!.flag_level === "none" ? (
                <p className="text-[12.5px] text-muted-foreground">
                  Rule saved. The coach is quiet on this one — start your streak.
                </p>
              ) : (
                <PersonaCoachNote flagLevel={reaction!.flag_level} note={reaction!.coach_note} />
              )}
            </div>
          )}

          {saved ? (
            <Button className="w-full" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!text.trim() || addRule.isPending}
            >
              {addRule.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading your rule…
                </span>
              ) : (
                "Create rule"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
