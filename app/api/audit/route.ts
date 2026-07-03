import { NextResponse } from "next/server";
import { errMsg } from "@/lib/server/http";
import { getActiveWorkspace } from "@/lib/server/workspace";
import { listAuditEvents } from "@/lib/server/audit";

export async function GET() {
  try {
    const ws = await getActiveWorkspace();
    const events = await listAuditEvents(ws.slug);
    return NextResponse.json({ ok: true, events });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errMsg(e) }, { status: 500 });
  }
}
