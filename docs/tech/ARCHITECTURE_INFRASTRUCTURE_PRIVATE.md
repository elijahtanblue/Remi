# Remi Architecture and Infrastructure Reference

Generated from a repo scan on 2026-04-08.

This is the private technical "how it works" guide for the repo. It is meant to help a developer quickly understand the app shape, the major runtime flows, where data is stored, and which parts of the system are stable versus optional.

## 1. What Remi is

Remi is a Slack-first operational memory product for teams working across Slack, Jira, and optionally Gmail.

At a high level, the product works like this:

1. A user links a Slack thread to a Jira issue.
2. Remi backfills the Jira issue state and Slack thread history into Postgres.
3. Remi generates a deterministic summary from the stored issue and thread data.
4. That summary is shown in Slack, the Slack App Home, the Jira issue panel, and the admin UI.
5. If Autonomous Memory is enabled, Remi also runs an AI pipeline that extracts structured observations, maintains rolling memory snapshots, and can propose Jira write-backs for approval.

The repo also contains a standalone marketing site under `website/`, but the core product lives in the monorepo under `apps/` and `packages/`.

## 2. System At A Glance

```text
Slack / Jira / Gmail
        |
        v
     apps/api
        |
        v
   queue adapter
   (memory or SQS)
        |
        v
    apps/worker
        |
        v
     Postgres
        |
        +--> Slack surfaces
        +--> Jira panel
        +--> Admin UI
```

The mental model is:

- `apps/api` receives webhooks, slash commands, installs, and admin requests.
- `apps/worker` does the heavy lifting in the background.
- `packages/db` is the durable system-of-record layer.
- `packages/summary-engine` is the deterministic summary path.
- `packages/memory-engine` is the optional AI-backed memory path.

## 3. Repo Shape

### Runtime apps

- `apps/api`
  - Fastify server.
  - Owns Slack routes, Jira routes, admin routes, health checks, and queue production.

- `apps/worker`
  - Background consumer.
  - Processes queued Slack events, Jira events, summary jobs, backfill jobs, and memory jobs.
  - Also runs Gmail sync when enabled.

- `apps/admin`
  - Next.js admin dashboard.
  - Shows workspaces, summaries, dead letters, analytics, integrations, and memory controls.
  - Uses server-side calls and thin proxy handlers to talk to `/admin/*` API routes.

- `website`
  - Separate marketing site.
  - Not part of the main PNPM workspace graph.

### Core packages

- `packages/shared`
  - Shared types, schemas, constants, and queue names.

- `packages/db`
  - Prisma schema, Prisma client, and repository functions.

- `packages/queue`
  - Queue abstraction with in-memory and SQS implementations.

- `packages/slack`
  - Slack Bolt app wiring, slash commands, shortcuts, events, and App Home.

- `packages/jira`
  - Jira Connect descriptor, lifecycle handlers, auth helpers, REST client, and issue panel renderer.

- `packages/gmail`
  - Gmail API client, sync logic, issue-key detection, and Slack DM suggestions.

- `packages/summary-engine`
  - Deterministic summary generation with no LLM.

- `packages/memory-engine`
  - AI-backed observation extraction, snapshot synthesis, and write-back proposal generation.

- `packages/email`
  - Email rules and types used mainly by tests and modeling work.

- `packages/storage`
  - Local and S3 storage adapters. Present, but not deeply wired into current runtime handlers.

## 4. Main Runtime Responsibilities

### `apps/api`

This is the public edge of the system.

It is responsible for:

- Slack OAuth and install flows
- Slack events, slash commands, and interactivity endpoints
- Jira descriptor, lifecycle, webhooks, and panel routes
- Admin API endpoints
- Creating queue messages for background work

In practice, the API does lightweight validation and persistence setup, then hands off the expensive work to the worker.

### `apps/worker`

This is the asynchronous execution engine.

It is responsible for:

- storing incoming Slack and Jira events durably
- backfilling linked Slack threads and Jira issue history
- generating summaries
- running the optional memory pipeline
- syncing Gmail mailboxes
- applying approved Jira write-backs

If something feels "eventually consistent" in the product, it is usually because the worker is in the middle of one of these jobs.

### `apps/admin`

This is the operator console.

It is responsible for:

