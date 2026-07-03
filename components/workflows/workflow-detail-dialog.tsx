"use client";

import * as React from "react";
import { toast } from "sonner";
import { Sparkles, AlertCircle, PenLine, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";
import { TemplatePreview } from "@/components/templates/template-preview";
import { generatedToDraft, type GeneratedTemplate } from "@/lib/templates/draft";
import type { Workflow } from "@/lib/wf/derive";
import { diffWorkflow } from "@/lib/wf/diff";

type WfTemplate = GeneratedTemplate;

export function WorkflowDetailDialog({
  slug,
  open,
  onOpenChange,
  onChanged,
}: {
  slug: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        {open && slug ? (
          <DetailBody key={slug} slug={slug} onChanged={onChanged} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({
  slug,
  onChanged,
  onClose,
}: {
  slug: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = React.useState<Workflow | null>(null);
  const [proposed, setProposed] = React.useState<{ workflow: Workflow; templates: WfTemplate[] } | null>(null);
  const [instruction, setInstruction] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [openTemplate, setOpenTemplate] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/workflows?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        const d = await res.json();
        if (!active) return;
        if (d.ok) setCurrent(d.workflow);
        else setError(d.error ?? "Couldn’t load workflow.");
      } catch {
        if (active) setError("Couldn’t reach SuprSend.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  async function applyEdit() {
    if (!current || !instruction.trim()) return;
    setEditing(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "edit", workflow: current, instruction }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Edit failed.");
      else setProposed({ workflow: data.workflow, templates: data.templates ?? [] });
    } catch {
      setError("Couldn’t reach the AI author. Try again.");
    } finally {
      setEditing(false);
    }
  }

  async function publish() {
    if (!proposed) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "publish", generated: proposed }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(typeof data.body === "object" ? JSON.stringify(data.body) : (data.error ?? "Publish failed."));
        return;
      }
      toast.success("Workflow updated", { description: `${proposed.workflow.name} is live.` });
      onClose();
      onChanged();
    } catch {
      setError("Couldn’t reach SuprSend. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  const shown = proposed?.workflow ?? current;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {shown?.name ?? "Workflow"}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{slug}</code>
          {proposed && <Badge variant="secondary">Proposed change</Badge>}
        </DialogTitle>
        <DialogDescription>
          {proposed ? "Review the proposed flow, then publish or discard." : "Edit this journey in plain English."}
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : shown ? (
        <div className="space-y-4">
          {!proposed && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <PenLine className="size-4 text-primary" /> Edit with AI
              </div>
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Add an SMS reminder after 5 days, or wait 2 days instead of 3 before the first reminder."
                rows={2}
              />
              <Button size="sm" onClick={applyEdit} disabled={editing || !instruction.trim()}>
                <Sparkles className="size-3.5" /> {editing ? "Applying…" : "Apply change"}
              </Button>
            </div>
          )}

          {proposed && current && <ChangeSummary current={current} proposed={proposed.workflow} instruction={instruction} />}

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {proposed ? "Proposed flow" : "Current flow"}
            </div>
            <WorkflowCanvas workflow={shown} height={380} />
          </div>

          {proposed && proposed.templates.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Templates added / changed
              </div>
              <div className="space-y-1">
                {proposed.templates.map((t) => {
                  const isOpen = openTemplate === t.slug;
                  return (
                    <div key={t.slug} className="rounded-md border border-border">
                      <button
                        onClick={() => setOpenTemplate(isOpen ? null : t.slug)}
                        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-sm hover:bg-muted/40"
                      >
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="flex-1">{t.name}</span>
                        <span className="text-xs text-muted-foreground">{isOpen ? "Hide" : "Preview"}</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-border p-3">
                          <TemplatePreview draft={generatedToDraft(t)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      ) : null}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {proposed && (
        <DialogFooter>
          <Button variant="outline" onClick={() => setProposed(null)} disabled={publishing}>
            Discard
          </Button>
          <Button onClick={publish} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish change"}
          </Button>
        </DialogFooter>
      )}
    </>
  );
}

// Plain-English "what the AI changed" panel — Before → After steps with adds/removes
// highlighted, plus any settings change. Lets you confirm the edit matches your
// instruction before publishing (and spot a misinterpretation).
function ChangeSummary({ current, proposed, instruction }: { current: Workflow; proposed: Workflow; instruction: string }) {
  const diff = React.useMemo(() => diffWorkflow(current, proposed), [current, proposed]);

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="size-4 text-primary" /> What changed
      </div>

      {instruction && (
        <p className="text-xs text-muted-foreground">
          Your instruction: <span className="text-foreground">“{instruction}”</span>
        </p>
      )}

      {!diff.changed ? (
        <p className="text-sm text-muted-foreground">No structural change — the flow is the same. Try a more specific instruction.</p>
      ) : (
        <>
          {diff.settings.length > 0 && (
            <div className="space-y-1">
              {diff.settings.map((s) => (
                <div key={s.label} className="text-sm">
                  <span className="text-muted-foreground">{s.label}:</span>{" "}
                  <span className="text-destructive line-through">{s.before}</span> →{" "}
                  <span className="font-medium text-emerald-600">{s.after}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StepList title="Before" lines={diff.before.map((l) => ({ text: l.text, flag: l.removed }))} flagClass="text-destructive line-through opacity-70" />
            <StepList title="After" lines={diff.after.map((l) => ({ text: l.text, flag: l.added }))} flagClass="font-medium text-emerald-600" />
          </div>
        </>
      )}
    </div>
  );
}

function StepList({ title, lines, flagClass }: { title: string; lines: { text: string; flag: boolean }[]; flagClass: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <ol className="space-y-1">
        {lines.length === 0 && <li className="text-sm text-muted-foreground">—</li>}
        {lines.map((l, i) => (
          <li key={i} className={`text-sm ${l.flag ? flagClass : "text-foreground"}`}>
            {l.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
