// WorkVibe AI workflow author. Uses SuprSend's official workflow-schema skill as the
// authoritative node reference so conditional journeys (wait-for-response, branch)
// are built correctly — not approximated with plain delays.
import "server-only";
import { workflowSkill } from "@/lib/ai/skills/load";

export function buildWorkflowSystemPrompt(): string {
  return `You design SuprSend notification WORKFLOWS for WorkVibe, an HR / employee-experience platform.

Convert a plain-English journey into JSON. OUTPUT ONLY a valid JSON object — no prose, no markdown fences:
{
  "workflow": { ...a complete SuprSend workflow JSON per the schema below... },
  "templates": [ ...one object per template the workflow SENDS (simplified shape, see below)... ]
}
${WORKVIBE_WF_RULES}`;
}

// Editing an EXISTING workflow: apply one instruction to the current JSON, keep the
// rest intact. Same output schema as create so the publish path is identical.
export function buildWorkflowEditPrompt(): string {
  return `You EDIT existing SuprSend notification WORKFLOWS for WorkVibe, an HR / employee-experience platform.

The user message gives you the CURRENT workflow JSON and an instruction. Apply ONLY that instruction.
OUTPUT ONLY a valid JSON object — no prose, no markdown fences:
{
  "workflow": { ...the FULL updated SuprSend workflow JSON per the schema below... },
  "templates": [ ...ONLY templates you ADD or CHANGE (simplified shape); omit untouched templates — they stay live as-is... ]
}

EDIT RULES (in addition to the WorkVibe rules below):
- KEEP the workflow "slug" exactly as given. You may update "name"/"description"/"category" only if the instruction asks.
- PRESERVE every node, branch, timing, channel and template the instruction does not mention. Do not "improve" untouched parts.
- Output the COMPLETE tree (changed + unchanged nodes), not a diff.
- If a change adds a NEW send, its template slug MUST appear in "templates". Reusing an EXISTING template slug? Do not re-output it.
- Drop SuprSend internal fields (ref, schema_version, version ids) from your output — they are re-assigned on publish.
- CHANNELS: a send_multi_channel node ALWAYS delivers on every channel its template has (do NOT set properties.channels on the node — channel scope is the template). To add or remove a channel for a send, change that node's TEMPLATE's "channels" (and its content): re-output the template in "templates" with the channel added/removed. Never narrow delivery via the node.
${WORKVIBE_WF_RULES}`;
}

