"use client";

import * as React from "react";
import { ScrollText, FileText, Workflow as WorkflowIcon } from "lucide-react";
import type { AuditEvent } from "@/lib/server/audit";
import { useWorkspace } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo, fmtLocal } from "@/lib/message-display";

export function AuditClient() {
  const { workspace } = useWorkspace();
  return <AuditBody key={workspace} />;
}

function AuditBody() {
  const [events, setEvents] = React.useState<AuditEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<"all" | "template" | "workflow">("all");

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/audit", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!data.ok) {
          setError(data.error ?? "Couldn’t load the audit log.");
          setEvents([]);
        } else {
          setEvents(data.events);
        }
      } catch {
        if (active) {
          setError("Couldn’t reach SuprSend.");
          setEvents([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const fresh = events !== null;
  const rows = React.useMemo(
    () => (events ?? []).filter((e) => kind === "all" || e.kind === kind),
    [events, kind],
  );

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every template and workflow publish, from SuprSend's commit history — newest first. “WorkVibe” in By = published through the app's shared SuprSend service account."
        actions={
          fresh && events!.length > 0 ? (
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-ring focus:outline-none"
              >
                <option value="all">All</option>
                <option value="template">Templates</option>
                <option value="workflow">Workflows</option>
              </select>
            </label>
          ) : undefined
        }
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {!fresh ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : events!.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No changes recorded yet"
          description="Publish a template or workflow and every change shows up here from the commit history — what changed, and when."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[1.4fr_auto_1fr_auto_auto] items-center gap-4 border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Change</span>
            <span className="w-28">Action</span>
            <span>Commit message</span>
            <span className="w-20 text-right">By</span>
            <span className="w-20 text-right">When</span>
          </div>
          {rows.map((e) => {
            const Icon = e.kind === "template" ? FileText : WorkflowIcon;
            return (
              <div
                key={e.id}
                className="grid grid-cols-[1.4fr_auto_1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/20"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <code className="text-xs text-muted-foreground">{e.kind} · {e.slug}</code>
                  </span>
                </span>
                <span className="w-28">
                  <Badge variant={e.status === "active" ? "secondary" : "outline"}>{e.action}</Badge>
                </span>
                <span className="truncate text-sm text-muted-foreground" title={e.commitMessage ?? undefined}>
                  {e.commitMessage ?? "—"}
                </span>
                <span
                  className="w-20 truncate text-right text-xs text-muted-foreground"
                  title={
                    e.actor === "WorkVibe"
                      ? "Changes published through WorkVibe use one shared SuprSend service account, so SuprSend records the author as “WorkVibe”. Per-person names would require individual SuprSend logins."
                      : undefined
                  }
                >
                  {e.actor}
                </span>
                <span className="w-20 text-right text-xs text-muted-foreground" title={fmtLocal(e.at)}>
                  {e.at ? timeAgo(e.at) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
