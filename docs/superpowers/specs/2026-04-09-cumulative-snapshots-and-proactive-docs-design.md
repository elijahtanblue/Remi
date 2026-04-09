# Cumulative Snapshots + Proactive Doc Generation

**Date:** 2026-04-09
**Status:** Approved for implementation

---

## Goal

Ship two features simultaneously that together make Remi's `/doc` output demonstrably better than Claude Code + Linear MCP:

- **Option A — Cumulative snapshots**: Confluence docs evolve over time. Each regeneration shows what changed — resolved items appear as strikethrough, new items appear normally — giving users the visual sense that Remi is actively tracking their work.
- **Option C — Proactive triggers**: When a Jira issue moves to `Done`, Remi automatically generates and posts a handoff doc to the most recently active linked Slack channel, without anyone typing `/doc`.

A prerequisite bug fix (Confluence writes failing due to expired OAuth tokens + naive space key derivation) ships as part of the same plan.

---

## Prerequisite: Confluence Write Fix

The current system never refreshes Atlassian OAuth access tokens. Atlassian tokens expire in ~1 hour. The worker has no refresh logic, so `createConfluencePage` silently fails after the first hour post-install.

Additionally, pages are created with `status: 'draft'`, making them invisible in Confluence's default view. And the space key is naively derived as `issueKey.split('-')[0]` with no fallback configuration.

**Fixes required:**

1. **Token refresh** — Add a `refreshConfluenceToken` function to `packages/confluence/src/client.ts`. Before any Confluence API call in the worker, check if the token is expired (store `tokenExpiresAt` on `ConfluenceWorkspaceInstall`) and refresh if needed. Update the stored `accessToken` and `tokenExpiresAt` after refresh.

2. **Page status** — Change `status: 'draft'` → `status: 'current'` in `createConfluencePage` so pages are immediately visible.

3. **Default space key** — Add `defaultSpaceKey String?` to `ConfluenceWorkspaceInstall`. The doc worker uses this if set; falls back to the Jira project prefix only if unset. No admin UI for V1 — set it directly in the DB during workspace setup.

4. **Schema additions for token expiry:**
```prisma
// On ConfluenceWorkspaceInstall
tokenExpiresAt DateTime?
defaultSpaceKey String?
```

---

## Shared Foundation: Update-in-Place

Both Option A and Option C depend on this. Currently, every `/doc` invocation creates a new Confluence page and a new `ConfluencePage` DB row. There is no concept of a canonical page per issue per doc type.

**Design:**

The combination of `(issueId, docType)` identifies the canonical Confluence page for an issue. On each doc generation:

1. Look up an existing `ConfluencePage` record by `(issueId, docType)`.
2. If found: call `updateConfluencePage` (new function) using the stored `confluencePageId`.
3. If not found: call `createConfluencePage` (existing) and create the DB record.

**New function in `packages/confluence/src/client.ts`:**

```ts
export async function updateConfluencePage(params: {
  cloudId: string;
  accessToken: string;
  pageId: string;
  title: string;
  body: string;
  currentVersion: number;
}): Promise<CreatedPage>
```

Confluence's update API requires the current page version number. Store `confluenceVersion Int @default(1)` on `ConfluencePage` and increment it on each update.

**Schema additions on `ConfluencePage`:**
```prisma
confluenceVersion Int      @default(1)
updatedAt         DateTime @updatedAt
```

**Worker change in `apps/worker/src/handlers/doc-generate-jobs.ts`:**

Replace the unconditional `createConfluencePage` + `prisma.confluencePage.create` block with a `createOrUpdatePage` helper that encapsulates the lookup → create/update → upsert DB record logic.

---

## Option A: Cumulative Snapshots

### 1. DB Migration — Observation State

Add two fields to `MemoryObservation`:

```prisma
state        String   @default("active")  // 'active' | 'superseded'
supersededAt DateTime?
```

No backfill needed — all existing observations default to `active`.

### 2. Stage 2 Writes Supersession Back to DB

**Current behaviour:** Stage 2 (`stage2-snapshot.ts`) is a state reducer. When it decides a blocker is no longer active, it simply omits it from the new snapshot output. The source observation row is untouched and remains queryable as if still active.

**New behaviour:** After stage 2 produces a new snapshot, compare the snapshot's `blockers`, `keyDecisions`, and `openQuestions` arrays against the `active` observations for that memory unit. Any observation whose content is no longer represented in the new snapshot output — i.e. stage 2 implicitly dropped it — is marked `state = 'superseded'`, `supersededAt = now()`.

