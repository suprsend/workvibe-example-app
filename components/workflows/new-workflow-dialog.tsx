"use client";

import * as React from "react";
import { toast } from "sonner";
import { Sparkles, AlertCircle, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";
import { SendTest } from "@/components/workflows/send-test";
import type { Workflow } from "@/lib/wf/derive";

interface GenResult {
  workflow: Workflow & { description?: string; category?: string };
  templates: { slug: string; name: string; channels?: string[]; sample_data?: Record<string, string> }[];
  triggerVariables: string[];
}

const EXAMPLES = [
  "When a new hire joins, send a welcome email and inbox message. Two days later, remind them to enroll in benefits.",
  "Invite employees to the quarterly engagement survey by email and inbox. After 3 days, send an inbox reminder.",
  "On an employee's work anniversary, send a recognition email and post a shout-out to Slack.",
];

export function NewWorkflowDialog({ onPublished }: { onPublished: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [result, setResult] = React.useState<GenResult | null>(null);
  const [published, setPublished] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setDescription("");
    setResult(null);
    setPublished(false);
    setError(null);
    setGenerating(false);
    setPublishing(false);
  }

  // Merged example values across the workflow's templates — the test payload.
  const testData: Record<string, string> = React.useMemo(
    () => Object.assign({}, ...(result?.templates ?? []).map((t) => t.sample_data ?? {})),
    [result],
  );

  async function generate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate", description }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Generation failed.");
      else setResult({ workflow: data.workflow, templates: data.templates, triggerVariables: data.triggerVariables });
    } catch {
      setError("Couldn’t reach the AI author. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (!result) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "publish", generated: { workflow: result.workflow, templates: result.templates } }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(typeof data.body === "object" ? JSON.stringify(data.body) : (data.error ?? "Publish failed."));
        return;
      }
      toast.success("Workflow published", {
        description: `${result.workflow.name} + ${result.templates.length} template(s) are live.`,
      });
      setPublished(true);
      onPublished();
    } catch {
      setError("Couldn’t reach SuprSend. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="size-4" /> New workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            Describe the journey in plain English. The AI author builds the workflow and any templates it needs.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. When a new hire joins, send a welcome email and inbox message. Two days later, remind them to enroll in benefits."
              rows={3}
              autoFocus
            />
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setDescription(ex)}
                  className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div className="grid gap-4 md:grid-cols-[1fr_240px]">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{result.workflow.name}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{result.workflow.slug}</code>
                {result.workflow.category && <Badge variant="secondary">{result.workflow.category}</Badge>}
              </div>
              <WorkflowCanvas workflow={result.workflow} height={400} />
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Templates created
                </div>
                <div className="space-y-1">
                  {result.templates.map((t) => (
                    <div key={t.slug} className="flex items-center gap-1.5 text-sm">
                      <FileText className="size-3.5 text-muted-foreground" /> {t.name}
                    </div>
                  ))}
                </div>
              </div>
              {result.triggerVariables.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Trigger data
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.triggerVariables.map((v) => (
                      <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {published && result && (
          <div className="space-y-3 rounded-lg border border-green-600/30 bg-green-600/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="size-4" /> Live — workflow and templates published.
            </div>
            <SendTest workflowSlug={result.workflow.slug} data={testData} />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <Button onClick={generate} disabled={generating || !description.trim()}>
              {generating ? "Generating…" : "Generate"}
            </Button>
          ) : published ? (
            <Button
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setResult(null)} disabled={publishing}>
                Back
              </Button>
              <Button onClick={publish} disabled={publishing}>
                {publishing ? "Publishing…" : "Publish workflow + templates"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
