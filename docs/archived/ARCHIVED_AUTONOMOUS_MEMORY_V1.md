# Archived: Autonomous Memory v1

> Archived or superseded by [Remi-ticket-reconstruction-assistant-v3.md](../design/Remi-ticket-reconstruction-assistant-v3.md). Research/reference only. Do not use this as current product direction, coding-agent scope, or GTM guidance.

## Summary
Build Autonomous Memory as a new AI-backed subsystem that continuously turns opted-in Slack/Jira activity into a living, cited memory record for work in progress. Remi should store raw source events first, derive structured observations and rolling memory snapshots second, and only write externally to Jira after human approval.

Strategy update: this spec should now be read through the ticket-reconstruction pivot. Autonomous Memory is an implementation layer for the **Current Work Record**, not a separate generic memory product.

V1 should stay aligned with the current product direction:
- Capture scope: linked issue evidence only — Slack threads, Jira activity, and Gmail/email context tied to the issue or scoped pilot workflow
- Primary audience: support, implementation, customer operations, and escalation-heavy workflows before generic PM productivity
- Product artifact: issue-scoped Current Work Record, backed by cited Remi memory records
- External writeback: Jira comment only, approval-gated (see AI_DECISIONS.md for rationale)
- Docs target: Confluence draft generation is near-term and write-only first; Notion and two-way docs sync remain deferred

---

## Key Changes

### 1. Add a dedicated memory domain, separate from the current deterministic summary engine
Create a new `memory-engine` package (`@remi/memory-engine`) rather than folding LLM behaviour into the existing deterministic `summary-engine`.

Core responsibilities:
- Ingest eligible source events after they are durably stored
- Extract structured observations from new deltas
- Maintain a bounded rolling memory snapshot
- Generate writeback proposals for Jira
- Expose confidence, citations, freshness, and approval status

New core types and persisted records:
- `MemoryUnit`: the canonical memory object for a work scope
  - V1 scope types: `issue_thread`, `app_dm`
  - Optional `issueId` link for Jira-backed units
- `MemoryObservation`: extracted fact records with citations
  - V1 categories: `decision`, `action_item`, `blocker`, `open_question`, `status_update`, `owner_update`, `risk`
- `MemorySnapshot`: latest structured memory state for a unit
  - headline, current state, key decisions, open actions, blockers, open questions, owners, freshness, confidence
- `MemoryWritebackProposal`: proposed external updates
  - V1 target: Jira comment only
  - statuses: `draft`, `pending_approval`, `approved`, `applied`, `rejected`, `failed`

### 2. Use the current ingestion/storage model, but expand it into an AI pipeline
Reuse the existing worker-driven architecture and the repo's raw source storage pattern (`rawPayload`, `s3PayloadKey`), then add AI jobs downstream of durable storage.

Pipeline:
1. Source event arrives from Slack/Jira/Gmail handler
2. Existing source record is saved first (no AI before durable storage)
3. Worker enqueues memory extraction for the affected `MemoryUnit`
4. Stage 1 extracts observations from only the new delta
5. Stage 2 updates the rolling snapshot from prior snapshot + new observations
6. Stage 3 optionally creates a Jira writeback proposal
7. `/brief`, App Home, Jira panel, and admin surfaces read from `MemorySnapshot`

Implementation defaults:
- No AI before durable source storage
- No whole-workspace ingestion
- No replaying full history on every update
- Snapshot context must stay bounded by prior snapshot + cited deltas, not grow linearly with thread age

### 3. Standardize model routing and confidence handling
Use a hybrid Gemini + OpenAI stack for v1. Gemini Flash-Lite handles high-volume per-message extraction where call count (~4,600/workspace/month) makes output token price the dominant cost. GPT-5.4 nano handles snapshot synthesis and `/brief` where call volume is low and structured summarization quality matters more. GPT-5.4 is the escalation-only frontier fallback.

Default model routing:
- Stage 0 ingest: no AI
- Stage 1 extraction/classification: `gemini-2.5-flash-lite` (Google AI SDK, context caching enabled)
- Stage 2 snapshot synthesis and `/brief`: `gpt-5.4-nano` (OpenAI SDK)
- Stage 3 escalations and writeback proposal generation: `gpt-5.4` (OpenAI SDK)

SDKs required in `packages/memory-engine/package.json`:
- `@google/generative-ai` — Gemini
- `openai` — OpenAI

All model IDs are constants in `packages/memory-engine/src/models.ts`. The internal `MemoryModelClient` interface is vendor-agnostic so stages can swap models independently.

Confidence policy:
- Every observation and snapshot includes confidence and source citations
- Low-confidence observations stay internal but should not produce external writeback proposals
- External writeback proposals require both acceptable confidence and human approval
- Model failures should not delete existing memory; they should retry and preserve the prior snapshot

