# Remi Architecture and Infrastructure Reference

Generated from a repo scan on 2026-04-07.

This file is intended as a private developer/operator reference. It is gitignored on purpose. It documents how the application is built, what depends on what, what is hosted where, and which external systems must be configured. Secrets are intentionally omitted.

## 1. What this product is

Remi is a Slack-first operational memory system for teams that work across Slack, Jira, and optionally Gmail. The core product behavior is:

- A Slack thread is linked to a Jira issue.
- Slack thread history and Jira issue history are backfilled into Postgres.
- A deterministic summary is generated from the stored issue/thread data.
- The summary can be viewed in Slack, in the Slack App Home, in the Jira issue sidebar, and in the admin UI.
- An optional "Autonomous Memory" pipeline uses Gemini + OpenAI to extract structured observations, synthesize memory snapshots, and optionally propose Jira write-backs that must be approved from the admin UI.
- An optional Gmail integration watches selected Google Workspace mailboxes and nudges Slack users when an email references a known Jira issue key.

This repo also contains a standalone marketing website under `website/`.

## 2. System at a glance

```text
Slack users
  -> Slack OAuth / events / commands / interactions
  -> apps/api (/slack/*)
  -> queue adapter (memory in dev, SQS in prod-like setups)
  -> apps/worker
  -> Postgres (workspace, threads, messages, issues, links, summaries, audit, dead letters)
  -> surfaced back to Slack (/brief, App Home)

Jira users
  -> Jira Connect install + webhooks + issue panel
  -> apps/api (/jira/*)
  -> queue adapter
  -> apps/worker
  -> Postgres
  -> surfaced back to Jira issue panel

Gmail (optional)
  -> worker polls Gmail API using service account domain-wide delegation
  -> stores email threads/messages in Postgres
  -> auto-detects Jira issue keys
  -> sends Slack DM suggestions

Admin users
  -> apps/admin (Next.js)
  -> server-side fetches to apps/api /admin/*
  -> Postgres + queues + memory actions

Marketing visitors
  -> website (standalone Next.js app)
  -> optional Formspree endpoint for contact form

CI/CD
  -> GitHub Actions
  -> GHCR images
  -> EC2 host via Docker Compose
  -> Caddy reverse proxy
```

## 3. Repo layout

### Top-level

- `apps/` contains the runtime applications.
- `packages/` contains shared libraries and domain modules.
- `tests/` contains Vitest coverage across admin, db, email, gmail, jira, memory, queue, shared, and summary-engine.
- `docs/` contains setup, deployment, business, design, and planning docs.
- `website/` is a standalone marketing site and is not part of the PNPM workspace build graph.

### Runtime apps

- `apps/api`
  - Fastify API.
  - Owns health/readiness routes, Slack routes, Jira routes, and admin routes.
  - Builds the queue adapter and enqueues background work.
  - Listens on port `3000`.

- `apps/worker`
  - Background consumer.
  - Polls the configured queue(s).
  - Processes Slack events, Jira events, summary jobs, backfill jobs, and memory jobs.
  - Also runs periodic Gmail sync when enabled.

- `apps/admin`
  - Next.js 15 admin dashboard.
  - Provides ops views for workspaces, summaries, dead letters, analytics, integrations UI, and memory controls.
  - Uses its own Next.js route handlers as a thin proxy to the API's `/admin/*` routes.
  - Runs as a standalone Next.js server in Docker.
  - Inside the container it serves on `3000`; host mapping is `3001:3000`.

- `website`
  - Standalone Next.js marketing site.
  - Own `package.json`, own lockfile, own `vercel.json`, own Dockerfile.
  - Not wired into `pnpm-workspace.yaml`.
  - No direct dependency on the API except an optional contact form endpoint via `NEXT_PUBLIC_FORMSPREE_ACTION`.

### Core packages

- `packages/shared`
  - Shared types, constants, schemas, errors, and utility helpers.
  - Defines queue names, trigger reasons, Slack/Jira payload schemas, and email/integration types.

- `packages/db`
  - Prisma schema, Prisma client, seed, and repository functions.
  - The central data layer for every runtime app.

- `packages/queue`
  - Queue abstraction.
  - Two implementations:
    - `MemoryQueueAdapter` for local/dev/test style execution.
    - `SqsQueueAdapter` for AWS SQS FIFO queues.

- `packages/slack`
  - Slack Bolt app construction.
  - Slash commands, shortcut handlers, message event handling, App Home publishing, and workspace resolution middleware.

- `packages/jira`
  - Jira Connect descriptor generation.
  - Lifecycle install/uninstall handlers.
  - JWT auth helpers.
  - Jira REST client.
  - Webhook parsing/validation.
  - Jira issue panel renderer.