This comparison happens in `runStage2` after `createSnapshot`, using a lightweight string-similarity check (normalise whitespace + lowercase, check substring containment). It does not require an additional LLM call.

If a superseded observation's content reappears in a future snapshot (regression), a new `active` observation is created by the normal stage 1 extraction — the old superseded row stays as-is. The new active observation is what surfaces in the doc.

**Location of change:** `packages/memory-engine/src/pipeline/stage2-snapshot.ts` — add a `reconcileObservationStates` function called at the end of `runStage2`.

### 3. Fix `build-context.ts` — Multiple MemoryUnits

**Current:** `prisma.memoryUnit.findFirst({ where: { issueId } })` — returns one unit, ignoring all others.

**Fix:** `prisma.memoryUnit.findMany({ where: { issueId } })` — returns all units for the issue, then flatten their observations before categorising by state.

```ts
const memoryUnits = await prisma.memoryUnit.findMany({
  where: { issueId },
  include: { observations: { orderBy: { extractedAt: 'desc' } } },
});
const allObservations = memoryUnits.flatMap((u) => u.observations);
```

### 4. `IssueDocContext` — Add Superseded Observations

Extend the type in `packages/confluence/src/types.ts`:

```ts
// In each of keyDecisions, blockers, openQuestions:
Array<{
  content: string;
  source: string;
  citedAt: Date;
  superseded: boolean;   // new
  supersededAt?: Date;   // new
}>
```

`build-context.ts` populates `superseded: true` for observations with `state === 'superseded'`.

### 5. Page Renderer — Strikethrough for Superseded Items

In `packages/confluence/src/page-writer.ts`, each section that renders observations (Key Decisions, Blockers, Open Questions) checks `superseded`:

- **Active items** render normally as `<li><p>content</p></li>`
- **Superseded items** render as `<li><p><s>content</s></p></li>` (Confluence storage format strikethrough)

Superseded items are rendered **after** active items within each section, so active state is read first. No separate "Previously" heading — the strikethrough within the same section provides the visual contrast naturally.

---

## Option C: Proactive Doc Triggers

### Trigger Condition

In `apps/worker/src/handlers/jira-events.ts`, after the status change is processed and the issue is upserted, add a doc trigger check:

```ts
if (
  derivedEventType === 'status_changed' &&
  issue.statusCategory === JiraStatusCategory.DONE
) {
  // enqueue handoff doc
}
```

Use `issue.statusCategory` (already populated by the upsert from `statusCategoryField?.key`) rather than the raw `to` string from the changelog. This is stable across Jira instances regardless of what the team named their "Done" status.

No "in review" trigger in V1 — Jira has no standard status category for review states. Deferred until real customer status configurations are known.

### Channel Resolution

The doc job must know which Slack channel to post the auto-generated result to. Add `triggerChannelId: string | null` to the `DocGenerateJobMessage` payload.

In `jira-events.ts`, before enqueuing the doc job, resolve the target channel:

```ts
// Find the thread whose most recent message is the latest across all linked threads.
// Prisma does not support nested _max in orderBy, so fetch all active links and sort in JS.
const activeLinks = await prisma.issueThreadLink.findMany({
  where: { issueId: issue.id, unlinkedAt: null },
  include: {
    thread: {
      include: { messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
    },
  },
});
const latestLink = activeLinks
  .filter((l) => l.thread.messages.length > 0)
  .sort((a, b) =>
    (b.thread.messages[0]!.sentAt.getTime()) - (a.thread.messages[0]!.sentAt.getTime())
  )[0] ?? activeLinks[0] ?? null;
const triggerChannelId = latestLink?.thread.channelId ?? null;
```

If no linked threads exist, `triggerChannelId` is null and the doc is generated but no Slack notification is sent (the page still gets created/updated in Confluence).

### Guard: Confluence Must Be Configured

Before enqueuing the auto-doc job, check that `ConfluenceWorkspaceInstall` exists for the workspace. If not, skip silently — no error, no Slack message. Teams without Confluence connected should not see error noise from this trigger.

### Idempotency

The idempotency key for auto-triggered docs is `doc:auto:${issue.id}:${issueEvent.id}`. This prevents duplicate docs if the same Jira webhook is delivered twice.

### Slack Notification Wording

Auto-triggered handoff doc notification (posted to `triggerChannelId`):

> `:white_check_mark: *KAN-1* moved to Done — handoff doc updated: <url>`

This is distinct from the manual `/doc` response wording so users can tell which docs were auto-generated.

---

## Data Flow

### Manual `/doc` Command (updated)

