# Remi Coordination Platform — Design Spec

**Date:** 2026-04-23
**Status:** Approved

---

## 1. Context and Strategic Pivot

Remi is pivoting from a generic memory layer to a **coordination layer for messy issues** — specifically, issues where the real status is fragmented across Jira, Slack, and email.

The core product artifact is the **Current Work Record (CWR)**: an issue-level, auto-maintained operational state that answers what is happening now, who owns it, what is blocked, what we are waiting on, and what should happen next.

Interview evidence confirms the wedge. The strongest ICP is support, implementation, and customer operations teams handling escalations and vendor issues — teams that already lose issue context across internal chat, formal tickets, and external email. The admin dashboard model is the wrong product shape for this audience. A proper web platform is needed.

**What this spec delivers:**
- A new user-facing web app (`apps/web`) separate from the internal admin dashboard
- The `CurrentWorkRecord` data model and pipeline write path
- Auth via Slack OAuth using a BFF pattern
- Typed API contracts shared between `apps/web` and `apps/api`
- Clear task split between Frontend (Claude) and Backend (Codex)

**What stays unchanged:**
- `apps/admin` remains the internal ops tool (dead letters, memory inspection, backfill, proposal ops)
- The existing 3-stage memory pipeline (extract → snapshot → propose) is unchanged
- Existing Slack commands (`/link-ticket`, `/brief`, `/doc`) continue to work

---

## 2. Architecture

### Monorepo changes

```
apps/
  api/       — Fastify API server. Add /web/* and /internal/* route groups.
  worker/    — Queue consumer. Add CWR generation handler and trigger paths.
  admin/     — Next.js internal ops dashboard. No structural changes.
  web/       — NEW. Next.js user-facing coordination platform.

packages/
  db/        — Schema additions: UserSession, Scope, CurrentWorkRecord,
               WorkflowScopeConfig, MeaningfulEvent.
  shared/    — Add packages/shared/src/types/api.ts: shared API contract types.
  memory-engine/ — Add CWR generation step downstream of stage 2.
  slack/     — Add Slack OAuth identity flow (separate from bot install flow).
  [others]   — Unchanged.
```

### Request flow

```
Browser
  → apps/web (Next.js server — validates session cookie)
  → apps/api /web/* or /internal/* (Fastify — validates X-Internal-Token)
  → packages/db (Prisma — workspace-scoped queries)
```

`apps/web` never talks to the database directly. All data access goes through `apps/api`. This boundary holds without exception, including for session management.

`apps/api` never sees user cookies. It trusts only the `X-Internal-Token` shared secret and uses `X-User-Id` / `X-Workspace-Id` headers for request context.

### Deployment

`apps/web` is a new deployment unit, containerised alongside the existing `apps/api` and `apps/admin` services. Same infrastructure pattern.

---

## 3. Auth

### Two separate Slack OAuth paths — never mixed

```
/slack/install       — existing route in apps/api
                       bot installation, creates/updates SlackWorkspaceInstall
                       unchanged

/auth/slack          — new routes in apps/web
                       human user identity login
                       uses Slack identity.basic scope only
                       never touches SlackWorkspaceInstall
```

### Login flow

```
1. User clicks "Sign in with Slack"
2. apps/web generates random state, stores in short-lived HttpOnly cookie
3. apps/web redirects to Slack OAuth (identity.basic scope, with state param)
4. Slack redirects to apps/web/auth/slack/callback with code + state
5. apps/web verifies state matches cookie → exchange code for Slack user identity
   (apps/web holds client_id and client_secret; apps/api does not)
6. apps/web calls POST /internal/sessions/resolve:
     body: { slackUserId, slackTeamId }
7. apps/api:
     a. Look up SlackWorkspaceInstall by slackTeamId
        → not found: return 403 "Remi isn't installed in your Slack workspace"
     b. Look up SlackUser by slackUserId + slackTeamId → get userId
        → not found: return 403 (see closed-pilot note below)
     c. Create UserSession, return { token } (raw opaque token)
8. apps/web stores raw token as HttpOnly; Secure; SameSite=Lax cookie
9. Redirect to /queue
```

### Session validation (every request)

```
apps/web receives request
→ read session cookie → extract raw token
→ call POST /internal/sessions/validate with body: { token }
→ apps/api hashes token, looks up UserSession, checks expiry + revokedAt
→ 401: apps/web redirects to /login
→ found: attach userId + workspaceId to request context
→ proceed to call /web/* with X-Internal-Token + X-User-Id + X-Workspace-Id headers
```