- `packages/gmail`
  - Gmail API client built on a service-account JWT.
  - Polling/sync logic.
  - Issue-key detection.
  - Slack DM suggestion flow.

- `packages/summary-engine`
  - Deterministic summary generation.
  - No LLM calls.
  - Analyzes issue history + linked Slack thread content.

- `packages/memory-engine`
  - Optional AI pipeline for structured memory extraction/snapshot/writeback.
  - Uses Gemini for extraction and OpenAI for later stages.

- `packages/storage`
  - Local and S3 storage adapters.
  - Present in the repo, but not meaningfully wired into the current event handlers.

- `packages/email`
  - Email-side policy/types/logic library.
  - Primarily used by tests and admin-side modeling right now, not by the live Gmail ingest path.

## 4. Data model and tenancy

The application is workspace-scoped and multi-tenant at the row level.

### Tenancy model

- `Workspace` is the root tenant entity.
- Every major business/operational table hangs off `workspaceId`.
- This is single-schema, shared-database multi-tenancy, not schema-per-tenant.

### Important Prisma models

From `packages/db/prisma/schema.prisma`:

- Workspace and installs
  - `Workspace`
  - `SlackWorkspaceInstall`
  - `JiraWorkspaceInstall`
  - `GmailWorkspaceInstall`

- Identity/user mapping
  - `User`
  - `SlackUser`
  - `JiraUser`
  - `UserCrosswalk`

- Jira issue state
  - `Issue`
  - `IssueEvent`

- Slack state
  - `SlackThread`
  - `SlackMessage`
  - `IssueThreadLink`

- Gmail/email state
  - `EmailThread`
  - `EmailMessage`
  - `IssueEmailLink`

- Summaries
  - `Summary`
  - `SummaryRun`

- Operational tables
  - `AuditLog`
  - `QueueDeadLetter`
  - `ProductEvent`

- Autonomous memory
  - `WorkspaceMemoryConfig`
  - `MemoryUnit`
  - `MemoryObservation`
  - `MemorySnapshot`
  - `MemoryWritebackProposal`

### What is actually persisted

- Slack messages, Jira issue state, Jira webhook/changelog events, Gmail message metadata, links, summaries, audit events, and dead letters are all persisted in Postgres.
- The schema includes `rawPayload` JSON columns in several tables.
- The schema also includes `s3PayloadKey` columns, but the current handlers do not populate them.
- Result: raw payload data is primarily living in Postgres today, not in S3.

## 5. Primary runtime flows

### 5.1 Slack install and usage flow

Files to know:

- `apps/api/src/routes/slack/index.ts`
- `packages/slack/src/commands/link-ticket.ts`
- `packages/slack/src/commands/brief.ts`
- `packages/slack/src/events/message.ts`
- `packages/slack/src/views/app-home.ts`
- `packages/slack/src/middleware/workspace-resolver.ts`

Flow:

1. Slack install begins at `GET /slack/install`.
2. Slack redirects back to `GET /slack/oauth_redirect`.
3. The API exchanges the code for a bot token.
4. The API creates or reuses a `Workspace`.
5. The API upserts `SlackWorkspaceInstall`.
6. The API sends a welcome DM with a Jira install link that includes `workspaceId`.
7. From Slack, a user links an issue with `/link-ticket ISSUE-KEY` or the message shortcut.
8. Linking creates/upserts:
   - `SlackThread`
   - placeholder `Issue`
   - `IssueThreadLink`
9. Linking enqueues two backfill jobs:
   - Jira issue backfill
   - Slack thread backfill
10. Once backfill completes, summaries are generated and later refreshed when new linked Slack replies arrive.

Important details:

- Workspace resolution is done from Slack `teamId` via `slackWorkspaceInstall`.
- HTTP mode uses per-workspace token lookup.
- Socket Mode is supported for local/dev but is not the intended production mode.
- Slash commands and interactions are signature-verified manually in the Fastify route layer.

### 5.2 Jira install/webhook/panel flow

Files to know:

- `apps/api/src/routes/jira/index.ts`
- `packages/jira/src/connect/descriptor.ts`
- `packages/jira/src/connect/lifecycle.ts`
- `packages/jira/src/client.ts`
- `packages/jira/src/auth.ts`

Flow:

1. Slack welcome DM points the installer to `/jira/install?workspaceId=<workspaceId>`.
2. That page shows the Atlassian Connect descriptor URL.
3. Jira fetches `/jira/atlassian-connect.json?workspaceId=<workspaceId>`.
4. Jira calls the installed lifecycle callback.
5. The API stores `jiraClientKey`, `jiraSiteUrl`, and `sharedSecret` in `JiraWorkspaceInstall`.
6. Jira webhooks hit `POST /jira/webhooks`.
7. The API validates/parses the payload and enqueues a `jira_event` message.
8. The worker resolves the workspace from `jiraClientKey`, upserts the issue, stores `IssueEvent`, and may enqueue a summary job.
9. Jira loads the Remi issue panel from `GET /jira/panel/:issueKey?jwt=...`.
10. The panel renders the current summary plus linked thread count.

Important details:

- The Connect app key is `remi-memory`.
- Jira auth for outbound API calls is JWT signed with the install's `sharedSecret`.
- The repo uses Jira Connect, not Forge.
- Repo docs note that Atlassian ended new Connect descriptor installs on 2026-03-31, so this flow is operationally risky now and may only work in development/private-install scenarios.

### 5.3 Summary generation flow

Files to know:

- `apps/worker/src/handlers/summary-jobs.ts`
- `packages/summary-engine/src/engine.ts`
- `packages/summary-engine/src/triggers.ts`

Flow:

1. A Slack event, Jira event, backfill completion, or manual rerun enqueues a `summary_job`.
2. The worker calls `generateSummary`.
3. The summary engine:
   - collects issue state and issue events
   - collects linked Slack thread data
   - computes an input hash
   - skips regeneration if the hash is unchanged (unless forced)
   - runs analyzers for status drift, blockers, open questions, ownership, completeness
   - formats a `SummaryOutput`
4. The new summary is stored in `Summary`.
5. The worker records:
   - `AuditLog` action `summary.generated`
   - `ProductEvent` `summary_generated`

Important details:

- This path is rules-based and deterministic.
- No LLM/API call is required for the normal summary engine.
- This is the stable, default system of record for summaries.

### 5.4 Gmail optional flow

Files to know:

- `packages/gmail/src/client.ts`
- `packages/gmail/src/sync.ts`
- `packages/gmail/src/slack-dm.ts`
- `apps/api/src/routes/admin/index.ts` (`/admin/gmail/*`)

Flow:

1. Gmail config is stored via `POST /admin/gmail/configure`.
2. The service account JSON, domain, and monitored mailbox list are stored in `GmailWorkspaceInstall`.
3. The worker periodically calls `syncAllGmailWorkspaces()` (startup + every 5 minutes).
4. Each mailbox is read via Gmail API using service account domain-wide delegation and `gmail.readonly`.
5. Emails are stored as `EmailThread` and `EmailMessage`.
6. Issue keys are detected from subject/snippet text.
7. If an issue key matches an existing issue for the workspace:
   - an `IssueEmailLink` is created
   - internal participants may get a Slack DM suggestion
8. If memory is enabled, email content can also feed the memory pipeline.

Important details:

- This is Google Workspace only, not personal Gmail.
- The worker stores per-mailbox `historyId` state for incremental sync.
- If `GMAIL_SYNC_ENABLED` is not set, worker code defaults it to `true`.

### 5.5 Autonomous Memory flow

Files to know:

- `apps/api/src/routes/admin/memory.ts`
- `apps/worker/src/handlers/memory-jobs.ts`
- `packages/memory-engine/src/pipeline/run.ts`
- `packages/memory-engine/src/clients/gemini.ts`
- `packages/memory-engine/src/clients/openai.ts`

Stages:

1. Stage 1 extraction
   - Triggered from new Slack messages, Jira events, and Gmail email messages.
   - Gemini is used to extract structured observations.

2. Stage 2 snapshot synthesis
   - OpenAI `gpt-5.4-nano` synthesizes a memory snapshot from observations.

3. Stage 3 writeback proposal
   - OpenAI `gpt-5.4` proposes a Jira comment writeback for linked issues.

4. Approval/apply
   - Admin UI can approve or reject proposals.
   - Approved proposals enqueue `memory_writeback_apply`.
   - Worker posts the proposal body into Jira via the Jira REST API.

Important details:

- This is optional and separate from the deterministic summary engine.
- It requires both `GEMINI_API_KEY` and `OPENAI_API_KEY`.
- It also requires the memory queue names to exist when `QUEUE_ADAPTER=sqs`.

## 6. Hosting and deployment topology

### Source control and CI/CD

- Git remote points to `https://github.com/elijahtanblue/MemoryAI`.
- CI/CD is implemented in `.github/workflows/deploy.yml`.
- On every push to `main`:
  - API image is built and pushed to GHCR.
  - Worker image is built and pushed to GHCR.
  - Admin image is built and pushed to GHCR.
  - A deploy job SSHs into EC2, pulls images, runs Prisma `db:push`, and restarts services.