```
User: /doc KAN-1 summary
  → slack/commands/doc.ts: validate, check confluenceInstall, check issue exists
  → enqueue DOC_GENERATE_JOBS
  → worker/handlers/doc-generate-jobs.ts:
      1. Refresh Confluence token if expired
      2. buildIssueDocContext (findMany units, active + superseded obs)
      3. renderConfluencePage (strikethrough superseded)
      4. Look up existing ConfluencePage by (issueId, docType)
      5a. Found → updateConfluencePage, increment version
      5b. Not found → createConfluencePage, insert ConfluencePage row
      6. Post Confluence link to Slack channel
```

### Auto-trigger (new)

```
Jira webhook: issue status → Done
  → api/routes/jira/index.ts: enqueue JIRA_EVENTS
  → worker/handlers/jira-events.ts:
      1. Upsert issue (statusCategory populated)
      2. statusCategory === 'done' AND confluenceInstall exists?
      3. Resolve triggerChannelId (most recently active linked thread)
      4. Enqueue DOC_GENERATE_JOBS (docType: 'handoff', triggerChannelId)
  → worker/handlers/doc-generate-jobs.ts: (same as manual flow above)
      6. Post auto-trigger wording to triggerChannelId (if not null)
```

---

## Error Handling

| Failure point | Behaviour |
|---|---|
| Token refresh fails | Log error, throw — job dead-letters. Admin retries from dead-letter panel. |
| Confluence update API 404 (page deleted externally) | Fall back to create a new page, replace `ConfluencePage` record. |
| Confluence update API 409 (version conflict) | Re-fetch current version via `GET /rest/api/content/{pageId}?expand=version`, retry update once with the new version number. If still fails, dead-letter. |
| No linked threads (auto-trigger) | Generate doc, skip Slack notification. No error. |
| No Confluence install (auto-trigger) | Skip entirely. No error, no Slack message. |
| Stage 2 supersession reconciliation fails | Log warning, continue — failure to mark superseded does not block snapshot creation. |

---

## Schema Migration Summary

```prisma
// ConfluenceWorkspaceInstall — add:
tokenExpiresAt  DateTime?
defaultSpaceKey String?

// ConfluencePage — add:
confluenceVersion Int      @default(1)
updatedAt         DateTime @updatedAt

// MemoryObservation — add:
state        String    @default("active")  // 'active' | 'superseded'
supersededAt DateTime?
```

One migration file. No backfill required — all defaults are safe for existing rows.

---

## Files Changed

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | 3 model additions (above) |
| `packages/confluence/src/client.ts` | Add `refreshConfluenceToken`, `updateConfluencePage`; fix `status: 'draft'` → `'current'` |
| `packages/confluence/src/types.ts` | Add `superseded`, `supersededAt` to observation arrays in `IssueDocContext` |
| `packages/confluence/src/build-context.ts` | `findFirst` → `findMany`; populate superseded fields |
| `packages/confluence/src/page-writer.ts` | Render superseded items as strikethrough |
| `packages/memory-engine/src/pipeline/stage2-snapshot.ts` | Add `reconcileObservationStates` called after snapshot creation |
| `apps/worker/src/handlers/doc-generate-jobs.ts` | Token refresh; create-or-update page logic; auto-trigger wording |
| `apps/worker/src/handlers/jira-events.ts` | Add `done` status trigger; channel resolution; guard check |
| `packages/shared/src/index.ts` (message types) | Add `triggerChannelId: string \| null` to `DocGenerateJobMessage.payload` |

---

## Testing

- **Unit**: `reconcileObservationStates` — given a set of active observations and a new snapshot, correct observations are marked superseded; unaffected observations remain active; regression (re-appearance) creates a new active observation without touching the superseded one.
- **Unit**: `createOrUpdatePage` helper — existing `ConfluencePage` row → calls update with correct version; no existing row → calls create.
- **Unit**: `refreshConfluenceToken` — expired token triggers refresh and stores new values; non-expired token skips refresh.
- **Integration**: `jira-events.ts` handler — `status_changed` to `done` with Confluence install present enqueues a `doc_generate_job`; without Confluence install does not enqueue.
- **Integration**: `doc-generate-jobs.ts` — first invocation creates page; second invocation updates same page and increments version.
- **Rendering**: `renderConfluencePage` with superseded observations — strikethrough markup appears for superseded items, not for active items.

---

## Out of Scope

- Confidence level scoring for supersession decisions (see `docs/design/OUT_OF_SCOPE.md`)
- "In review" auto-trigger (deferred — no standard Jira status category)
- Admin UI for `defaultSpaceKey` configuration
- Notion output adapter
