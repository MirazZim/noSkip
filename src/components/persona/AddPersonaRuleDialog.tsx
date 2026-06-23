import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useAddPersonaRule, type CoachReaction } from "@/hooks/usePersonaRules";
import { PersonaCoachNote } from "./PersonaCoachNote";
import { toast } from "sonner";

const MAX_LEN = 120;
const MAX_DESC_LEN = 1000;

export function AddPersonaRuleDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [reaction, setReaction] = useState<CoachReaction | null>(null);
  const addRule = useAddPersonaRule();

  const reset = () => {
    setText("");
    setDescription("");
    setReaction(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const result = await addRule.mutateAsync({
        text: trimmed,
        description: description.trim() || undefined,
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
      <DialogContent className="sm:max-w-md">
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

          {/* Optional description */}
          {!saved && (
            <div className="space-y-2">
              <Label htmlFor="persona-desc">
                Mindset & principles
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">optional</span>
              </Label>
              <Textarea
                id="persona-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC_LEN))}
                placeholder={"Explain the mindset behind this rule — why it matters, what it looks like in practice.\n\nStart a line with > to make it a power statement.\n> Seal your lips. Open them only when the work is done."}
                rows={5}
                className="resize-none text-[13px] leading-relaxed"
              />
              {description.length > 0 && (
                <p className="text-right text-[11px] text-muted-foreground">{description.length}/{MAX_DESC_LEN}</p>
              )}
            </div>
          )}

          {/* Coach's read — shown the moment the rule is saved */}
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