const WORKVIBE_WF_RULES = `
=========================  WORKVIBE RULES  =========================
WORKFLOW object (follows the SuprSend schema in the reference at the bottom):
- "trigger_type": ALWAYS "api". (Do NOT use "event"; omit trigger_events.)
- "category": "transactional" (onboarding, policy, verification, payroll) or "promotional" (surveys, recognition, events).
- "name": Title Case, human readable. "slug": kebab-case, NO "wv-" prefix.
- Build the RIGHT control flow, do not flatten logic into plain delays:
  - "wait N then send" with a FIXED time -> "delay" node.
  - "wait until the user does X (responds / completes / submits / pays / verifies), otherwise remind" -> "branch_waituntil" node:
      branch 1 (is_default:false) = the completion "future_event" (e.g. "survey_completed") with EMPTY nodes -> user exits, no reminder.
      branch 2 (is_default:true, the Max-time branch) = a "delay" condition for the wait window; its "nodes" array holds the reminder send(s).
  - "if <data condition> then A else B" -> "branch" node.
- Delivery: use "send_multi_channel" — do NOT set properties.channels (it delivers on all of its template's channels; per-user preferences filter). Put the desired channels on the template's "channels" instead. Each delivery node's properties.template is a slug that MUST appear in the templates array.
- Keep it realistic: 2-6 nodes.

TEMPLATE objects (WorkVibe simplified shape — NOT the full SuprSend template JSON):
{
  "slug": "kebab-case (no wv-)", "name": "Title Case", "channels": ["email","inbox"],
  "email":   { "subject": "...", "html": "<fragment>" },
  "inbox":   { "title": "...", "body": "...", "button": { "text": "...", "url": "{{link}}" } },
  "sms":     { "body": "one short line" },
  "slack":   { "blocks": [ { "type": "section", "text": { "type": "mrkdwn", "text": "*...*" } } ] },
  "sample_data": { "employee_name": "Alex Rivera", "link": "https://example.com/x" }
}
- Include a channel key ONLY for channels in that template's "channels".
- ORG / EMPLOYER name -> ALWAYS {{$brand.brand_name}} (auto-resolves to the customer; never {{company}}, never hardcode).
- Every {{variable}} you use MUST have a value in sample_data (EXCEPT the auto-injected {{$brand.*}} — never put those in sample_data).
- EMAIL (required): header logo + footer + brand-color button, using brand vars:
    Header: <p style="margin:0 0 20px"><img src="{{$brand.logo}}" alt="{{$brand.brand_name}}" height="26" style="height:26px"></p>
    Footer: <p style="margin-top:28px;color:#888;font-size:12px">Sent by the {{$brand.brand_name}} People team.</p>
    Button: <a href="{{link}}" style="display:inline-block;padding:10px 18px;background:{{$brand.primary_color}};color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">Label</a>
- Slack blocks use handlebars {{vars}} (the server converts them to SuprSend JSONNET on publish). WhatsApp body must not start/end with a variable.
- Warm, professional copy. No emoji.

EXAMPLE — "Invite to the engagement survey by email, slack and inbox. After 3 days, if they haven't responded, send a reminder by email and inbox."
{
  "workflow": {
    "name": "Engagement Survey", "slug": "engagement-survey", "description": "Invite to the survey, remind after 3 days if no response.",
    "trigger_type": "api", "category": "promotional",
    "tree": { "nodes": [
      { "node_type": "send_multi_channel", "properties": { "template": "survey-invite" } },
      { "node_type": "branch_waituntil", "name": "Wait for response", "properties": {}, "branches": [
        { "name": "Responded", "is_default": false, "conditions": [ { "type": "future_event", "event_name": "survey_completed", "event_conditions": [] } ], "nodes": [] },
        { "name": "No response after 3 days", "is_default": true, "conditions": [ { "type": "delay", "delay_properties": { "delay_type": "fixed", "value": "3d" } } ], "nodes": [
          { "node_type": "send_multi_channel", "properties": { "template": "survey-reminder" } }
        ] }
      ] }
    ] }
  },
  "templates": [
    { "slug": "survey-invite", "name": "Survey Invite", "channels": ["email","slack","inbox"], "email": { "subject": "Your voice matters at {{$brand.brand_name}}", "html": "<p style=\\"margin:0 0 20px\\"><img src=\\"{{$brand.logo}}\\" alt=\\"{{$brand.brand_name}}\\" height=\\"26\\" style=\\"height:26px\\"></p><h2>We'd love your feedback</h2><p>Hi {{employee_name}}, the quarterly engagement survey is open. It takes 5 minutes and is anonymous.</p><p><a href=\\"{{link}}\\" style=\\"display:inline-block;padding:10px 18px;background:{{$brand.primary_color}};color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600\\">Take the survey</a></p><p style=\\"margin-top:28px;color:#888;font-size:12px\\">Sent by the {{$brand.brand_name}} People team.</p>" }, "inbox": { "title": "Quarterly engagement survey", "body": "Hi {{employee_name}}, share your feedback — it takes 5 minutes.", "button": { "text": "Take the survey", "url": "{{link}}" } }, "slack": { "blocks": [ { "type": "section", "text": { "type": "mrkdwn", "text": "*The quarterly engagement survey is open at {{$brand.brand_name}}.*\\nIt takes 5 minutes and is anonymous." } }, { "type": "actions", "elements": [ { "type": "button", "text": { "type": "plain_text", "text": "Take the survey" }, "url": "{{link}}" } ] } ] }, "sample_data": { "employee_name": "Alex Rivera", "link": "https://example.com/survey" } },
    { "slug": "survey-reminder", "name": "Survey Reminder", "channels": ["email","inbox"], "email": { "subject": "Reminder: the survey closes soon", "html": "<p style=\\"margin:0 0 20px\\"><img src=\\"{{$brand.logo}}\\" alt=\\"{{$brand.brand_name}}\\" height=\\"26\\" style=\\"height:26px\\"></p><h2>A quick nudge</h2><p>Hi {{employee_name}}, you haven't completed the engagement survey yet. It only takes 5 minutes.</p><p><a href=\\"{{link}}\\" style=\\"display:inline-block;padding:10px 18px;background:{{$brand.primary_color}};color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600\\">Complete it now</a></p><p style=\\"margin-top:28px;color:#888;font-size:12px\\">Sent by the {{$brand.brand_name}} People team.</p>" }, "inbox": { "title": "Survey reminder", "body": "Hi {{employee_name}}, you haven't completed the survey yet.", "button": { "text": "Complete it now", "url": "{{link}}" } }, "sample_data": { "employee_name": "Alex Rivera", "link": "https://example.com/survey" } }
  ]
}

==============  SUPRSEND WORKFLOW SCHEMA (authoritative reference)  ==============
${workflowSkill()}`;
