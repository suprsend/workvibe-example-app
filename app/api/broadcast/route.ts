import { NextResponse } from "next/server";
import { errMsg } from "@/lib/server/http";
import { getActiveWorkspace } from "@/lib/server/workspace";
import { broadcastToList, triggerObjectWorkflow, listTeams } from "@/lib/server/hub";
import { ALL_EMPLOYEES_LIST } from "@/lib/server/users";

// SpaceX uses a clean, API-made template (no editor-bound recipient — that broke
// broadcast email). Uber's all-hands-announcement works, so it stays.
const BROADCAST_TEMPLATE_BY_WS: Record<string, string> = {
  "workvibe-spacex": "company-announcement",
  "workvibe-uber": "all-hands-announcement",
};
const TEAM_WORKFLOW = "team-update";
const CATEGORY = "announcements";

// GET → the audience options (whole company + each team object).
export async function GET() {
  try {
    const ws = await getActiveWorkspace();
    const teams = await listTeams(ws);
    return NextResponse.json({ ok: true, teams });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}

// POST → send a broadcast.
//   { audience: "company" }            → LIST trigger (broadcast to all-employees list)
//   { audience: "team", teamId: "..." } → OBJECT trigger (workflow to a team object's subscribers)
export async function POST(req: Request) {
  try {
    const ws = await getActiveWorkspace();
    const { audience, teamId, headline, message } = await req.json();
    if (!headline?.trim() || !message?.trim()) {
      return NextResponse.json({ ok: false, error: "Headline and message are required." }, { status: 400 });
    }
    const data = { headline, message };

    if (audience === "team") {
      if (!teamId) return NextResponse.json({ ok: false, error: "Pick a team." }, { status: 400 });
      await triggerObjectWorkflow(ws, { workflow: TEAM_WORKFLOW, objectType: "team", objectId: teamId, data });
      return NextResponse.json({ ok: true, via: "object", audience: `team/${teamId}` });
    }

    await broadcastToList(ws, {
      listId: ALL_EMPLOYEES_LIST,
      template: BROADCAST_TEMPLATE_BY_WS[ws.slug] ?? "all-hands-announcement",
      category: CATEGORY,
      channels: ["email", "inbox"],
      data,
    });
    return NextResponse.json({ ok: true, via: "list", audience: ALL_EMPLOYEES_LIST });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}

