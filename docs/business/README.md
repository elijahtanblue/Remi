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
8. **Confluence (optional):** users can run `/doc PROJ-123 handoff` to generate a draft Confluence page from the linked issue context and get the page URL back in Slack
9. **Gmail (optional):** Remi monitors configured Google Workspace mailboxes and sends a Slack DM when an email references a Jira issue key, making it easy to link email threads to issues

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
| `/doc ISSUE-KEY [handoff\|summary\|escalation]` | Creates a draft Confluence page for a linked issue and posts the page URL back in Slack |

Run `/link-ticket` inside the Slack thread you want to link. `/brief` can be run anywhere, and `/doc` works best in the linked thread so Remi can post the page link back into the same conversation.

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

### Step-by-step: creating a Confluence doc

1. Link the issue first with `/link-ticket PROJ-123` in the relevant Slack thread
2. Once the issue is linked, run one of these commands in Slack:
   - `/doc PROJ-123 handoff`
   - `/doc PROJ-123 summary`
   - `/doc PROJ-123 escalation`
3. Remi immediately acknowledges the request, generates the page asynchronously, and creates a draft page in Confluence
4. When the page is ready, Remi posts the Confluence URL back to the same Slack channel (and thread, if you ran the command in-thread)

If Confluence is not connected for your workspace yet, Remi will tell you to ask an admin to configure it first.

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

## Confluence doc generation

Remi's Confluence integration is a write-only documentation flow for V1. It does not read existing Confluence pages back into Remi. Instead, it turns the issue context Remi already knows about into a draft page that your team can review, edit, and share.

### What an admin needs to do once

1. Configure the Atlassian OAuth app credentials in the environment:
   - `CONFLUENCE_CLIENT_ID`
   - `CONFLUENCE_CLIENT_SECRET`
2. Authorise the workspace against Confluence using Remi's admin/API flow
3. Confirm the workspace shows as connected before asking users to run `/doc`

See [SETUP.md — Step 15](SETUP.md#step-15-connect-confluence-optional) for the full setup and OAuth flow.

### What users do day to day

1. Link a Slack thread to a Jira issue with `/link-ticket ISSUE-KEY`
2. Let work happen normally in Slack and Jira
3. Optionally enable Gmail so linked issue emails can also appear in the generated doc context
4. Run `/doc ISSUE-KEY handoff`, `/doc ISSUE-KEY summary`, or `/doc ISSUE-KEY escalation`
5. Open the Confluence link Remi posts back into Slack, then refine the draft for your audience

### What Remi puts into the page

- The Jira issue header: key, title, status, assignee, priority, and department when available
- A timeline of important Jira state changes such as status, assignee, and priority updates
- Key decisions, blockers, and open questions pulled from Remi's newer structured memory observations when available
- Linked Slack threads and participants involved in the work
- Related email threads when Gmail is enabled and email links exist for that issue
- A generated-at footer showing the page was assembled from Slack, Jira, and linked email data

### Supported doc types

- `handoff` is the default and is best for passing work between people or shifts
- `summary` is best for capturing the current state of an issue in a compact format
- `escalation` is best when you need a brief that can be shared upward or cross-functionally

### How Confluence decides where the page goes

By default, Remi creates the page in the Confluence space whose key matches the Jira project prefix. For example, `PROJ-123` is written to the `PROJ` Confluence space unless you later add workspace-level routing.

### What makes this different from a normal meeting note

- It is deterministic: no LLM-generated prose, no hallucinated facts
- It is traceable: content comes from linked Slack threads, Jira events, and linked emails already captured by Remi
- It fits the new feature set: as Remi's memory layer gets richer, the generated Confluence page inherits better structured decisions, blockers, and open questions without changing how users invoke `/doc`

---

## Admin dashboard

The admin dashboard at [admin.memoremi.com](https://admin.memoremi.com) is for operators, not end users. It shows:

- **Workspaces** — every Slack workspace that has installed Remi, with their Jira site
- **Summaries** — full summary history with a re-run button
- **Dead Letters** — failed jobs that need attention, with a retry button
- **Audit Log** — complete record of every action Remi has taken
- **Analytics** — feature usage counts (`link_ticket_used`, `brief_viewed`, etc.) across all workspaces
- **Integrations** — configure Slack, Jira, Gmail, Outlook, and Confluence settings per workspace
- **Memory** — view autonomous memory units and pending writeback proposals per workspace; approve or reject proposals before they are applied to Jira


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
  confluence/     Confluence Cloud REST client, IssueDocContext builder, page renderer
  summary-engine/ Deterministic summary generation
```

---

## Future integrations

The connector architecture (Workspace → `*Install`) is designed to extend to:
- Outlook (email connector — Gmail is already implemented)
- Notion (same doc-generation pattern as Confluence)
- Linear, GitHub Issues
- LLM-based summary rewriting (drop-in replacement for `packages/summary-engine`)
- Role-based permissions
- Atlassian Marketplace listing