### Container registry

- Images are stored in GitHub Container Registry.
- Tag format:
  - `ghcr.io/<repo_owner>/remi-api`
  - `ghcr.io/<repo_owner>/remi-worker`
  - `ghcr.io/<repo_owner>/remi-admin`
- Both `latest` and commit SHA tags are pushed.

### Repo-documented production host layout

From `docker-compose.prod.yml`, `docs/business/SETUP.md`, and `docs/design/DEPLOYMENT_LOG.md`:

- One EC2 instance runs the application containers.
- Docker Compose runs:
  - `api`
  - `admin`
  - `worker`
- Caddy is run separately as its own Docker container on the same EC2 host.
- Caddy terminates TLS and proxies:
  - `api.memoremi.com` -> `localhost:3000`
  - `admin.memoremi.com` -> `localhost:3001`
- Docker Compose does not include Postgres in production. Production DB is external.

### Repo-documented live domains

- API: `https://api.memoremi.com`
- Admin: `https://admin.memoremi.com`

### Repo-documented DNS/reverse-proxy details

- Deployment log records Cloudflare DNS in front of the domains.
- The log records both `api.memoremi.com` and `admin.memoremi.com` pointing at EC2 public IP `3.107.15.249` at the time that log was written.
- The log also notes Cloudflare must be "DNS only" during Caddy certificate provisioning.

### AWS services in use

Documented or code-supported:

- EC2
  - Hosts runtime containers.

- RDS PostgreSQL
  - Backing database.

- SQS FIFO
  - Main queues used by the app:
    - `slack-events`
    - `jira-events`
    - `summary-jobs`
    - `backfill-jobs`
  - Code also supports:
    - `memory-extract`
    - `memory-snapshot`
    - `memory-writeback-propose`
    - `memory-writeback-apply`

- S3
  - Supported by code and setup docs.
  - Not materially used by the current handlers yet.

### Optional deployment targets

- `apps/admin/vercel.json` supports deploying the admin app to Vercel instead of EC2.
- `website/vercel.json` suggests Vercel is an intended deployment path for the marketing site.
- The repo does not record a live marketing-site hostname, so treat that deployment target as "supported but not documented here."

## 7. Environment and external connections required

### Mandatory for the core product

#### Database

- `DATABASE_URL`
- PostgreSQL database reachable by API and worker
- Production docs assume AWS RDS

#### Slack