### Logout

```
apps/web receives POST /auth/logout
→ call POST /internal/sessions/revoke with body: { token }
→ apps/api sets UserSession.revokedAt
→ apps/web clears cookie
→ redirect to /login
```

### Session token security

The cookie stores a **raw opaque session token** (e.g. 32-byte random hex). `apps/api` stores only its SHA-256 hash. The raw token is never stored server-side and never appears in path parameters or logs.

Cookie attributes: `HttpOnly; Secure; SameSite=Lax`. Expiry matches `UserSession.expiresAt`.

### OAuth state parameter

`apps/web` generates a random `state` value before redirecting to Slack, stores it in a short-lived `HttpOnly` cookie, and verifies it on callback before exchanging the code. Prevents CSRF on the OAuth flow.

### Internal session routes (apps/api — never public)

All protected by `X-Internal-Token` header validation. Token values never appear in path parameters.

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/internal/sessions/resolve` | `{ slackUserId, slackTeamId }` | Validate Slack identity, create UserSession, return raw token |
| `POST` | `/internal/sessions/validate` | `{ token }` | Validate session, return `{ userId, workspaceId }` or 401 |
| `POST` | `/internal/sessions/revoke` | `{ token }` | Revoke session (sets revokedAt) |

`/internal/sessions/resolve` receives the Slack identity resolved by `apps/web` (apps/web owns the Slack OAuth exchange), creates the `UserSession`, and returns the raw token. apps/api does not hold Slack OAuth credentials.

### Unknown workspace rule

If `slackTeamId` is not found in `SlackWorkspaceInstall`, reject login with a clear message: "Remi isn't installed in your Slack workspace. Ask your admin to install it first."

**Closed-pilot behaviour:** If `slackTeamId` is found but no matching `SlackUser` row exists, reject with 403. In the current product, `SlackUser` rows are created only after a user interacts with Slack features (commands, app home). This is intentional for a closed pilot where all users are expected to have prior Slack interaction. For production, just-in-time `SlackUser` creation on first login is needed — deferred, see Section 10.

---

## 4. Data Model

Five new models. All migrations are Codex's responsibility.

### UserSession

```prisma
model UserSession {
  id          String    @id @default(cuid())
  userId      String
  workspaceId String                        // denormalised for fast session reads
                                            // validated against User on creation
                                            // never treated as sole tenant authority
  tokenHash   String    @unique
  expiresAt   DateTime
  revokedAt   DateTime?
  lastSeenAt  DateTime?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id])
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@index([userId])
  @@index([expiresAt])
  @@map("user_sessions")
}
```

Session validation always joins through `User` to confirm `workspaceId` consistency. `workspaceId` on the session is context, not authoritative scope.

### Scope

New isolation primitive replacing Department-first model. Full RBAC enforcement is deferred (see out-of-scope doc). Add `scopeId String?` as optional FK on `Issue` now.

```prisma
model Scope {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  type        String   // 'team' | 'workflow' | 'project' | 'pilot'
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace          Workspace            @relation(fields: [workspaceId], references: [id])
  workflowConfigs    WorkflowScopeConfig[]
  issues             Issue[]

  @@index([workspaceId])
  @@map("scopes")
}
```

Add to `Issue`:
```prisma
scopeId String?
scope   Scope?  @relation(fields: [scopeId], references: [id])

