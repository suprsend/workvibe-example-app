import { NextResponse } from "next/server";
import { errMsg } from "@/lib/server/http";
import { getActiveWorkspace } from "@/lib/server/workspace";
import { generateJSON } from "@/lib/ai/openai";
import { buildWorkflowSystemPrompt, buildWorkflowEditPrompt } from "@/lib/ai/workflow-prompt";
import { listWorkflows, getWorkflow, publishWorkflow, publishTemplate } from "@/lib/suprsend-mgmt";
import { generatedToDraft, type GeneratedTemplate } from "@/lib/templates/draft";

interface GeneratedWorkflow {
  slug: string;
  name: string;
  description?: string;
  trigger_type: string;
  category: string;
  is_enabled?: boolean;
  tree: { nodes: Record<string, unknown>[] };
  payload_schema?: Record<string, unknown>;
}

interface Generated {
  workflow: GeneratedWorkflow;
  templates?: GeneratedTemplate[];
}

/** Union of every variable referenced across the workflow's templates. */
function triggerVariables(templates: GeneratedTemplate[]): string[] {
  const vars = new Set<string>();
  for (const t of templates) {
    const sample = t.sample_data ?? t.sampleData ?? {};
    Object.keys(sample).forEach((k) => vars.add(k));
  }
  return [...vars];
}

function validWorkflow(w: unknown): w is GeneratedWorkflow {
  const x = w as GeneratedWorkflow | undefined;
  return (
    !!x &&
    typeof x.slug === "string" &&
    /^[a-z0-9-]+$/.test(x.slug) &&
    typeof x.name === "string" &&
    !!x.tree &&
    Array.isArray(x.tree.nodes) &&
    x.tree.nodes.length > 0
  );
}

export async function GET(req: Request) {
  try {
    const ws = await getActiveWorkspace();
    const slug = new URL(req.url).searchParams.get("slug");
    if (slug) {
      const r = await getWorkflow(ws.slug, slug);
      if (!r.ok) return NextResponse.json({ ok: false, error: "Workflow not found." }, { status: 404 });
      return NextResponse.json({ ok: true, workflow: r.body });
    }
    const workflows = await listWorkflows(ws.slug);
    return NextResponse.json({ ok: true, workflows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ws = await getActiveWorkspace();
    const { mode, description, generated, workflow, instruction } = await req.json();

    if (mode === "generate") {
      if (typeof description !== "string" || !description.trim()) {
        return NextResponse.json({ ok: false, error: "Describe the workflow you want." }, { status: 400 });
      }
      const out = await generateJSON<Generated>(buildWorkflowSystemPrompt(), description.trim());
      if (!validWorkflow(out.workflow)) {
        return NextResponse.json({ ok: false, error: "AI returned an invalid workflow." }, { status: 422 });
      }
      const templates = out.templates ?? [];
      return NextResponse.json({
        ok: true,
        workflow: out.workflow,
        templates,
        triggerVariables: triggerVariables(templates),
      });
    }

    if (mode === "edit") {
      if (!workflow || typeof instruction !== "string" || !instruction.trim()) {
        return NextResponse.json({ ok: false, error: "Need the workflow and an instruction." }, { status: 400 });
      }
      const userMsg = `CURRENT WORKFLOW JSON:\n${JSON.stringify(workflow)}\n\nINSTRUCTION:\n${instruction.trim()}`;
      const out = await generateJSON<Generated>(buildWorkflowEditPrompt(), userMsg);
      if (!validWorkflow(out.workflow)) {
        return NextResponse.json({ ok: false, error: "AI returned an invalid workflow." }, { status: 422 });
      }
      const templates = out.templates ?? [];
      return NextResponse.json({
        ok: true,
        workflow: out.workflow,
        templates,
        triggerVariables: triggerVariables(templates),
      });
    }

    if (mode === "publish") {
      const g = generated as Generated | undefined;
      if (!g || !validWorkflow(g.workflow)) {
        return NextResponse.json({ ok: false, error: "No workflow to publish." }, { status: 400 });
      }
      // 1) Publish every template FIRST. If any fails, do NOT publish the workflow (atomic).
      for (const t of g.templates ?? []) {
        const r = await publishTemplate(ws.slug, generatedToDraft(t));
        if (!r.ok) {
          return NextResponse.json(
            { ok: false, error: `Template "${t.slug}" failed to publish — workflow not published.`, body: r.body },
            { status: 422 },
          );
        }
      }
      // 2) Publish the workflow.
      const r = await publishWorkflow(ws.slug, g.workflow.slug, g.workflow);
      return NextResponse.json({ ok: r.ok, status: r.status, body: r.body, slug: g.workflow.slug });
    }

    return NextResponse.json({ ok: false, error: "mode must be 'generate' or 'publish'." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}