- viewing workspace state
- inspecting summaries
- retrying or deleting dead letters
- viewing analytics and audit data
- configuring Gmail and memory features
- approving or rejecting memory write-back proposals

## 5. Core Product Flows

### 5.1 Link A Slack Thread To A Jira Issue

The entry points are:

- `/link-ticket ISSUE-KEY`
- the Slack thread attachment shortcut

The flow is:

1. Slack request hits the API.
2. Remi resolves the workspace from the Slack install.
3. Remi creates or reuses:
   - a `SlackThread`
   - an `Issue`
   - an `IssueThreadLink`
4. Remi enqueues backfill jobs for:
   - Jira issue history
   - Slack thread history
5. The worker consumes those jobs, stores the historical data, and generates summaries.

This linking step is the main onboarding point for the operational memory model.

### 5.2 Process New Slack Activity

When a new linked-thread message arrives:

1. Slack sends an event to the API.
2. The API enqueues a `slack_event`.
3. The worker consumes it.
4. The worker stores the `SlackMessage`.
5. The worker enqueues a `summary_job` for each linked issue.
6. If memory is enabled, it also enqueues memory extraction.

Important behavior:

- Slack messages are deduplicated using an `idempotencyKey`.
- Only threaded messages tied to linked threads matter for the core summary flow.

### 5.3 Process Jira Activity

When Jira sends a webhook:

1. The API validates and enqueues a `jira_event`.
2. The worker resolves the workspace from the Jira install.
3. The worker upserts the current `Issue`.
4. The worker stores a durable `IssueEvent`.
5. If the change is meaningful, it enqueues a `summary_job`.
6. If memory is enabled, it also enqueues memory extraction for linked memory units.

Important behavior:

- Jira webhooks are also deduplicated by `idempotencyKey`.
- Jira is the authoritative source for structured issue fields like status, assignee, and priority.

### 5.4 Generate A Deterministic Summary

This is the default summary path and the most stable part of the product.

The flow is:

1. A `summary_job` reaches the worker.
2. `packages/summary-engine` loads:
   - current issue state
   - issue event history
   - all linked Slack thread messages
3. The engine computes an input hash.
4. If the input hash has not changed, it skips writing a new summary unless the run is forced.
5. Otherwise it runs analyzers for blockers, ownership, questions, status drift, and completeness.
6. It formats a `SummaryOutput`.
7. It stores a new `Summary` row and marks prior current summaries as superseded.

This path does not require an LLM.

### 5.5 Serve `/brief`

`/brief ISSUE-KEY` is the main user-facing read path.

The command flow is:

1. Slack invokes the command.
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

So `/brief` is a switch point between the stable summary engine and the newer memory system.

### 5.6 Autonomous Memory

This is an optional AI-backed subsystem layered on top of the durable source data.

It runs in three stages:

1. Stage 1 extraction
   - source events are turned into structured `MemoryObservation` rows
   - current implementation uses Gemini for this step

2. Stage 2 snapshot synthesis
   - the latest observations plus the prior snapshot are reduced into a bounded `MemorySnapshot`
   - current implementation uses OpenAI `gpt-5.4-nano`

3. Stage 3 write-back proposal
   - for issue-linked memory units, Remi may propose a Jira comment write-back
   - current implementation uses OpenAI `gpt-5.4`

Important design principle:

- Remi stores raw source data first.
- AI runs only after durable storage exists.
- The memory snapshot is meant to be a bounded current-state record, not a replay of all history.

## 6. Data Model

The system is multi-tenant at the row level. `Workspace` is the tenant root.

### Core business models

- `Workspace`
- `SlackWorkspaceInstall`
- `JiraWorkspaceInstall`
- `GmailWorkspaceInstall`
- `Issue`
- `IssueEvent`
- `SlackThread`
- `SlackMessage`
- `IssueThreadLink`
- `EmailThread`
- `EmailMessage`
- `IssueEmailLink`
- `Summary`
- `SummaryRun`

### Operational models

- `AuditLog`
- `QueueDeadLetter`
- `ProductEvent`

### Memory models

- `WorkspaceMemoryConfig`
- `MemoryUnit`
- `MemoryObservation`
- `MemorySnapshot`
- `MemoryWritebackProposal`

## 7. Where Data Is Stored

