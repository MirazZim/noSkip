import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useUpdatePersonaRule, type CoachReaction, type PersonaRule } from "@/hooks/usePersonaRules";
import { PersonaCoachNote } from "./PersonaCoachNote";
import { toast } from "sonner";

const MAX_LEN = 120;

interface Props {
  rule: PersonaRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPersonaRuleDialog({ rule, open, onOpenChange }: Props) {
  const [text, setText] = useState(rule.name);
  const [reaction, setReaction] = useState<CoachReaction | null>(null);
  const updateRule = useUpdatePersonaRule();

  // Re-sync when a different rule is opened, and clear any prior reaction.
  useEffect(() => {
    if (open) {
      setText(rule.name);
      setReaction(null);
    }
  }, [open, rule.id, rule.name]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      // Editing re-runs the coach reaction (one round-trip).
      const result = await updateRule.mutateAsync({ id: rule.id, text: trimmed });
      setReaction(result);
    } catch {
      toast.error("Failed to update rule");
    }
  };

  const saved = reaction !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Reframe your rule</DialogTitle>
          <DialogDescription>
            Editing re-runs the coach's read. Your streak history stays intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
