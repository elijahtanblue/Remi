# Remi

Remi is your team's operational memory. It links Slack threads to Jira issues, tracks what's happening across both, and surfaces clear summaries so nothing gets lost in handoffs.

> Like the rat chef — working behind the scenes so your team stays coordinated.

- **Live API:** https://api.memoremi.com
- **Admin dashboard:** https://admin.memoremi.com
- **Setup & deployment guide:** [SETUP.md](SETUP.md)
- **Deployment log & troubleshooting:** [DEPLOYMENT_LOG.md](DEPLOYMENT_LOG.md)

---

## How it works

1. A user installs Remi to their Slack workspace via the Add to Slack button
2. They connect their Jira site by following the setup instructions sent to their Slack DMs
3. A user runs `/link-ticket PROJ-123` inside a Slack thread to link it to a Jira issue
4. Remi backfills history from both Slack and Jira, then generates a summary
5. Any new messages in the thread or changes to the Jira issue automatically regenerate the summary
6. Summaries surface in `/brief` in Slack, the Slack App Home, and a panel in the Jira issue sidebar
7. Summaries are deterministic — no LLM, no API cost, fully auditable
8. **Gmail (optional):** Remi monitors configured Google Workspace mailboxes and sends a Slack DM when an email references a Jira issue key, making it easy to link email threads to issues

---

## Installing Remi

### Step 1 — Add Remi to Slack

Click the button below (or navigate to the URL directly):

