// Server-side resolver for the active workspace. Server Components and (Phase 2)
// API routes read the active workspace here so there is ONE source of truth.
// The Management API uses one account-level Service Token; the workspace is
// selected by URL path. This helper builds those paths.
import "server-only";
import { cookies } from "next/headers";
import { Suprsend } from "@suprsend/node-sdk";
import { DEFAULT_WORKSPACE, getWorkspace, isWorkspaceSlug, type Workspace } from "@/lib/workspaces";

export async function getActiveWorkspace(): Promise<Workspace> {
  const slug = (await cookies()).get("wv_workspace")?.value;
  return getWorkspace(isWorkspaceSlug(slug) ? slug : DEFAULT_WORKSPACE);
}

/** Env-var prefix for a workspace's server credentials. slug "workvibe-uber" → "SUPRSEND_WORKVIBE_UBER". */
export function envPrefix(ws: Workspace): string {
  return `SUPRSEND_${ws.slug.replace(/-/g, "_").toUpperCase()}`;
}

/** Env-var prefix for a workspace's public (browser-exposed) credentials. */
export function publicEnvPrefix(ws: Workspace): string {
  return `NEXT_PUBLIC_SUPRSEND_${ws.slug.replace(/-/g, "_").toUpperCase()}`;
}

/** Node-SDK client for a workspace (hub.suprsend.com) — key + secret from env. */
export function suprsendClient(ws: Workspace) {
  const prefix = envPrefix(ws);
  const key = process.env[`${prefix}_WORKSPACE_KEY`];
  const secret = process.env[`${prefix}_WORKSPACE_SECRET`];
  if (!key || !secret) throw new Error(`Missing workspace key/secret for ${ws.slug}`);
  // SDK defaults to hub.suprsend.com (our SUPRSEND_HOST).
  return new Suprsend(key, secret);
}

export interface WorkspaceSecrets {
  workspaceKey: string;
  signingKeyId: string;
  signingKeyB64: string;
}

/** Per-workspace secrets (workspace key + signing key) for the embedded editor JWT. */
export function getWorkspaceSecrets(ws: Workspace): WorkspaceSecrets {
  const prefix = envPrefix(ws);
  const workspaceKey = process.env[`${prefix}_WORKSPACE_KEY`];
  const signingKeyId = process.env[`${prefix}_SIGNING_KEY_ID`];
  const signingKeyB64 = process.env[`${prefix}_SIGNING_KEY_B64`];
  if (!workspaceKey || !signingKeyId || !signingKeyB64) {
    throw new Error(`Missing signing-key env for ${ws.slug}`);
  }
  return { workspaceKey, signingKeyId, signingKeyB64 };
}
