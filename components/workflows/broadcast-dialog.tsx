"use client";

import * as React from "react";
import { toast } from "sonner";
import { Megaphone, Users, Building2 } from "lucide-react";
import { useWorkspace } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

interface Team { id: string; name: string; subscribers: number }

// Broadcast = the LIST and OBJECT trigger types, in one place:
//   • Whole company → broadcast a template to the all-employees LIST.
//   • A team        → trigger a workflow to a team OBJECT's subscribers.
export function BroadcastDialog() {
  const { workspace } = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [audience, setAudience] = React.useState<string>("company"); // "company" | team id
  const [headline, setHeadline] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    fetch("/api/broadcast", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTeams(d.teams ?? []); })
      .catch(() => {});
  }, [open, workspace]);

  async function send() {
    setBusy(true);
    try {
      const body = audience === "company"
        ? { audience: "company", headline, message }
        : { audience: "team", teamId: audience, headline, message };
      const res = await fetch("/api/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.via === "list" ? "Broadcast sent to all employees" : `Sent to ${data.audience}`, {
          description: data.via === "list" ? "List trigger — one message to the whole company list." : "Object trigger — fanned out to the team's subscribers.",
        });
        setOpen(false);
        setHeadline("");
        setMessage("");
      } else {
        toast.error("Couldn’t send", { description: data.error });
      }
    } finally {
      setBusy(false);
    }
  }

  const viaLabel = audience === "company" ? "List trigger" : "Object trigger";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setAudience("company"); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Megaphone className="size-4" /> Broadcast
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Broadcast an announcement</DialogTitle>
          <DialogDescription>
            One message to a group — no per-user send. Sent via SuprSend’s <strong>{viaLabel}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm text-muted-foreground">Audience</span>
            <div className="flex flex-wrap gap-2">
              <AudienceChip
                active={audience === "company"}
                icon={Building2}
                label="Whole company"
                sub="all-employees list"
                onClick={() => setAudience("company")}
              />
              {teams.map((t) => (
                <AudienceChip
                  key={t.id}
                  active={audience === t.id}
                  icon={Users}
                  label={t.name}
                  sub={`team · ${t.subscribers} member${t.subscribers === 1 ? "" : "s"}`}
                  onClick={() => setAudience(t.id)}
                />
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Headline</span>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="All-hands this Friday" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Message</span>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Join us in the main hall at 3pm for the quarterly all-hands." rows={3} />
          </label>

          <p className="text-xs text-muted-foreground">
            {audience === "company"
              ? "Broadcasts the all-hands template to everyone on the all-employees list in one request. Per-user preferences still apply."
              : "Triggers the Team Update workflow with a team object as the recipient — SuprSend fans it out to that team’s subscribers."}
          </p>
        </div>

        <DialogFooter>
          <Badge variant="secondary" className="mr-auto self-center">{viaLabel}</Badge>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy || !headline.trim() || !message.trim()}>
            {busy ? "Sending…" : "Send broadcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AudienceChip({ active, icon: Icon, label, sub, onClick }: { active: boolean; icon: typeof Users; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
    >
      <Icon className={`mt-0.5 size-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
