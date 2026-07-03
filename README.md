# WorkVibe

A multi-tenant **workplace-notification platform** built on [SuprSend](https://www.suprsend.com). WorkVibe lets an admin author notification **templates** and **workflows** in plain English, deliver them across **email, in-app inbox, and Slack**, manage **per-employee preferences**, and watch **executions** and **analytics** — all isolated per customer workspace.

It doubles as a reference implementation of the SuprSend management API, node SDK, embedded template editor, and React inbox/preference components in a real Next.js App Router app.

> Built with Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, and shadcn/Radix UI.

---

## Features

| Area | What it does |
|---|---|
| **Templates** | AI authors multi-channel content (email, inbox, SMS, WhatsApp, Slack); edit in the embedded SuprSend editor or refine with AI. |
| **Workflows** | Describe a journey in English → AI builds the workflow + its templates, including branching (wait-for-response, conditions), rendered on a canvas. |
| **Executions** | Live message log + grouped per-run view (status, per-channel delivery, resend). |
| **Analytics** | Delivery/open funnel, by-channel and by-template/workflow breakdowns, opt-out metrics. |
| **Preferences** | Workspace defaults + per-employee category/channel preferences, with "required" (non-unsubscribable) categories. |
| **Users** | Live SuprSend subscribers — add/edit/remove, role, preferences, delivery log. |
| **Branding** | Per-workspace tenant brand (logo, colours) applied to emails and the inbox. |
| **Multi-tenant** | Each workspace is its own isolated SuprSend workspace; switch in the top bar. |

---

## Architecture

```
app/
  admin/          Admin surfaces (templates, workflows, executions, analytics, users, …)
  user/           End-user surfaces (inbox, preferences)
  api/            Route handlers — the only place that talks to SuprSend
components/        Client components (one *-client.tsx per surface) + shared UI
lib/
  server/         Server-only SuprSend access (node SDK + management API)
  ai/             AI authoring prompts + SuprSend schema "skills"
  wf/             Workflow canvas derivation
public/wf-engine.js   Canvas rendering engine
```

**Key conventions**

- **Server/client split.** Pages are thin server wrappers that delegate to `*-client.tsx` components. Components import server modules with `import type` only (erased at build) — secrets never reach the browser.
- **Two SuprSend surfaces.** The management API (`management-api.suprsend.com`, templates/workflows) uses the account `ServiceToken`. The hub (`hub.suprsend.com`, users/triggers) uses the per-workspace key+secret via the node SDK.
- **Multi-tenant env keys.** Each workspace's credentials are read from env vars whose prefix is derived from its slug — see [`.env.example`](.env.example).

---

## Getting started

### Prerequisites
- Node.js 20+
- A [SuprSend](https://app.suprsend.com) account (one workspace per tenant)
- An OpenAI API key (for AI authoring)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then fill in .env.local with your SuprSend + OpenAI credentials

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Configuring workspaces

Workspaces are declared in `lib/workspaces.ts`. For each one, add the matching env vars (the prefix is the slug uppercased with dashes → underscores). See [`.env.example`](.env.example) for the full list and the naming convention.

---

## SuprSend API reference

[`BUILD_NOTES.md`](BUILD_NOTES.md) documents the SuprSend endpoints this app uses — templates (v2), workflows (v1), categories, and the hub/node-SDK surface — with verified request shapes and gotchas.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run the unit tests (Vitest) |

---

## License

See [LICENSE](LICENSE).