### 4. Add user-facing surfaces that make the feature feel autonomous
The feature should feel like "documentation is already being handled" without silently mutating customer systems.

V1 user surfaces:
- Slack `/brief`
  - read from `MemorySnapshot` instead of only the deterministic summary output for enabled workspaces
  - show freshness, top decisions, actions, blockers, and unresolved questions
- Slack App Home
  - current secondary surface for recent memory units, stale units, and pending approvals
- Jira panel
  - show latest memory snapshot and pending writeback proposal
  - add approve/reject actions for writeback
- Admin
  - add memory unit detail, snapshot history, proposal review, and rerun controls
- Remi web workflow
  - roadmap home for the Current Work Record, issue detail, work queue, approval inbox, and scope settings

V1 writeback behaviour:
- Remi updates its own memory automatically
- Jira writeback stays proposal-based (Jira comment only — see AI_DECISIONS.md)
- No automatic Jira mutation without approval
- No docs-tool sync in v1

### 5. Add workspace controls and safety rails
The plan must include product controls because trust is the real constraint, not inference cost.

Required controls:
- Per-workspace enable/disable for Autonomous Memory via `WorkspaceMemoryConfig` table
- Explicit exclusion list for channels or users that must never be ingested (safety rail — all channels are ingested by default when the feature is enabled)
- Audit log entries for proposal creation, approval, rejection, and apply/fail outcomes
- Prompt/model version stored on all derived artifacts for replayability
- Feature flag so AI memory can roll out beside the current deterministic summaries per workspace

---

## Important Interface Changes
Add internal interfaces and APIs for:
- `MemoryUnit`, `MemoryObservation`, `MemorySnapshot`, `MemoryWritebackProposal`
- Worker jobs:
  - `memory.extract`
  - `memory.snapshot`
  - `memory.writeback.propose`
  - `memory.writeback.apply`
- Admin/API routes:
  - list memory units
  - fetch memory unit detail and snapshot
  - list pending writeback proposals
  - approve/reject/apply proposal
  - rerun extraction/snapshot for a unit

Behavioral compatibility:
- Existing deterministic summary generation remains intact during rollout
- `/brief` should switch to AI-backed memory per workspace feature flag, not globally
- Existing linked-thread flows remain valid and become the primary entrypoint for v1 memory adoption

---

## Test Plan
- Ingestion
  - linked Slack thread message creates observations and updates the correct `MemoryUnit`
  - duplicate source events do not duplicate observations or proposals
  - excluded scopes (explicitly excluded channels/users) are ignored
- Snapshot behaviour
  - snapshot updates use bounded prior state plus deltas, not full-history replay
  - low-confidence extraction does not overwrite strong existing memory
  - worker failure preserves previous snapshot and retries cleanly
- Writeback
  - proposal creation includes citations and target Jira comment payload
  - approve applies comment to Jira and records audit log
  - reject leaves internal memory intact and prevents external mutation
  - failed apply moves proposal to `failed` without data loss
- User surfaces
  - `/brief`, App Home, and Jira panel all render the same snapshot state
  - pending approvals and freshness markers stay consistent across surfaces
- Permissions
  - non-Remi DMs (user-to-user) are not ingested
  - explicitly excluded channels/users are not ingested
  - approval-gated external writeback is enforced server-side

---

## Assumptions and Defaults
- V1 is issue-centric and conversation-centric, not a company-wide docs platform
- Scope boundaries should use `Scope` / `scopeId` as the future primitive, because the boundary may be a team, workflow, project, department, or pilot rollout
- Current implementation can continue using workspace and department labels where they already exist, but future `Issue`, `MemoryUnit`, contextual upload, Confluence page, and retrieval/query designs should be scope-aware
- Docs-tool writeback is not the wedge; Confluence draft generation is a near-term write-only expansion
- Contextual uploads are pinned reference context, not higher truth over live Slack/Jira/Gmail evidence
- Remi-owned memory supports the Current Work Record
- Jira comment is the only external writeback target in v1
- Hybrid Gemini + OpenAI stack is the default implementation choice (see Section 3)
- The current deterministic summary system is retained during rollout as a fallback and migration bridge

---

## New DB Models Required
The following additions to `schema.prisma` are needed:

- `WorkspaceMemoryConfig` — per-workspace feature flag and exclusion lists (one-to-one with `Workspace`)
- `MemoryUnit` — the canonical memory object, scoped to `issue_thread` or `app_dm`
- `MemoryObservation` — extracted fact with category, confidence, citations, model/prompt version
- `MemorySnapshot` — latest structured state for a unit, bounded context
- `MemoryWritebackProposal` — proposed Jira comment with approval lifecycle

All existing models are unchanged.