**[Add to Slack →](https://api.memoremi.com/slack/install)**

This takes you to Slack's OAuth authorization page. Review the permissions and click **Allow**.

After approving, you will be redirected to a confirmation page and Remi will send you a direct message in Slack with instructions for the next step.

### Step 2 — Connect Jira

After the Slack install, Remi sends you a DM containing a **Jira descriptor URL** unique to your workspace. To connect Jira:

1. In Jira, go to **Apps → Manage your apps**
2. Click **Upload app** (or **Install a private app** if on an older Jira version)
3. Paste the descriptor URL from your Slack DM and click **Upload**
4. Jira will confirm the app is installed

Once installed, the **Remi Summary** panel will appear on any Jira issue you link.

> **Note:** Atlassian ended new Connect app installs via descriptor URL on March 31, 2026. If your Jira tenant does not support this, contact Remi support for alternatives.

### That's it

Both integrations are now live. Head to any Slack thread and run `/link-ticket PROJ-123` to link your first issue.

---

## User guide

### Slash commands

| Command | What it does |
|---|---|
| `/link-ticket ISSUE-KEY` | Links the current Slack thread to a Jira issue (e.g. `/link-ticket PROJ-123`) |
| `/brief ISSUE-KEY` | Posts the current summary for that issue in Slack |
| `/brief ISSUE-KEY --refresh` | Forces a summary regeneration before posting |

Run these commands **inside the Slack thread** you want to link — not in a DM or unrelated channel.

---

### Step-by-step: linking a thread

1. Go to the Slack thread where your team is discussing a Jira issue
2. In that thread, type `/link-ticket PROJ-123` (replace `PROJ-123` with your actual issue key)
3. Remi confirms the link and backfills history from both Slack and Jira
4. From now on, any new messages in that thread or changes to the Jira issue will automatically update the summary

---

### Step-by-step: getting a summary

**In Slack:**
- Type `/brief PROJ-123` anywhere in your workspace to see the latest summary posted as a message

**In Jira:**
- Open any linked issue — look for the **Remi Summary** panel in the right sidebar
- The panel shows: current summary, linked thread count, completeness score, and recommended next step

**In Slack App Home:**
- Click on the Remi app in your Slack sidebar → App Home tab
- See an overview of all linked issues and their latest summaries

---

### What triggers a summary update

Remi regenerates the summary automatically when any of these happen:

- A new message is posted in a linked Slack thread
- The Jira issue status changes (e.g. In Progress → Done)
- The Jira issue assignee changes
- The Jira issue priority changes
- A comment is added or updated on the Jira issue
- You run `/brief ISSUE-KEY --refresh` to force a regeneration

---

### What the summary contains

Each summary includes:

- **Headline** — one sentence describing current state
- **Key points** — bullet list of what's happened and what matters
- **Blockers** — any blocking issues detected from keywords in Slack/Jira
- **Open questions** — unanswered questions from the thread
- **Ownership** — who is assigned and who has been most active
- **Completeness score** — 0–100, how well-documented this issue is
- **Recommended next step** — what Remi thinks should happen next

---

### Message shortcut: attach a thread

You can also link a thread using the Slack message shortcut (no typing required):

1. Hover over any message in a thread
2. Click the **⋯ More actions** button
3. Select **Attach to Jira issue**
4. Enter the issue key in the modal

---

## Gmail integration

Remi can monitor Google Workspace email addresses (e.g. `support@yourcompany.com`) and detect when emails reference Jira issue keys. When found, Remi sends the workspace installer a Slack DM suggesting they link the email thread.

**What you need:**
- A Google Workspace domain (not personal Gmail)
- A Google service account with domain-wide delegation
- `gmail.readonly` scope granted in Google Workspace Admin Console

**Quick setup:**

```bash
curl -X POST https://api.memoremi.com/admin/gmail/configure \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID",
    "serviceAccountJson": "<contents of service account JSON>",
    "domain": "yourcompany.com",
    "monitoredEmails": ["support@yourcompany.com"]
  }'
```

Then set `GMAIL_SYNC_ENABLED=true` in your environment and restart the worker.

See [SETUP.md — Step 14](SETUP.md#step-14-enable-gmail-integration-optional) for the full step-by-step guide including Google Cloud Console and Workspace Admin setup.

---

## Admin dashboard

The admin dashboard at [admin.memoremi.com](https://admin.memoremi.com) is for operators, not end users. It shows:

- **Workspaces** — every Slack workspace that has installed Remi, with their Jira site
- **Summaries** — full summary history with completeness scores and a re-run button
- **Dead Letters** — failed jobs that need attention, with a retry button
- **Audit Log** — complete record of every action Remi has taken
- **Analytics** — feature usage counts (link_ticket_used, brief_viewed, etc.) across all workspaces
- **Integrations** — configure Gmail for a workspace

Access requires the `ADMIN_API_KEY` set in your environment.

---

## Summary engine

Summaries are generated by `packages/summary-engine` — purely rules-based, no LLM required.

The engine:
1. Collects current issue state + all events from Postgres
2. Collects all messages from linked Slack threads
3. Runs analysers: status drift, blocker detection (keyword scan), open question detection, ownership analysis
4. Scores completeness (0–100) and picks a recommended next step
5. Persists the typed output as a new `Summary` row, superseding the previous version

No external API calls. No hallucination risk. Every summary is regeneratable from raw data.

---

## Monorepo structure

```
apps/
  api/        Fastify API server (Slack + Jira webhooks, OAuth, admin routes)
  worker/     SQS consumer for async processing
  admin/      Next.js ops dashboard

packages/
  shared/         Types, schemas, constants, errors
  db/             Prisma schema + client + repositories
  queue/          Queue abstraction (SQS in prod, in-memory in dev)
  storage/        Storage abstraction (S3 in prod, local files in dev)
  slack/          Slack Bolt handlers, commands, views, OAuth
  jira/           Jira Connect auth, REST client, webhook parser, panel
  gmail/          Gmail sync client, issue key detection, Slack DM notifications
  summary-engine/ Deterministic summary generation
```

---

## Future integrations

The connector architecture (Workspace → `*Install`) is designed to extend to:
- Outlook (email connector — Gmail is already implemented)
- Confluence / Notion (docs)
- Linear, GitHub Issues
- LLM-based summary rewriting (drop-in replacement for `packages/summary-engine`)
- Role-based permissions
- Atlassian Marketplace listing