- `SLACK_SIGNING_SECRET`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN` for dev/socket-mode or direct API usage
- `SLACK_APP_TOKEN` for Socket Mode local/dev

Required Slack scopes from repo code/docs:

- `channels:history`
- `channels:read`
- `chat:write`
- `commands`
- `im:write`
- `users:read`
- `users:read.email`
- `app_mentions:read`

Required Slack URLs in production:

- Events -> `/slack/events`
- Slash commands -> `/slack/commands`
- Interactivity -> `/slack/interactions`
- OAuth redirect -> `/slack/oauth_redirect`

#### Jira Cloud

- No static env secret for Jira install itself.
- The actual Jira tenant secrets are stored in DB after install:
  - `jiraClientKey`
  - `jiraSiteUrl`
  - `sharedSecret`
- `BASE_URL` must be publicly reachable so Jira can fetch the descriptor and call lifecycle/webhook routes.

#### Admin

- `ADMIN_API_KEY`
- Required by every `/admin/*` API route and by the admin app's server-side proxy routes.

#### Queueing

- `QUEUE_ADAPTER`
- If `memory`, no external queue infra is needed.
- If `sqs`, the following become required:
  - `SQS_REGION`
  - `SQS_SLACK_EVENTS_URL`
  - `SQS_JIRA_EVENTS_URL`
  - `SQS_SUMMARY_JOBS_URL`
  - `SQS_BACKFILL_JOBS_URL`

### Optional connections

#### Gmail

- `GMAIL_SYNC_ENABLED` (defaults to `true` in worker if unset)
- Plus DB-stored Gmail install data set through admin API:
  - service account JSON
  - monitored mailbox list
  - domain

External Google requirements:

- Google Cloud project with Gmail API enabled
- service account
- domain-wide delegation
- Google Workspace admin approval for `gmail.readonly`

#### Autonomous Memory

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- If `QUEUE_ADAPTER=sqs`, also provision:
  - `SQS_MEMORY_EXTRACT_URL`
  - `SQS_MEMORY_SNAPSHOT_URL`
  - `SQS_MEMORY_WRITEBACK_PROPOSE_URL`
  - `SQS_MEMORY_WRITEBACK_APPLY_URL`

#### Storage

- `STORAGE_ADAPTER`
- `S3_BUCKET`
- `S3_REGION`

Practical note:

- Storage support exists, but current event handlers do not really route payloads into S3/local-storage yet.

#### Marketing website form

- `NEXT_PUBLIC_FORMSPREE_ACTION`
- If not set, the website contact form is presentational only and falls back to email.

## 8. Current checked-in `.env` shape (redacted)

The current root `.env` in this workspace is not a pure local-dev profile. It is a hybrid environment.

Observed non-secret behavior:

- `NODE_ENV=production`
- `PORT=3000`
- `BASE_URL` points to an `ngrok-free.dev` URL
- `API_URL=https://api.memoremi.com`
- `NEXT_PUBLIC_API_URL` is unset
- `QUEUE_ADAPTER=sqs`
- `SQS_REGION=ap-southeast-2`
- `STORAGE_ADAPTER=local`
- `S3_REGION=ap-southeast-2`
- main SQS queue URLs are set
- memory SQS queue URLs are unset
- `DATABASE_URL` points to a remote Postgres host, not localhost
- `SLACK_SOCKET_MODE` is unset, so API code defaults it to `false`
- `GMAIL_SYNC_ENABLED` is unset, so worker code defaults it to `true`

Why this matters:

- Running the admin app locally will, by default, fetch the live API because `API_URL` points at `https://api.memoremi.com`.
- Running the API locally with the current `.env` will advertise an ngrok `BASE_URL`, which is helpful for Jira/Slack callbacks but is not the same thing as a normal localhost-only setup.
- Running with `QUEUE_ADAPTER=sqs` means the worker is not local-only; it is talking to AWS queues.
- Memory queues are not provisioned in the current `.env`, so enabling Autonomous Memory in an SQS-backed environment will fail when it tries to enqueue memory jobs.
- `STORAGE_ADAPTER=local` means the current env is not actually using S3 even though an S3 bucket value exists.

## 9. What is fully implemented vs partially scaffolded

### Fully implemented enough to run

- Slack OAuth/install flow
- Slack commands and message shortcut
- Slack App Home
- Jira Connect descriptor/lifecycle/webhooks/panel
- deterministic summary engine
- API + worker + admin runtime wiring
- admin dead-letter operations
- Gmail polling and Slack DM suggestions
- GitHub Actions -> GHCR -> EC2 deployment path

### Implemented in code, but operationally sensitive

- Jira Connect installs
  - Repo docs say the public/private descriptor install route effectively ended on 2026-03-31 for new installs.

- Autonomous Memory
  - Code exists and admin controls exist.
  - Requires extra queue provisioning plus OpenAI/Gemini credentials.

### Scaffolded / partial / important caveats

- `packages/storage`
  - Storage adapters exist, but runtime handlers still mostly persist raw payloads directly in Postgres JSON columns.

- `apps/admin/src/app/integrations/*`
  - The integrations page is mostly a UX/config prototype.
  - It does not have a corresponding DB model or API persistence layer for the displayed settings.
  - "Save changes" is local client state, not durable backend config.

- `packages/email`
  - Contains email policy logic/types and tests.
  - This is not the same thing as the live Gmail ingest implementation in `packages/gmail`.

- `website/`
  - Standalone and separate from the PNPM workspace.
  - Deployment target appears intended, but current live host is not documented in repo docs.

## 10. Important file map for developers

If someone new joins the project, these are the fastest entry points:

- API boot/server
  - `apps/api/src/bootstrap.ts`
  - `apps/api/src/index.ts`
  - `apps/api/src/server.ts`

- API routes
  - `apps/api/src/routes/slack/index.ts`
  - `apps/api/src/routes/jira/index.ts`
  - `apps/api/src/routes/admin/index.ts`
  - `apps/api/src/routes/admin/memory.ts`

- Worker
  - `apps/worker/src/index.ts`
  - `apps/worker/src/consumer.ts`
  - `apps/worker/src/handlers/slack-events.ts`
  - `apps/worker/src/handlers/jira-events.ts`
  - `apps/worker/src/handlers/summary-jobs.ts`
  - `apps/worker/src/handlers/backfill-jobs.ts`
  - `apps/worker/src/handlers/memory-jobs.ts`

- Slack integration
  - `packages/slack/src/commands/link-ticket.ts`
  - `packages/slack/src/commands/brief.ts`
  - `packages/slack/src/shortcuts/attach-thread.ts`
  - `packages/slack/src/events/message.ts`
  - `packages/slack/src/views/app-home.ts`

- Jira integration
  - `packages/jira/src/connect/descriptor.ts`
  - `packages/jira/src/connect/lifecycle.ts`
  - `packages/jira/src/client.ts`
  - `packages/jira/src/auth.ts`

- DB and schema
  - `packages/db/prisma/schema.prisma`
  - `packages/db/src/repositories/`

- Summary engine
  - `packages/summary-engine/src/engine.ts`
  - `packages/summary-engine/src/analyzers/*`
  - `packages/summary-engine/src/formatters/*`

- Memory engine
  - `packages/memory-engine/src/pipeline/*`
  - `packages/memory-engine/src/clients/*`

- Gmail
  - `packages/gmail/src/sync.ts`
  - `packages/gmail/src/client.ts`
  - `packages/gmail/src/slack-dm.ts`

- Admin app
  - `apps/admin/src/lib/api.ts`
  - `apps/admin/src/app/workspaces/`
  - `apps/admin/src/app/integrations/`
  - `apps/admin/src/app/api/admin/`

- Deployment
  - `.github/workflows/deploy.yml`
  - `docker-compose.prod.yml`
  - `docs/business/SETUP.md`
  - `docs/design/DEPLOYMENT_LOG.md`

## 11. Local dev vs production assumptions

### Local/dev path the repo expects

From `.env.example` and `docs/business/SETUP.md`:

- Postgres via `docker compose up -d`
- `QUEUE_ADAPTER=memory`
- `STORAGE_ADAPTER=local`
- Slack Socket Mode enabled for local Slack testing
- ngrok used only when Jira needs a public URL

### Production path the repo expects

- External Postgres (RDS)
- `QUEUE_ADAPTER=sqs`
- external SQS FIFO queues
- API/admin/worker running as Docker containers on EC2
- reverse proxy/TLS via Caddy
- deploy via GitHub Actions and GHCR

### Practical note about this specific workspace

The current `.env` is closer to a production-connected local workstation profile than a clean local profile.

## 12. Troubleshooting shortcuts

### "Slack install or Slack commands are failing"

Check:

- `apps/api/src/routes/slack/index.ts`
- Slack app URLs and scopes
- `SLACK_SIGNING_SECRET`
- whether `SLACK_SOCKET_MODE` matches the environment you think you are running
- whether the workspace has a `SlackWorkspaceInstall` row

### "Jira install or Jira panel is failing"

Check:

- `BASE_URL`
- descriptor URL includes `?workspaceId=<workspace.id>`
- `apps/api/src/routes/jira/index.ts`
- `packages/jira/src/auth.ts`
- whether `JiraWorkspaceInstall` exists with a valid `sharedSecret`
- the repo-documented Connect limitation after 2026-03-31

### "Admin pages show fetch failures"

Check:

- `apps/admin/src/lib/api.ts`
- `apps/admin/src/app/api/admin/config.ts`
- `API_URL` / `NEXT_PUBLIC_API_URL`
- `ADMIN_API_KEY`
- whether the admin is running against local API or the live API

### "Worker is dead-lettering messages"

Check:

- `apps/worker/src/consumer.ts`
- admin dead-letter pages
- queue URLs and AWS access
- DB connectivity
- whether the message type requires an integration install that does not exist

### "Gmail is not syncing"

Check:

- `GMAIL_SYNC_ENABLED`
- `GmailWorkspaceInstall` row exists
- service account JSON is valid
- domain-wide delegation is approved
- Gmail API enabled
- monitored mailbox list is populated

### "Autonomous Memory does nothing"

Check:

- workspace memory config is enabled
- `OPENAI_API_KEY` and `GEMINI_API_KEY`
- if using SQS, all `SQS_MEMORY_*` URLs are provisioned
- admin backfill actions if you expect historical data to seed memory

### "S3 is not being used even though we configured it"

Current repo reality:

- storage adapter support exists
- schema supports `s3PayloadKey`
- current event handlers do not populate those fields
- raw payloads are mainly stored directly in Postgres today

## 13. Bottom line

The stable core of the product is:

- Slack <-> Jira linking
- background backfill and event processing
- Postgres as the durable system of record
- deterministic summary generation
- admin observability and recovery tools

The advanced/optional layers are:

- Gmail signal ingestion
- AI-backed Autonomous Memory
- richer per-integration settings UX
- future storage offloading to S3

If you are debugging production behavior, start with the API routes, worker handlers, Prisma schema, and deployment docs. If you are debugging feature gaps, pay close attention to which parts of the repo are runtime-backed versus which parts are currently UI or package-level scaffolding.

## 14. Domain, port, and network map

### External/public endpoints

| Surface | Hostname | Backing app | Purpose |
|---|---|---|---|
| API | `api.memoremi.com` | `apps/api` via Caddy | Slack OAuth/events/commands, Jira descriptor/lifecycle/webhooks/panel, admin API |
| Admin | `admin.memoremi.com` | `apps/admin` via Caddy | operator dashboard |
| Slack install entry | `api.memoremi.com/slack/install` | API | start Slack OAuth |
| Jira descriptor | `api.memoremi.com/jira/atlassian-connect.json` | API | Jira Connect install descriptor |
| Jira panel | `api.memoremi.com/jira/panel/:issueKey` | API | iframe inside Jira issue view |

### Host/container ports

| Component | Container port | Host port | Notes |
|---|---|---|---|
| API | `3000` | `3000` | healthcheck uses `/health` |
| Admin | `3000` | `3001` | container runs Next standalone server on 3000 |
| Worker | none | none | background consumer only |
| Caddy | `80/443` | `80/443` | run outside compose in repo docs |

### Private/internal network hops

- Admin server-side data fetching should prefer `API_URL=http://api:3000` when both admin and API run in the same Docker Compose network.
- Public browser traffic should hit Caddy/domain endpoints, not raw ports 3000/3001.
- Jira and Slack must be able to reach the public API `BASE_URL`.
- Worker must be able to reach:
  - Postgres
  - SQS when `QUEUE_ADAPTER=sqs`
  - Slack Web API for DMs/backfills
  - Jira REST API for backfills and writebacks
  - Gmail API when Gmail sync is enabled
  - OpenAI and Gemini APIs when memory is enabled

## 15. Route and queue inventory

### API route inventory

#### Health

- `GET /health`
- `GET /ready`

#### Slack

- `POST /slack/events`
- `POST /slack/commands`
- `POST /slack/interactions`
- `GET /slack/install`
- `GET /slack/oauth_redirect`
- `GET /slack/installed`

#### Jira

- `GET /jira/install`
- `GET /jira/atlassian-connect.json`
- `POST /jira/lifecycle/installed`
- `POST /jira/lifecycle/uninstalled`
- `POST /jira/webhooks`
- `GET /jira/panel/:issueKey`

#### Admin core

- `GET /admin/workspaces`
- `POST /admin/workspaces`
- `GET /admin/workspaces/:workspaceId/summaries`
- `GET /admin/summaries/:id`
- `POST /admin/summaries/:id/rerun`
- `GET /admin/dead-letters`
- `POST /admin/dead-letters/:id/retry`
- `DELETE /admin/dead-letters/:id`
- `DELETE /admin/dead-letters`
- `POST /admin/gmail/configure`
- `GET /admin/gmail/:workspaceId`
- `GET /admin/analytics`
- `GET /admin/workspaces/:workspaceId/audit-log`

#### Admin memory

- `GET /admin/memory/config/:workspaceId`
- `PUT /admin/memory/config/:workspaceId`
- `GET /admin/memory/units/by-id/:unitId`
- `GET /admin/memory/units/:workspaceId`
- `GET /admin/memory/units/:workspaceId/:unitId`
- `GET /admin/memory/proposals/:workspaceId`
- `POST /admin/memory/proposals/:proposalId/approve`
- `POST /admin/memory/proposals/:proposalId/reject`
- `POST /admin/memory/backfill/:workspaceId`
- `POST /admin/memory/units/:workspaceId/:unitId/rerun`
- `POST /admin/memory/backfill-jira/:workspaceId`

### Admin app proxy inventory

The admin Next app does not call the Fastify admin endpoints directly from the browser for write actions. It exposes a thin Next route-handler proxy layer under:

- `/api/admin/dead-letters/*`
- `/api/admin/summaries/*`
- `/api/admin/memory/*`

Those proxy handlers:

- read `API_URL` / `NEXT_PUBLIC_API_URL`
- attach `x-admin-key`
- normalize JSON/text/no-body responses

### Queue inventory

| Queue name | Produced by | Consumed by | Main payload type |
|---|---|---|---|
| `slack-events` | API/Slack package | worker | new linked-thread Slack messages |
| `jira-events` | API/Jira route | worker | Jira webhook events |
| `summary-jobs` | worker/admin/API flows | worker | deterministic summary generation |
| `backfill-jobs` | Slack link flows, admin actions | worker | Jira issue backfill or Slack thread backfill |
| `memory-extract` | worker Gmail/Slack/Jira handlers, admin memory backfills | worker | stage 1 memory extraction |
| `memory-snapshot` | worker memory extraction, admin reruns | worker | stage 2 memory synthesis |
| `memory-writeback-propose` | reserved/explicit admin-style re-proposal path | worker | stage 3 proposal generation |
| `memory-writeback-apply` | admin approval flow | worker | approved Jira writeback apply |

Important queue behavior:

- SQS implementation uses FIFO semantics.
- `MessageGroupId` is the `workspaceId`.
- `MessageDeduplicationId` is the message `idempotencyKey`.
- Worker also performs DB-level idempotency checks for Slack messages and Jira events.

## 16. Where secrets and state live

### Environment variables

Stored in:

- local `.env`
- production `.env.prod`
- GitHub Actions secrets for deploy

Examples:

- database connection
- Slack credentials
- admin API key
- queue configuration
- OpenAI/Gemini keys
- public/private base URLs

### Database-stored secrets/config

Stored in Postgres:

- Slack bot tokens per workspace in `SlackWorkspaceInstall.botToken`
- Jira `sharedSecret` per workspace in `JiraWorkspaceInstall.sharedSecret`
- Gmail service account JSON in `GmailWorkspaceInstall.serviceAccountJson`
- Gmail monitored mailbox list and mailbox history IDs

Implication:

- This app does not keep all integration secrets solely in env vars.
- Workspace installs are durable application state, not just deployment config.

### External control planes

Configured outside the repo:

- Slack app settings at `api.slack.com/apps`
- Jira site/private-app or development-mode install settings
- Google Cloud project and Google Workspace admin approval
- AWS infrastructure
- Cloudflare/DNS
- GitHub Actions secrets and GHCR auth

## 17. Runtime-backed vs non-runtime-backed features

This is the split that matters most when someone says "the UI exists, why doesn't the system do the thing?"

### Runtime-backed now

- Slack linking, summaries, app home
- Jira installs/webhooks/panel
- Gmail mailbox sync and Slack DM suggestion
- dead-letter retry/delete
- memory config toggle and memory backfill/writeback operations
- analytics/product event capture

### Present in UI/types, but not durably wired end-to-end

- most of the `/integrations` page settings
- Outlook as a real runtime connector
- mailbox-group/access-policy persistence from the email settings UI
- generalized per-integration settings storage
- S3-backed raw-payload offload

### Useful rule of thumb

If a feature only exists in:

- `apps/admin/src/app/integrations/*`
- `packages/shared/src/types/email.ts`
- or other UI-only stateful React components

then it is likely conceptual/scaffolded unless you can also find:

- Prisma schema support
- repository functions
- Fastify admin routes
- worker behavior using that data

## 18. Fast sanity checks for a broken environment

When a developer is dropped into an unfamiliar setup, these are the fastest checks:

### API/container health

- API should answer `GET /health`
- API should answer `GET /ready`
- Admin should load without `fetch failed`
- Worker should be running, even though it exposes no HTTP port

### Workspace/install health

- `GET /admin/workspaces` should show at least one workspace
- each workspace should usually have:
  - latest Slack install
  - optionally a Jira install
  - optionally a Gmail install

### Queue health

- dead letters should be visible in admin if jobs are failing
- if memory is enabled with SQS, confirm all `SQS_MEMORY_*` URLs exist
- if queues are FIFO, confirm idempotency keys are not accidentally reused across unrelated work

### Slack health

- Slack OAuth completes
- Slack app home opens
- `/link-ticket` works in a thread
- `/brief` returns data

### Jira health

- descriptor URL loads
- install lifecycle succeeded
- webhook calls are arriving
- Jira panel renders for a linked issue

### Gmail health

- Gmail install exists for the workspace
- worker polling is enabled
- monitored mailboxes are not empty
- issue-key detection is working against known issue keys already in DB

## 19. `/brief` read path

`/brief ISSUE-KEY` is the main user-facing read path.

Flow:

1. Slack invokes `/brief ISSUE-KEY`.
2. Remi resolves the workspace and looks up the issue.
3. If Autonomous Memory is enabled and snapshots exist:
   - Remi loads the latest snapshot per memory unit
   - chooses a base snapshot
   - merges decisions, actions, blockers, and questions across units
   - returns a "Memory Brief"
4. Otherwise Remi falls back to the deterministic summary path:
   - refresh current Jira issue state
   - generate a fresh summary
   - return the standard summary blocks

Important details:

- `/brief` is the main switch point between the stable summary engine and the newer memory system.
- The deterministic summary path can force regeneration even when the inputs are unchanged.

## 20. Simple mental model

If you only remember one framing of the system, use this:

- Slack and Jira are event sources.
- The API is the intake layer.
- The worker is the execution layer.
- Postgres is the durable memory of the product.
- The summary engine is the stable rules-based interpretation layer.
- The memory engine is the optional AI interpretation layer.
- The admin app is the operator control surface.

That framing usually makes the codebase much easier to navigate.
