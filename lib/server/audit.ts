// Audit log — a workspace-wide change trail built from SuprSend's commit history.
// Self-contained on purpose (its own management-API fetch) so it never touches the
// shared template/workflow recipe code. Imports only READ-ONLY summary helpers.
//
// Sources (verified):
//   • Templates: GET v2/{ws}/template/{slug}/version/ → FULL version history
//     ({version_no, commit_message, updated_by, active_at, status, enabled_channels}).
//   • Workflows: NO version endpoint exists (404). The workflow detail carries only
//     the LATEST change (commit_message, updated_at, active_at, updated_by, status) —
//     so workflows contribute one "current state" event each, not full history.
import "server-only";
import { listTemplates, listWorkflows } from "@/lib/suprsend-mgmt";
import type { WorkspaceSlug } from "@/lib/workspaces";

const MGMNT = (process.env.SUPRSEND_MGMNT_URL || "https://management-api.suprsend.com/").replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const token = process.env.SUPRSEND_SERVICE_TOKEN;
  if (!token) throw new Error("SUPRSEND_SERVICE_TOKEN is not set");
  return { Authorization: `ServiceToken ${token}`, "Content-Type": "application/json" };
}

interface UpdatedBy {
  name?: string;
  email?: string;
}
interface TemplateVersion {
  version_no?: number | null;
  name?: string | null;
  commit_message?: string | null;
  status?: string;
  active_at?: string | null;
  updated_at?: string;
  enabled_channels?: string[];
  updated_by?: UpdatedBy;
}
interface WorkflowDetail {
  commit_message?: string | null;
  status?: string;
  active_at?: string | null;
  updated_at?: string;
  updated_by?: UpdatedBy;
}

export interface AuditEvent {
  id: string;
  kind: "template" | "workflow";
  name: string;
  slug: string;
  action: string;
  commitMessage: string | null;
  actor: string;
  at: string;
  status: string;
  channels: string[];
}

// All WorkVibe writes go through one account Service Token, so SuprSend records the
// actor as its "System User". Surface that honestly but cleanly.
function humanizeActor(by?: UpdatedBy): string {
  if (!by) return "—";
  if (by.email?.includes("systemuser.suprsend.com")) return "WorkVibe";
  return by.name || by.email || "—";
}

// The bare workflow GET returns the editable DRAFT working copy (status "draft",
// active_at null) for every workflow — even published ones. We must read ?mode=live
// to get the committed/active state, or audit mislabels every workflow "Saved draft".
async function workflowLive(ws: WorkspaceSlug, slug: string): Promise<WorkflowDetail | null> {
  try {
    const res = await fetch(`${MGMNT}/v1/${ws}/workflow/${slug}/?mode=live`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as WorkflowDetail;
  } catch {
    return null;
  }
}

async function templateVersions(ws: WorkspaceSlug, slug: string): Promise<TemplateVersion[]> {
  try {
    const res = await fetch(`${MGMNT}/v2/${ws}/template/${slug}/version/?limit=50`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: TemplateVersion[] };
    return body.results ?? [];
  } catch {
    return [];
  }
}

/** Newest-first list of every recorded publish/edit across templates + workflows. */
export async function listAuditEvents(ws: WorkspaceSlug): Promise<AuditEvent[]> {
  const [templates, workflows] = await Promise.all([listTemplates(ws), listWorkflows(ws)]);

  const templateEvents = (
    await Promise.all(
      templates.map(async (t) => {
        const versions = await templateVersions(ws, t.slug);
        return versions.map((v): AuditEvent => {
          // Any version with a version_no is a committed publish (status "active" =
          // current live version, "inactive" = superseded but still a real publish).
          const published = v.version_no != null;
          return {
            id: `tpl:${t.slug}:v${v.version_no ?? "draft"}`,
            kind: "template",
            // Use the name AS IT WAS at this version — NOT the current name —
            // otherwise renaming a template rewrites the name on all past versions.
            name: v.name ?? t.name,
            slug: t.slug,
            action: published ? `Published v${v.version_no}` : "Saved draft",
            commitMessage: v.commit_message ?? null,
            actor: humanizeActor(v.updated_by),
            at: v.active_at ?? v.updated_at ?? "",
            status: v.status ?? "draft",
            channels: v.enabled_channels ?? [],
          };
        });
      }),
    )
  ).flat();

  const workflowEvents = (
    await Promise.all(
      workflows.map(async (w): Promise<AuditEvent | null> => {
        const d = await workflowLive(ws, w.slug);
        if (!d) return null;
        const active = d.status === "active" || Boolean(d.active_at);
        return {
          id: `wf:${w.slug}`,
          kind: "workflow",
          name: w.name,
          slug: w.slug,
          action: active ? "Published" : "Saved draft",
          commitMessage: d.commit_message ?? null,
          actor: humanizeActor(d.updated_by),
          at: d.active_at ?? d.updated_at ?? "",
          status: d.status ?? "draft",
          channels: [],
        };
      }),
    )
  ).filter((e): e is AuditEvent => e !== null);

  return [...templateEvents, ...workflowEvents].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