The main durable store is PostgreSQL.

What lives there today:

- current Jira issue state
- Jira webhook and backfill events
- Slack threads and Slack messages
- Gmail email threads and messages
- links between issues and threads
- deterministic summaries
- memory observations and snapshots
- audit data
- product analytics events
- dead letters

Important storage note:

- Several models include `rawPayload` JSON columns.
- Several models also include `s3PayloadKey`.
- In current runtime code, raw payloads mostly stay in Postgres; S3 support exists but is not the main storage path right now.

## 8. Queueing And Background Work

The system supports two queue modes:

- in-memory queue for local/dev/test style execution
- AWS SQS FIFO for production-like environments

Main queues:

- `slack-events`
- `jira-events`
- `summary-jobs`
- `backfill-jobs`
- `memory-extract`
- `memory-snapshot`
- `memory-writeback-propose`
- `memory-writeback-apply`

Why the queue layer matters:

- the API stays responsive
- long-running work is decoupled from user-facing request latency
- retries and dead-letter handling are centralized

## 9. External Integrations

### Slack

Used for:

- install flow
- slash commands
- message events
- shortcuts
- App Home
- DMs

### Jira Cloud

Used for:

- install and tenant registration
- issue webhooks
- issue state refresh
- Jira issue panel
- write-backs from the memory pipeline

### Gmail

Optional.

Used for:

- mailbox polling
- issue-key detection
- Slack DM suggestions
- memory ingestion when enabled

### OpenAI and Gemini

Optional.

Used only by Autonomous Memory:

- Gemini for extraction
- OpenAI for snapshot synthesis and write-back proposal generation

## 10. Deployment Shape

### Local development

The repo expects something close to:

- local Postgres via Docker
- `QUEUE_ADAPTER=memory`
- local API/admin/worker processes
- Slack Socket Mode for local Slack testing
- ngrok only when Jira needs a public callback URL

### Production-style deployment

The repo documents a deployment shape like this:

- API container
- Admin container
- Worker container
- external Postgres
- SQS FIFO queues
- Caddy reverse proxy and TLS
- GitHub Actions building and pushing images to GHCR
- EC2 host running the containers

Public domains documented in the repo:

- `api.memoremi.com`
- `admin.memoremi.com`

## 11. What Is Stable Vs Optional

### Stable core

- Slack thread linking
- Jira issue syncing
- deterministic summary generation
- admin observability and dead-letter tooling
- worker-driven backfill and event processing

### Optional or more operationally sensitive

- Gmail mailbox sync
- Autonomous Memory
- Jira write-back proposals
- S3-backed payload offload
- integration settings UI that is not yet deeply persisted end-to-end

## 12. Best Entry Points For Reading The Code

If you want to understand the system quickly, start here:

### API and routes

- `apps/api/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/src/routes/slack/index.ts`
- `apps/api/src/routes/jira/index.ts`
- `apps/api/src/routes/admin/index.ts`
- `apps/api/src/routes/admin/memory.ts`

### Worker

- `apps/worker/src/index.ts`
- `apps/worker/src/handlers/slack-events.ts`
- `apps/worker/src/handlers/jira-events.ts`
- `apps/worker/src/handlers/summary-jobs.ts`
- `apps/worker/src/handlers/backfill-jobs.ts`
- `apps/worker/src/handlers/memory-jobs.ts`

### Slack behavior

- `packages/slack/src/commands/link-ticket.ts`
- `packages/slack/src/commands/brief.ts`
- `packages/slack/src/events/message.ts`
- `packages/slack/src/views/app-home.ts`

### Summary and memory engines

- `packages/summary-engine/src/engine.ts`
- `packages/summary-engine/src/analyzers/*`
- `packages/memory-engine/src/pipeline/*`

### Data layer

- `packages/db/prisma/schema.prisma`
- `packages/db/src/repositories/*`

## 13. Practical Mental Model

If you only remember one model of the system, use this:

- Slack and Jira are event sources.
- The API is the intake layer.
- The worker is the execution layer.
- Postgres is the durable memory of the product.
- The summary engine is the stable rules-based interpretation layer.
- The memory engine is the optional AI interpretation layer.
- The admin app is the operator control surface.

That framing usually makes the codebase much easier to navigate.