@@index([workspaceId, scopeId])  // add alongside existing workspaceId index
```

### WorkflowScopeConfig

Ingestion and writeback policy for a scope. One config per `(scopeId, workflowKey)` pair. `workflowKey` is a stable identifier (e.g. `vendor-escalation`, `support-handoff`).

```prisma
model WorkflowScopeConfig {
  id                   String   @id @default(cuid())
  workspaceId          String
  scopeId              String
  workflowKey          String   // stable slug, e.g. 'vendor-escalation'
  name                 String   // display label
  includedChannelIds   String[]
  includedJiraProjects String[]
  includedMailboxes    String[]
  writebackEnabled     Boolean  @default(false)
  approvalRequired     Boolean  @default(true)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  scope     Scope     @relation(fields: [scopeId], references: [id])

  @@unique([scopeId, workflowKey])
  @@index([workspaceId])
  @@map("workflow_scope_configs")
}
```

### CurrentWorkRecord

One per issue. Upserted by the CWR generation pipeline step. The core artifact.

```prisma
model CurrentWorkRecord {
  id                          String    @id @default(cuid())
  issueId                     String    @unique
  workspaceId                 String

  // State fields
  currentState                String
  ownerDisplayName            String?
  ownerExternalId             String?   // jiraAccountId or slackUserId
  ownerSource                 String?   // 'jira' | 'slack' | 'email'
  blockerSummary              String?
  blockerDetectedAt           DateTime?
  waitingOnType               String?   // 'internal_person' | 'internal_team' |
                                        // 'external_vendor' | 'external_customer' | 'approval'
  waitingOnDescription        String?
  openQuestions               Json      // OpenQuestion[]
  nextStep                    String?

  // Risk and urgency
  riskScore                   Float     @default(0)   // 0.0–1.0; scale to 0–100 at display layer
  urgencyReason               String?                 // "Vendor silent 8 days"
  isStale                     Boolean   @default(false)
  staleSince                  DateTime?

  // Manual confirmation state (set by user actions mark_owner_confirmed / mark_blocker_cleared)
  ownerConfirmedAt            DateTime?
  blockerClearedAt            DateTime?

  // Jira last-seen values (for diff — source of truth for status_changed events)
  lastJiraStatus              String?   // previous Jira status before latest CWR generation
  lastJiraAssigneeId          String?   // previous Jira assignee before latest CWR generation

  // Provenance
  sourceMemoryUnitIds         String[]
  sourceSnapshotIds           String[]
  snapshotSetHash             String    // deterministic: sorted memoryUnitId:latestSnapshotVersion
                                        // + relevant Jira fields (status, assignee, priority)
                                        // used for retry idempotency

  // Freshness
  dataSources                 String[]  // ['slack', 'jira', 'email']
  sourceFreshnessAt           DateTime  // timestamp of most recent meaningful source input
  lastMeaningfulChangeAt      DateTime?
  lastMeaningfulChangeSummary String?

  // Pipeline metadata
  confidence                  Float
  modelId                     String
  promptVersion               String
  generatedAt                 DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt

  issue     Issue     @relation(fields: [issueId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId, isStale])
  @@index([workspaceId, riskScore])
  @@index([workspaceId, lastMeaningfulChangeAt])
  @@index([workspaceId, sourceFreshnessAt])
  @@map("current_work_records")
}
```

`openQuestions` JSON shape:
```typescript
interface OpenQuestion {
  id?: string
  content: string
  source: 'slack' | 'jira' | 'email'
  sourceRef?: string
  sourceUrl?: string
  askedAt?: string       // ISO 8601
  ownerName?: string
  status: 'open' | 'answered' | 'superseded'
}
```

### MeaningfulEvent

Issue-level timeline entries. Distinct from per-thread `MemoryObservation`. Requires idempotency key — the pipeline may retry CWR generation and must not create duplicate events.

```prisma
model MeaningfulEvent {
  id              String   @id @default(cuid())
  issueId         String
  workspaceId     String
  idempotencyKey  String   @unique   // e.g. cwr:<cwrId>:owner_changed:<hash>
  eventType       String
  // Valid types: 'blocker_created' | 'blocker_removed' | 'owner_changed' |
  //              'waiting_on_changed' | 'next_step_changed' |
  //              'external_reply_received' | 'decision_made' |
  //              'status_changed' | 'stale_detected' | 'stale_resolved'
  summary         String   // human-readable: "Owner changed from Alice to Bob via Slack"
  source          String   // 'slack' | 'jira' | 'email'
  sourceRef       String?  // slackMessageTs / jiraCommentId / gmailMessageId
  sourceUrl       String?  // permalink
  actorName       String?
  metadata        Json?    // structured from/to: { from: "Alice", to: "Bob" }
  occurredAt      DateTime
  createdAt       DateTime @default(now())

  issue     Issue     @relation(fields: [issueId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([issueId, occurredAt])
  @@index([workspaceId, occurredAt])
  @@map("meaningful_events")
}
```

---

## 5. CWR Pipeline

### Trigger sources

CWR generation is enqueued from four sources:

1. **After stage 2 completes** for a `MemoryUnit` that has a parent `issueId`
2. **On Jira issue change** — assignee, status, or priority changed (via Jira webhook, without stage 2 running)
3. **On issue link/unlink** — Slack thread or email thread linked or unlinked from an issue
4. **Scheduled stale sweep** — periodic job; staleness can become true purely by time passing without any source activity

### CWR generation job

```
1. Receive cwr-generate job for issueId (payload includes: trigger source)
2. Fetch: latest MemorySnapshot per MemoryUnit for this issue
           (latest = highest version; MemorySnapshot has no active/inactive status)
   Fetch: current Jira issue fields (status, assignee, priority) from Issue table
3. If trigger source is NOT stale_sweep:
     Compute snapshotSetHash from sorted memoryUnitId:snapshotVersion + Jira fields
     If existing CWR has same snapshotSetHash → skip (idempotent, no source change)
   If trigger source IS stale_sweep:
     Skip hash check — always re-evaluate isStale (staleness changes by time alone)
     Only write to DB if isStale or staleSince actually changed
4. Synthesise CWR fields from snapshots + Jira data
5. Diff new CWR against existing CWR → determine which MeaningfulEvents to emit
   For status_changed: read "from" value from existing CWR.lastJiraStatus,
                        "to" value from current Issue.status
6. In a single DB transaction:
     a. Upsert CurrentWorkRecord (including lastJiraStatus = previous Issue.status
        written before overwriting)
     b. Insert MeaningfulEvents (idempotency key prevents duplicates on retry)
```

### Event-diff thresholds

Only emit a `MeaningfulEvent` for these transitions. Do not emit for riskScore drift, confidence drift, wording rephrasing that does not change fingerprint, or `sourceFreshnessAt` updates alone.

| Condition | Event type |
|---|---|
| `blockerSummary` transitions null → non-null | `blocker_created` |
| `blockerSummary` transitions non-null → null | `blocker_removed` |
| `ownerExternalId` changes to a different non-null value | `owner_changed` |
| `waitingOnType` or `waitingOnDescription` changes | `waiting_on_changed` |
| `nextStep` fingerprint changes (trim + lowercase + strip punctuation) | `next_step_changed` |
| `isStale` transitions false → true | `stale_detected` |
| `isStale` transitions true → false | `stale_resolved` |
| Jira `status` or `statusCategory` changes (from = `CWR.lastJiraStatus`) | `status_changed` |
| Email or Slack reply from non-workspace-member detected | `external_reply_received` |

`decision_made` is removed from P0 emit rules — detecting decision language requires separate classification work. Deferred.

`metadata` on each event carries structured from/to data so the timeline can display diffs without reparsing prose.

---

## 6. API Contracts

All shared types live in `packages/shared/src/types/api.ts`. Both `apps/web` and `apps/api` import from here. This file is the coordination boundary for the Claude/Codex split.

### Shared types

```typescript
export type DataSource = 'slack' | 'jira' | 'email'

export type WaitingOnType =
  | 'internal_person'
  | 'internal_team'
  | 'external_vendor'
  | 'external_customer'
  | 'approval'

export type MeaningfulEventType =
  | 'blocker_created'
  | 'blocker_removed'
  | 'owner_changed'
  | 'waiting_on_changed'
  | 'next_step_changed'
  | 'external_reply_received'
  | 'status_changed'
  | 'stale_detected'
  | 'stale_resolved'
  // 'decision_made' deferred — requires separate classification work

export type QueueSection = 'needs_action' | 'recently_changed' | 'awaiting_approval'

export interface OpenQuestion {
  id?: string
  content: string
  source: DataSource
  sourceRef?: string
  sourceUrl?: string
  askedAt?: string
  ownerName?: string
  status: 'open' | 'answered' | 'superseded'
}

// Used on Work Queue cards
export interface CWRSummary {
  currentState: string
  ownerDisplayName: string | null
  ownerExternalId: string | null
  blockerSummary: string | null
  waitingOnType: WaitingOnType | null
  waitingOnDescription: string | null
  nextStep: string | null
  riskScore: number                          // 0.0–1.0; scale to 0–100 at display layer
  urgencyReason: string | null
  isStale: boolean
  staleSince: string | null
  sourceFreshnessAt: string
  lastMeaningfulChangeAt: string | null
  lastMeaningfulChangeSummary: string | null
  dataSources: DataSource[]
  confidence: number
}

// Used on Issue Detail page
export interface CWRDetail extends CWRSummary {
  ownerSource: DataSource | null
  blockerDetectedAt: string | null
  openQuestions: OpenQuestion[]
  generatedAt: string
  updatedAt: string
}

export interface IssueQueueItem {
  id: string
  jiraIssueKey: string
  jiraIssueUrl: string          // constructed by API: jiraSiteUrl + /browse/ + jiraIssueKey
  title: string
  status: string | null
  priority: string | null
  scopeId: string | null
  scopeName: string | null
  cwr: CWRSummary | null
  queueSection: QueueSection
  pendingProposalCount: number
}

export interface IssueDetail {
  id: string
  jiraIssueKey: string
  jiraIssueUrl: string
  title: string
  status: string | null
  statusCategory: string | null
  priority: string | null
  issueType: string | null
  scopeId: string | null
  scopeName: string | null
  cwr: CWRDetail | null
}

export interface MeaningfulEventItem {
  id: string
  eventType: MeaningfulEventType
  summary: string
  source: DataSource
  sourceRef: string | null
  sourceUrl: string | null
  actorName: string | null
  occurredAt: string
  metadata: Record<string, unknown> | null
}

export interface EvidenceItem {
  id: string
  category:
    | 'decision'
    | 'action_item'
    | 'blocker'
    | 'open_question'
    | 'status_update'
    | 'owner_update'
    | 'risk'
  content: string
  confidence: number
  sourceApp: DataSource | null              // nullable: old observations may have null source
  state: 'active' | 'superseded'
  extractedAt: string
  citationUrls: string[]
}

export interface ProposalItem {
  id: string
  issueId: string
  issueKey: string
  issueTitle: string
  target: 'jira_comment'
  status: 'pending_approval' | 'approved' | 'applied' | 'rejected' | 'failed'
  payload: { jiraIssueKey: string; commentBody: string }
  confidence: number
  createdAt: string
  updatedAt: string
}

export interface ProposalEditRequest {
  commentBody: string                       // only commentBody is editable
}

export interface TriggerActionRequest {
  type:
    | 'chase_owner'
    | 'draft_update'
    | 'prepare_escalation'
    | 'mark_owner_confirmed'    // writes CWR.ownerConfirmedAt + emits MeaningfulEvent
    | 'mark_blocker_cleared'    // writes CWR.blockerClearedAt + emits MeaningfulEvent
  input?: Record<string, unknown>           // action-specific params; typed per-action later
}

export interface TriggerActionResponse {
  proposalId: string | null
  message: string
}

export interface ScopeItem {
  id: string
  name: string
  type: string
}

export interface WorkflowConfigItem {
  id: string
  scopeId: string
  workflowKey: string
  name: string
  includedChannelIds: string[]
  includedJiraProjects: string[]
  includedMailboxes: string[]
  writebackEnabled: boolean
  approvalRequired: boolean
}

export type WorkflowConfigCreateRequest = Omit<WorkflowConfigItem, 'id'>
```

### Queue section logic

Sections are mutually exclusive, priority-ordered. Computed by `apps/api`, not re-implemented in `apps/web`.

```
Priority 1 — needs_action:      isStale = true  OR  riskScore >= 0.6
Priority 2 — awaiting_approval: pendingProposalCount > 0  AND  not in priority 1
Priority 3 — recently_changed:  lastMeaningfulChangeAt >= now − 24h  AND  not in priority 1 or 2
(unlisted):                     accessible via all-issues view or search
```

Threshold constants (`riskScore >= 0.6`, `24h`) live in `apps/api` config, not hardcoded in route logic.

An issue with pending proposals that is also stale goes to `needs_action`. The dedicated Approval Inbox page shows all `pending_approval` proposals regardless of queue section.

### Route map — `/web/*` (apps/api, requires X-Internal-Token + X-User-Id + X-Workspace-Id)

| Method | Path | Query/Body | Returns |
|---|---|---|---|
| `GET` | `/web/issues` | `?section=QueueSection\|all&scopeId=&page=&limit=` | `{ items: IssueQueueItem[], total: number }` |
| `GET` | `/web/issues/:id` | — | `IssueDetail` |
| `GET` | `/web/issues/:id/timeline` | `?limit=&before=cursor` | `{ events: MeaningfulEventItem[], nextCursor: string \| null }` |
| `GET` | `/web/issues/:id/evidence` | — | `{ items: EvidenceItem[] }` |
| `POST` | `/web/issues/:id/actions` | `TriggerActionRequest` | `TriggerActionResponse` |
| `GET` | `/web/proposals` | `?status=pending_approval&page=&limit=` | `{ items: ProposalItem[], total: number }` |
| `PUT` | `/web/proposals/:id` | `ProposalEditRequest` | `ProposalItem` |
| `POST` | `/web/proposals/:id/approve` | — | `{ ok: true }` |
| `POST` | `/web/proposals/:id/reject` | `{ reason?: string }` | `{ ok: true }` |
| `GET` | `/web/scopes` | — | `{ items: ScopeItem[] }` |
| `GET` | `/web/workflow-configs` | `?scopeId=` | `{ items: WorkflowConfigItem[] }` |
| `POST` | `/web/workflow-configs` | `WorkflowConfigCreateRequest` | `WorkflowConfigItem` |
| `PUT` | `/web/workflow-configs/:id` | `WorkflowConfigCreateRequest` | `WorkflowConfigItem` |

**Authorization rule for proposals:** Approve and reject routes verify `proposal → memoryUnit → issue.workspaceId` matches the request's `X-Workspace-Id`. Header workspace alone is not sufficient authority.

**Proposal approval semantics:** `POST /web/proposals/:id/approve` sets `MemoryWritebackProposal.status = 'approved'` and enqueues an apply job to the worker. The worker applies the Jira comment and sets `status = 'applied'`. `apps/web` treats `approved` proposals as pending-apply and polls or relies on revalidation to show `applied` state. The existing state machine (`draft → pending_approval → approved → applied`) is unchanged.

### Internal session routes (apps/api, requires X-Internal-Token only)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/internal/sessions/resolve` | `{ slackUserId, slackTeamId }` | `{ token }` or 403 |
| `POST` | `/internal/sessions/validate` | `{ token }` | `{ userId, workspaceId }` or 401 |
| `POST` | `/internal/sessions/revoke` | `{ token }` | `{ ok: true }` |

---

## 7. Frontend Scope (Claude's track — apps/web)

All pages are Next.js server components where possible. Data fetching goes through a thin client layer that attaches session context and calls `apps/api`.

### Pages

**`/queue` — Work Queue (homepage)**

Three tab-style sections: Needs Action, Awaiting Approval, Recently Changed. Each section shows `IssueQueueItem` cards. Default view is Needs Action.

Each card shows: issue key + title, current state, owner, blocker, waiting-on, next step, urgency reason, freshness badge, source badges (Slack / Jira / email), risk indicator, quick action buttons (View, Chase Owner, Draft Update, Prepare Escalation, Approve).

No analytics. No KPI widgets. The page is a triage queue.

**`/issues/:id` — Issue Detail**

Top block: CWR fields — current state, owner, blocker, waiting-on, next step, freshness, risk flag, urgency reason, source badges.

Middle block: Meaningful event timeline (source-linked, paginated, cursor-based).

Side panel: Evidence panel (active observations with citations), action buttons, pending proposal preview if present.

**`/approvals` — Approval Inbox**

List of all `pending_approval` proposals across all issues. Each row shows issue key, proposal target, commentBody preview, confidence, created date. Actions: Approve, Edit and Approve, Reject.

Edit flow: inline `commentBody` editing before approve. Does not navigate away.

**`/settings` — Workflow Settings**

List of `WorkflowScopeConfig` records. Create / edit form: name, workflowKey, scope, included channels, Jira projects, mailboxes, writeback and approval toggles.

**`/login` — Auth**

"Sign in with Slack" button. No other content. Redirect to `/queue` on success.

### Component responsibilities

`apps/web` owns all display-layer concerns:
- `riskScore` (0.0–1.0) → display as 0–100 integer or visual indicator
- `jiraIssueUrl` rendering (received from API, not constructed in client)
- Freshness formatting (relative time from `sourceFreshnessAt`)
- Section tab state and pagination
- Optimistic approval/rejection UI
- Session cookie management and redirect on 401

---

## 8. Backend Scope (Codex's track)

### Schema migration (`packages/db`)

Add: `UserSession`, `Scope`, `CurrentWorkRecord`, `WorkflowScopeConfig`, `MeaningfulEvent`.
Modify: `Issue` (add `scopeId String?`), `Workspace` (add relations to new models).

### New repositories (`packages/db/src/repositories/`)

- `user-session.repo.ts` — create, find by tokenHash, revoke
- `scope.repo.ts` — findMany by workspaceId, findById
- `cwr.repo.ts` — upsert, findByIssueId, findManyByWorkspace (with section logic)
- `workflow-config.repo.ts` — findMany, create, update
- `meaningful-event.repo.ts` — upsertMany (idempotency key), findManyByIssue (cursor paginated)

### New route groups (`apps/api`)

Register two new Fastify plugin groups:
- `/web/*` — user-facing API, requires internal token + user/workspace headers
- `/internal/*` — session management, requires internal token only

Implement all routes from the route map in Section 6.

**Fastify plugin for internal auth:**
```typescript
// validates X-Internal-Token on every /web/* and /internal/* request
// attaches req.userId and req.workspaceId from headers on /web/* requests
```

### CWR generation worker (`apps/worker`, `packages/memory-engine`)

Add `cwr-generate` queue and handler:
- Triggered by: stage 2 completion (when issueId present), Jira webhook (assignee/status/priority change), issue link/unlink events, scheduled stale sweep
- Implements the generation job from Section 5
- All diff + event + upsert in one Prisma transaction

### Slack OAuth identity flow (`apps/web`)

The Slack identity OAuth flow lives entirely in `apps/web`, not in `packages/slack` or `apps/api`. `apps/web` holds the Slack `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` env vars for the identity flow.

`apps/web` route handlers:
- `GET /auth/slack` — generate state, set state cookie, redirect to Slack OAuth URL
- `GET /auth/slack/callback` — verify state, exchange code for user identity, call `/internal/sessions/resolve`, set session cookie, redirect to `/queue`
- `POST /auth/logout` — call `/internal/sessions/revoke`, clear cookie, redirect to `/login`

Does not touch `SlackWorkspaceInstall`. The bot install Slack credentials (`SLACK_BOT_CLIENT_ID`, etc.) remain in `apps/api`.

### Instrumentation

Track these events via existing `ProductEvent` model:

| Event | When |
|---|---|
| `issue_queue_viewed` | GET /web/issues |
| `issue_detail_viewed` | GET /web/issues/:id |
| `proposal_approved` | POST /web/proposals/:id/approve |
| `proposal_rejected` | POST /web/proposals/:id/reject |
| `action_triggered` | POST /web/issues/:id/actions |
| `cwr_generated` | CWR upsert completes |
| `meaningful_event_emitted` | Each MeaningfulEvent row inserted |

---

## 9. Feature Roadmap: Current State → This Spec

| Area | Current state | After this spec |
|---|---|---|
| Product home | Internal admin dashboard | `apps/web` Work Queue |
| Core artifact | MemorySnapshot per thread | CurrentWorkRecord per issue |
| Issue detail | Jira panel (embedded) | Full Issue Detail page with CWR + timeline |
| Approval flow | Admin-only proposal list | User-facing Approval Inbox |
| Scope model | Department-first | Scope primitive introduced; enforcement deferred |
| Auth | No user-facing auth | Slack OAuth, UserSession, BFF session pattern |
| Pipeline triggers | Stage 2 only | Stage 2 + Jira-only changes + link events + stale sweep |
| Event timeline | None | MeaningfulEvent table, diff-thresholded |
| API contracts | No shared types | `packages/shared/src/types/api.ts` |
| Frontend/backend split | Single team | Claude: apps/web; Codex: backend packages |

---

## 10. Out of Scope for This Spec

- Escalation Pack generation (P1 — validate CWR loop first)
- Next-step recommendation engine (P1)
- Role-based views (P1)
- Workflow-level risk digest / scheduled Slack notifications (P1)
- Full RBAC enforcement on Scope (deferred — see out-of-scope doc)
- Gmail evidence relevance scoring upgrade (parallel workstream)
- Jira panel UI refresh (follow-on, after web platform ships)
- Slack brief format update (follow-on)
- Confluence doc generation changes (unchanged for now)
- Enterprise email / magic link auth (deferred — see out-of-scope doc)
- Just-in-time `SlackUser` creation on first web login (required for production, closed-pilot workaround is reject-on-missing)
- Microsoft Teams / Outlook integration (deferred)
- `decision_made` MeaningfulEvent type (deferred — requires separate classification work)
- apps/admin structural changes (unchanged)
