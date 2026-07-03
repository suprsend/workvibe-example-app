// Live employees = SuprSend subscribers (the Users tab). Backed entirely by the
// hub user API via the node SDK — list / get / add (upsert) / remove (delete).
// Role + name live in user `properties`; email is the `$email` channel.
import "server-only";
import type { Workspace } from "@/lib/workspaces";
import { suprsendClient as client, envPrefix } from "@/lib/server/workspace";

// A Slack identity for the $slack channel. Either an incoming webhook (one fixed
// channel — simplest for a demo) or a bot token + channel/user id (DMs).
export type SlackIdentity =
  | { incoming_webhook: { url: string } }
  | { bot_token: string; channel: string };

// The workspace's Slack incoming webhook (one channel for everyone). Set per
// workspace in env — we auto-attach it to every employee, so Slack delivery +
// the Slack preference toggle work without anyone pasting a URL per employee.
export function getWorkspaceSlackWebhook(ws: Workspace): SlackIdentity | null {
  const prefix = envPrefix(ws);
  const url = process.env[`${prefix}_SLACK_WEBHOOK`];
  return url ? { incoming_webhook: { url } } : null;
}

// Event emitted when a new employee is added. An event-triggered workflow
// (`event-employee-onboarding`, trigger_type:"event") listens for it and fires
// onboarding automatically — no manual Send test. SuprSend upper-cases the name.
export const ONBOARDING_EVENT = "employee_onboarded";

// A static list every employee joins on creation. Powers list-based delivery:
// broadcasts (one template to the whole company) and list-entry triggers.
export const ALL_EMPLOYEES_LIST = "all-employees";

/** Add a user to the all-employees list (idempotent). Best-effort. */
export async function addToAllEmployeesList(ws: Workspace, distinctId: string) {
  return client(ws).subscriber_lists.add(ALL_EMPLOYEES_LIST, [distinctId]);
}

export interface WorkUser {
  distinctId: string;
  name: string;
  email: string | null;
  role: string | null;
  hasInbox: boolean;
  hasSlack: boolean;
  createdAt: string | null;
}

interface RawUser {
  distinct_id: string;
  properties?: { name?: string; role?: string };
  $email?: { value?: string }[];
  $inbox?: unknown[];
  $slack?: unknown[];
  created_at?: string;
}

function shape(u: RawUser): WorkUser {
  return {
    distinctId: u.distinct_id,
    name: u.properties?.name ?? u.distinct_id,
    email: u.$email?.[0]?.value ?? null,
    role: u.properties?.role ?? null,
    hasInbox: Array.isArray(u.$inbox) && u.$inbox.length > 0,
    hasSlack: Array.isArray(u.$slack) && u.$slack.length > 0,
    createdAt: u.created_at ?? null,
  };
}

export async function listUsers(ws: Workspace): Promise<WorkUser[]> {
  const res = (await client(ws).users.list({ limit: 100 })) as { results?: RawUser[] };
  return (res.results ?? [])
    .map(shape)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getUser(ws: Workspace, distinctId: string): Promise<WorkUser | null> {
  try {
    const u = (await client(ws).users.get(distinctId)) as RawUser;
    return u?.distinct_id ? shape(u) : null;
  } catch {
    return null;
  }
}

/** Add or update an employee: sets email + name + role (+ optional Slack identity). */
export async function upsertUser(
  ws: Workspace,
  distinctId: string,
  data: { name?: string; email?: string; role?: string; slack?: SlackIdentity },
) {
  const c = client(ws);
  const edit = c.users.get_edit_instance(distinctId);
  if (data.email) edit.add_email(data.email);
  if (data.slack) edit.add_slack(data.slack);
  const props: Record<string, string> = {};
  if (data.name) props.name = data.name;
  if (data.role) props.role = data.role;
  if (Object.keys(props).length) edit.set(props);
  return c.users.edit(edit);
}

export async function removeUser(ws: Workspace, distinctId: string) {
  return client(ws).users.delete(distinctId);
}

// What an employee is subscribed to: team objects + subscriber lists. Surfaced in
// the Users tab so the object/list (subscription) model is visible in the app.
export interface UserSubscriptions {
  teams: { id: string; type: string; name: string }[];
  lists: { id: string; name: string }[];
}

export async function getUserSubscriptions(ws: Workspace, distinctId: string): Promise<UserSubscriptions> {
  const c = client(ws);
  type ObjRes = { results?: { object?: { id?: string; object_type?: string; properties?: { name?: string } } }[] };
  type ListRes = { results?: { list?: { list_id?: string; list_name?: string } }[] };
  const [objs, lists] = await Promise.all([
    c.users.get_objects_subscribed_to(distinctId).catch(() => ({ results: [] }) as ObjRes) as Promise<ObjRes>,
    c.users.get_lists_subscribed_to(distinctId).catch(() => ({ results: [] }) as ListRes) as Promise<ListRes>,
  ]);
  return {
    teams: (objs.results ?? []).map((r) => ({
      id: r.object?.id ?? "",
      type: r.object?.object_type ?? "team",
      name: r.object?.properties?.name ?? r.object?.id ?? "",
    })).filter((t) => t.id),
    lists: (lists.results ?? []).map((r) => ({
      id: r.list?.list_id ?? "",
      name: r.list?.list_name ?? r.list?.list_id ?? "",
    })).filter((l) => l.id),
  };
}
