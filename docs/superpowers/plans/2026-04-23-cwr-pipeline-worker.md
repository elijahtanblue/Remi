# CWR Pipeline Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `cwr-generate` queue and its handler to `apps/worker`. The handler synthesises a `CurrentWorkRecord` from the latest memory snapshots + Jira fields, diffs it against the previous CWR to emit `MeaningfulEvent` rows, and writes everything in a single DB transaction. Also wires the four trigger sources: stage 2 completion, Jira status/assignee/priority change, link events, and a periodic stale sweep.

**Architecture:** A new `packages/memory-engine/src/pipeline/cwr.ts` module holds the pure synthesis and diff logic. The `apps/worker/src/handlers/cwr-generate.ts` handler owns the full job lifecycle (fetch → synthesise → diff → transaction). `apps/worker/src/index.ts` registers the consumer and stale sweep interval. Triggers are wired into existing handlers (`memory-jobs.ts`, `jira-events.ts`) by adding `queue.send(QueueNames.CWR_GENERATE, ...)` calls.

**Tech Stack:** OpenAI SDK (GPT-5.4-nano for CWR synthesis), Prisma transactions, Vitest

**Dependency:** Requires Plan 1 (schema, repos, CWR_GENERATE queue name) to be complete. Plans 2 and 3 can run in parallel with this plan.

---

### Task 1: Add `STAGE4_CWR` to memory-engine models

**Files:**
- Modify: `packages/memory-engine/src/models.ts`

- [ ] **Step 1: Add model constant and prompt version**

In `packages/memory-engine/src/models.ts`, add:

```typescript
export const MODELS = {
  STAGE1_EXTRACT: 'gemini-2.5-flash-lite',
  STAGE2_SNAPSHOT: 'gpt-5.4-nano',
  STAGE3_PROPOSE: 'gpt-5.4',
  STAGE4_CWR: 'gpt-5.4-nano',         // CWR synthesis from snapshots + Jira
} as const;

export const PROMPT_VERSIONS = {
  STAGE1_EXTRACT: 'v4',
  STAGE2_SNAPSHOT: 'v4',
  STAGE3_PROPOSE: 'v4',
  STAGE4_CWR: 'v1',
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add packages/memory-engine/src/models.ts
git commit -m "$(cat <<'EOF'
feat(memory-engine): add STAGE4_CWR model constant

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Write failing tests for CWR synthesis helpers

**Files:**
- Create: `tests/memory-engine/cwr.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/memory-engine/cwr.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  computeSnapshotSetHash,
  fingerprintNextStep,
  diffCwr,
} from '../../packages/memory-engine/src/pipeline/cwr.js';

describe('computeSnapshotSetHash', () => {
  it('produces the same hash for the same inputs regardless of order', () => {
    const snaps = [
      { memoryUnitId: 'mu2', version: 3 },
      { memoryUnitId: 'mu1', version: 2 },
    ];
    const jira = { status: 'In Progress', assigneeId: 'u1', priority: 'High' };

    const h1 = computeSnapshotSetHash(snaps, jira);
    const h2 = computeSnapshotSetHash([...snaps].reverse(), jira);
    expect(h1).toBe(h2);
  });

  it('produces different hashes when Jira status changes', () => {
    const snaps = [{ memoryUnitId: 'mu1', version: 1 }];
    const h1 = computeSnapshotSetHash(snaps, { status: 'Open', assigneeId: null, priority: null });
    const h2 = computeSnapshotSetHash(snaps, { status: 'Done', assigneeId: null, priority: null });
    expect(h1).not.toBe(h2);
  });
});

describe('fingerprintNextStep', () => {
  it('returns empty string for null', () => {
    expect(fingerprintNextStep(null)).toBe('');
  });

  it('normalises whitespace, case, and punctuation', () => {
    const a = fingerprintNextStep('Follow up with vendor.');
    const b = fingerprintNextStep('  follow up with Vendor! ');
    expect(a).toBe(b);
  });

  it('detects a meaningful change in content', () => {
    const a = fingerprintNextStep('Email the vendor');
    const b = fingerprintNextStep('Schedule a call');
    expect(a).not.toBe(b);
  });
});

describe('diffCwr', () => {
  const base = {
    id: 'cwr1',
    blockerSummary: null,
    ownerExternalId: 'u1',
    waitingOnType: null,
    waitingOnDescription: null,
    nextStep: 'Email vendor',
    isStale: false,
    lastJiraStatus: 'In Progress',
  };

  it('emits blocker_created when blockerSummary appears', () => {
    const events = diffCwr(
      base as any,
      { ...base, blockerSummary: 'Waiting on legal sign-off' } as any,
      'jira',
    );
    expect(events.some((e) => e.eventType === 'blocker_created')).toBe(true);
  });

  it('emits blocker_removed when blockerSummary clears', () => {
    const events = diffCwr(
      { ...base, blockerSummary: 'Old blocker' } as any,
      { ...base, blockerSummary: null } as any,
      'slack',
    );
    expect(events.some((e) => e.eventType === 'blocker_removed')).toBe(true);
  });

  it('emits owner_changed when ownerExternalId changes to new non-null value', () => {
    const events = diffCwr(
      base as any,
      { ...base, ownerExternalId: 'u2' } as any,
      'jira',
    );
    expect(events.some((e) => e.eventType === 'owner_changed')).toBe(true);
  });

  it('does NOT emit owner_changed when owner clears to null', () => {
    const events = diffCwr(
      base as any,
      { ...base, ownerExternalId: null } as any,
      'jira',
    );
    expect(events.some((e) => e.eventType === 'owner_changed')).toBe(false);
  });

  it('emits stale_detected when isStale flips to true', () => {
    const events = diffCwr(
      { ...base, isStale: false } as any,
      { ...base, isStale: true } as any,
      'slack',
    );
    expect(events.some((e) => e.eventType === 'stale_detected')).toBe(true);
  });

  it('emits status_changed using lastJiraStatus as from-value', () => {
    const events = diffCwr(
      { ...base, lastJiraStatus: 'In Progress' } as any,
      { ...base, lastJiraStatus: 'Done' } as any,
      'jira',
    );
    const evt = events.find((e) => e.eventType === 'status_changed');
    expect(evt).toBeDefined();
    expect((evt!.metadata as any).from).toBe('In Progress');
    expect((evt!.metadata as any).to).toBe('Done');
  });

  it('emits no events when nothing meaningful changed', () => {
    const events = diffCwr(base as any, base as any, 'jira');
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/memory-engine/cwr.test.ts
```
Expected: FAIL — `cwr.js` not found.

---

### Task 3: Implement `packages/memory-engine/src/pipeline/cwr.ts`

**Files:**
- Create: `packages/memory-engine/src/pipeline/cwr.ts`
- Modify: `packages/memory-engine/src/index.ts`

- [ ] **Step 1: Implement the pure helper functions**

Create `packages/memory-engine/src/pipeline/cwr.ts`:

```typescript
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { MeaningfulEventInsert } from '@remi/db';
import type { CWRTriggerSource } from '@remi/shared';
import { MODELS, PROMPT_VERSIONS } from '../models.js';

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function computeSnapshotSetHash(
  snapshots: Array<{ memoryUnitId: string; version: number }>,
  jira: { status: string | null; assigneeId: string | null; priority: string | null },
): string {
  const parts = [...snapshots]
    .sort((a, b) => a.memoryUnitId.localeCompare(b.memoryUnitId))
    .map((s) => `${s.memoryUnitId}:${s.version}`);
  parts.push(`status:${jira.status ?? ''}`, `assignee:${jira.assigneeId ?? ''}`, `priority:${jira.priority ?? ''}`);
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function fingerprintNextStep(s: string | null): string {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');
}

type PartialCwr = {
  id: string;
  blockerSummary: string | null;
  ownerExternalId: string | null;
  waitingOnType: string | null;
  waitingOnDescription: string | null;
  nextStep: string | null;
  isStale: boolean;
  lastJiraStatus: string | null;
};

export function diffCwr(
  prev: PartialCwr,
  next: PartialCwr,
  primarySource: string,
): Omit<MeaningfulEventInsert, 'issueId' | 'workspaceId' | 'idempotencyKey'>[] {
  const now = new Date();
  const events: Omit<MeaningfulEventInsert, 'issueId' | 'workspaceId' | 'idempotencyKey'>[] = [];

  if (!prev.blockerSummary && next.blockerSummary) {
    events.push({
      eventType: 'blocker_created',
      summary: `Blocker detected: ${next.blockerSummary}`,
      source: primarySource,
      occurredAt: now,
      metadata: { blocker: next.blockerSummary },
    });
  }

  if (prev.blockerSummary && !next.blockerSummary) {
    events.push({
      eventType: 'blocker_removed',
      summary: 'Blocker cleared',
      source: primarySource,
      occurredAt: now,
      metadata: { was: prev.blockerSummary },
    });
  }

  if (next.ownerExternalId && prev.ownerExternalId !== next.ownerExternalId) {
    events.push({
      eventType: 'owner_changed',
      summary: `Owner changed`,
      source: primarySource,
      occurredAt: now,
      metadata: { from: prev.ownerExternalId, to: next.ownerExternalId },
    });
  }

  if (prev.waitingOnType !== next.waitingOnType || prev.waitingOnDescription !== next.waitingOnDescription) {
    if (next.waitingOnType || next.waitingOnDescription) {
      events.push({
        eventType: 'waiting_on_changed',
        summary: `Now waiting on: ${next.waitingOnType ?? next.waitingOnDescription}`,
        source: primarySource,
        occurredAt: now,
        metadata: {
          from: { type: prev.waitingOnType, description: prev.waitingOnDescription },
          to: { type: next.waitingOnType, description: next.waitingOnDescription },
        },
      });
    }
  }

  if (fingerprintNextStep(prev.nextStep) !== fingerprintNextStep(next.nextStep)) {
    if (next.nextStep) {
      events.push({
        eventType: 'next_step_changed',
        summary: `Next step updated: ${next.nextStep}`,
        source: primarySource,
        occurredAt: now,
        metadata: { from: prev.nextStep, to: next.nextStep },
      });
    }
  }

  if (!prev.isStale && next.isStale) {
    events.push({
      eventType: 'stale_detected',
      summary: 'Issue has gone stale — no recent updates',
      source: primarySource,
      occurredAt: now,
    });
  }

  if (prev.isStale && !next.isStale) {
    events.push({
      eventType: 'stale_resolved',
      summary: 'Issue is no longer stale',
      source: primarySource,
      occurredAt: now,
    });
  }

  if (prev.lastJiraStatus && next.lastJiraStatus && prev.lastJiraStatus !== next.lastJiraStatus) {
    events.push({
      eventType: 'status_changed',
      summary: `Jira status changed from ${prev.lastJiraStatus} to ${next.lastJiraStatus}`,
      source: 'jira',
      occurredAt: now,
      metadata: { from: prev.lastJiraStatus, to: next.lastJiraStatus },
    });
  }

  return events;
}

// ─── LLM synthesis ──────────────────────────────────────────────────────────

export interface CwrSynthesisInput {
  issueId: string;
  jiraIssueKey: string;
  jiraStatus: string | null;
  jiraAssigneeId: string | null;
  jiraAssigneeName: string | null;
  jiraPriority: string | null;
  snapshots: Array<{
    memoryUnitId: string;
    version: number;
    currentSummary: string;
    updatedAt: Date;
  }>;
}

export interface CwrSynthesisOutput {
  currentState: string;
  ownerDisplayName: string | null;
  ownerExternalId: string | null;
  ownerSource: 'jira' | 'slack' | 'email' | null;
  blockerSummary: string | null;
  waitingOnType: string | null;
  waitingOnDescription: string | null;
  openQuestions: unknown[];
  nextStep: string | null;
  riskScore: number;
  urgencyReason: string | null;
  isStale: boolean;
  confidence: number;
  dataSources: string[];
}

const SYSTEM_PROMPT = `You are an operational intelligence assistant. Given memory snapshots and Jira fields for an issue, extract a structured Current Work Record.

Output ONLY valid JSON with these fields:
- currentState: string — one sentence summary of where this issue stands right now
- ownerDisplayName: string | null — name of who owns this issue
- ownerExternalId: string | null — Jira account ID or Slack user ID of owner
- ownerSource: "jira" | "slack" | "email" | null — where ownership was determined
- blockerSummary: string | null — what is blocking progress (null if unblocked)
- waitingOnType: "internal_person" | "internal_team" | "external_vendor" | "external_customer" | "approval" | null
- waitingOnDescription: string | null — who/what we are waiting on
- openQuestions: array of { content: string, source: "slack"|"jira"|"email", status: "open" }
- nextStep: string | null — the single most important next action
- riskScore: number 0.0-1.0 — likelihood this issue causes a customer or business impact if not acted on
- urgencyReason: string | null — short phrase explaining urgency (e.g. "Vendor silent 8 days")
- isStale: boolean — true if no meaningful update in the last 5 days
- confidence: number 0.0-1.0 — confidence in the synthesis
- dataSources: array of "slack" | "jira" | "email" — which sources contributed`;

export async function runCwrSynthesis(
  input: CwrSynthesisInput,
  openAiClient: { chat: { completions: { create: Function } } },
): Promise<CwrSynthesisOutput> {
  const snapshotText = input.snapshots
    .map((s, i) => `=== Snapshot ${i + 1} (unit ${s.memoryUnitId}, v${s.version}, updated ${s.updatedAt.toISOString()}) ===\n${s.currentSummary}`)
    .join('\n\n');

  const userMessage = `Issue: ${input.jiraIssueKey}
Jira Status: ${input.jiraStatus ?? 'unknown'}
Jira Assignee: ${input.jiraAssigneeName ?? 'unassigned'} (id: ${input.jiraAssigneeId ?? 'none'})
Jira Priority: ${input.jiraPriority ?? 'unknown'}

Memory snapshots:
${snapshotText || '(no snapshots yet)'}`;

  const response = await openAiClient.chat.completions.create({
    model: MODELS.STAGE4_CWR,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
  });

  const raw = JSON.parse(response.choices[0].message.content ?? '{}');

  return {
    currentState: String(raw.currentState ?? 'Status unknown'),
    ownerDisplayName: raw.ownerDisplayName ?? null,
    ownerExternalId: raw.ownerExternalId ?? null,
    ownerSource: raw.ownerSource ?? null,
    blockerSummary: raw.blockerSummary ?? null,
    waitingOnType: raw.waitingOnType ?? null,
    waitingOnDescription: raw.waitingOnDescription ?? null,
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
    nextStep: raw.nextStep ?? null,
    riskScore: Math.max(0, Math.min(1, Number(raw.riskScore ?? 0))),
    urgencyReason: raw.urgencyReason ?? null,
    isStale: Boolean(raw.isStale),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
    dataSources: Array.isArray(raw.dataSources) ? raw.dataSources : [],
  };
}
```

- [ ] **Step 2: Export from `packages/memory-engine/src/index.ts`**

Add to `packages/memory-engine/src/index.ts`:
```typescript
export { computeSnapshotSetHash, fingerprintNextStep, diffCwr, runCwrSynthesis } from './pipeline/cwr.js';
export type { CwrSynthesisInput, CwrSynthesisOutput } from './pipeline/cwr.js';
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
pnpm test -- tests/memory-engine/cwr.test.ts
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/memory-engine/src/pipeline/cwr.ts packages/memory-engine/src/index.ts tests/memory-engine/cwr.test.ts
git commit -m "$(cat <<'EOF'
feat(memory-engine): add CWR synthesis, hash, and diff logic

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `SQS_CWR_GENERATE_URL` to worker config

**Files:**
- Modify: `apps/worker/src/config.ts`

- [ ] **Step 1: Add the config entry**

In `apps/worker/src/config.ts`, add to the Zod schema:
```typescript
SQS_CWR_GENERATE_URL: z.string().optional(),
CWR_STALE_SWEEP_INTERVAL_MS: z.coerce.number().default(3_600_000), // 1 hour
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/src/config.ts
git commit -m "$(cat <<'EOF'
feat(worker): add CWR queue URL and stale sweep interval config

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Implement the `cwr-generate` handler

**Files:**
- Create: `apps/worker/src/handlers/cwr-generate.ts`
- Create: `tests/memory-engine/cwr-generate-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/memory-engine/cwr-generate-handler.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@remi/db', () => ({
  prisma: {
    memoryUnit: { findMany: vi.fn() },
    memorySnapshot: { findMany: vi.fn() },
    issue: { findUnique: vi.fn() },
    currentWorkRecord: { findUnique: vi.fn(), upsert: vi.fn() },
    meaningfulEvent: { createMany: vi.fn() },
    productEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  upsertCwr: vi.fn(),
  upsertMeaningfulEvents: vi.fn(),
  computeQueueSection: vi.fn(),
}));

vi.mock('@remi/memory-engine', () => ({
  computeSnapshotSetHash: vi.fn().mockReturnValue('hash123'),
  runCwrSynthesis: vi.fn(),
  diffCwr: vi.fn().mockReturnValue([]),
  MODELS: { STAGE4_CWR: 'gpt-5.4-nano' },
  PROMPT_VERSIONS: { STAGE4_CWR: 'v1' },
}));

import { prisma } from '@remi/db';
import { computeSnapshotSetHash, runCwrSynthesis, diffCwr } from '@remi/memory-engine';
import { handleCwrGenerate } from '../../apps/worker/src/handlers/cwr-generate.js';
import type { CWRGenerateMessage } from '@remi/shared';

function makeMessage(triggerSource = 'stage2_complete'): CWRGenerateMessage {
  return {
    id: 'm1',
    idempotencyKey: 'k1',
    workspaceId: 'ws1',
    timestamp: new Date().toISOString(),
    type: 'cwr_generate',
    payload: { issueId: 'i1', triggerSource: triggerSource as any },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('handleCwrGenerate', () => {
  it('skips when issue not found', async () => {
    vi.mocked(prisma.issue.findUnique).mockResolvedValue(null);
    await handleCwrGenerate(makeMessage());
    expect(runCwrSynthesis).not.toHaveBeenCalled();
  });

  it('skips when snapshotSetHash is unchanged and trigger is not stale_sweep', async () => {
    vi.mocked(prisma.issue.findUnique).mockResolvedValue({
      id: 'i1', jiraIssueKey: 'PROJ-1', status: 'Open',
      assigneeId: null, priority: null, jiraSiteUrl: 'https://jira.example.com',
    } as any);
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.memorySnapshot.findMany).mockResolvedValue([]);
    vi.mocked(computeSnapshotSetHash).mockReturnValue('same-hash');
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      snapshotSetHash: 'same-hash',
    } as any);

    await handleCwrGenerate(makeMessage('stage2_complete'));
    expect(runCwrSynthesis).not.toHaveBeenCalled();
  });

  it('calls runCwrSynthesis when hash changed', async () => {
    vi.mocked(prisma.issue.findUnique).mockResolvedValue({
      id: 'i1', jiraIssueKey: 'PROJ-1', status: 'Open',
      assigneeId: null, assigneeName: null, priority: null, jiraSiteUrl: 'https://x.com',
    } as any);
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.memorySnapshot.findMany).mockResolvedValue([]);
    vi.mocked(computeSnapshotSetHash).mockReturnValue('new-hash');
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      id: 'cwr1', snapshotSetHash: 'old-hash', isStale: false,
      blockerSummary: null, ownerExternalId: null,
      waitingOnType: null, waitingOnDescription: null,
      nextStep: null, lastJiraStatus: null,
    } as any);
    vi.mocked(runCwrSynthesis).mockResolvedValue({
      currentState: 'In progress',
      ownerDisplayName: null, ownerExternalId: null, ownerSource: null,
      blockerSummary: null, waitingOnType: null, waitingOnDescription: null,
      openQuestions: [], nextStep: null, riskScore: 0.2,
      urgencyReason: null, isStale: false, confidence: 0.8, dataSources: ['jira'],
    });
    vi.mocked(prisma.$transaction).mockImplementation((fn: Function) => fn(prisma));
    vi.mocked(prisma.currentWorkRecord.upsert).mockResolvedValue({ id: 'cwr1' } as any);
    vi.mocked(prisma.meaningfulEvent.createMany).mockResolvedValue({ count: 0 });

    await handleCwrGenerate(makeMessage('stage2_complete'));
    expect(runCwrSynthesis).toHaveBeenCalled();
  });

  it('bypasses hash check for stale_sweep trigger', async () => {
    vi.mocked(prisma.issue.findUnique).mockResolvedValue({
      id: 'i1', jiraIssueKey: 'PROJ-1', status: 'Open',
      assigneeId: null, assigneeName: null, priority: null, jiraSiteUrl: 'https://x.com',
    } as any);
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.memorySnapshot.findMany).mockResolvedValue([]);
    vi.mocked(computeSnapshotSetHash).mockReturnValue('same-hash');
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      id: 'cwr1', snapshotSetHash: 'same-hash', isStale: false,
      blockerSummary: null, ownerExternalId: null,
      waitingOnType: null, waitingOnDescription: null,
      nextStep: null, lastJiraStatus: null,
    } as any);
    vi.mocked(runCwrSynthesis).mockResolvedValue({
      currentState: 'In progress', ownerDisplayName: null, ownerExternalId: null,
      ownerSource: null, blockerSummary: null, waitingOnType: null,
      waitingOnDescription: null, openQuestions: [], nextStep: null,
      riskScore: 0.2, urgencyReason: null, isStale: true, confidence: 0.8, dataSources: [],
    });
    vi.mocked(prisma.$transaction).mockImplementation((fn: Function) => fn(prisma));
    vi.mocked(prisma.currentWorkRecord.upsert).mockResolvedValue({ id: 'cwr1' } as any);
    vi.mocked(prisma.meaningfulEvent.createMany).mockResolvedValue({ count: 0 });

    await handleCwrGenerate(makeMessage('stale_sweep'));
    expect(runCwrSynthesis).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/memory-engine/cwr-generate-handler.test.ts
```

- [ ] **Step 3: Implement `apps/worker/src/handlers/cwr-generate.ts`**

Create `apps/worker/src/handlers/cwr-generate.ts`:

```typescript
import { prisma } from '@remi/db';
import type { CWRGenerateMessage } from '@remi/shared';
import {
  computeSnapshotSetHash,
  runCwrSynthesis,
  diffCwr,
  MODELS,
  PROMPT_VERSIONS,
} from '@remi/memory-engine';
import { createHash } from 'node:crypto';
import { createOpenAiClient } from '@remi/memory-engine';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

function idempKey(cwrId: string, eventType: string, payload: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
  return `cwr:${cwrId}:${eventType}:${hash}`;
}

export async function handleCwrGenerate(message: CWRGenerateMessage): Promise<void> {
  const { issueId, triggerSource } = message.payload;

  // 1. Fetch issue
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      jiraIssueKey: true,
      jiraSiteUrl: true,
      status: true,
      statusCategory: true,
      priority: true,
      assigneeId: true,
      assigneeName: true,
      workspaceId: true,
    },
  });
  if (!issue) {
    console.warn(`[cwr-generate] Issue ${issueId} not found, skipping`);
    return;
  }

  // 2. Fetch memory units and their latest snapshots
  const units = await prisma.memoryUnit.findMany({
    where: { issueId },
    select: { id: true, scopeType: true },
  });

  const snapshots = await Promise.all(
    units.map((u) =>
      prisma.memorySnapshot.findFirst({
        where: { memoryUnitId: u.id },
        orderBy: { version: 'desc' },
        select: { id: true, memoryUnitId: true, version: true, currentSummary: true, updatedAt: true },
      }),
    ),
  ).then((rows) => rows.filter((r): r is NonNullable<typeof r> => r !== null));

  // 3. Compute hash and check for skippable runs
  const jiraFields = {
    status: (issue as any).status ?? null,
    assigneeId: (issue as any).assigneeId ?? null,
    priority: (issue as any).priority ?? null,
  };
  const newHash = computeSnapshotSetHash(
    snapshots.map((s) => ({ memoryUnitId: s.memoryUnitId, version: s.version })),
    jiraFields,
  );

  const existingCwr = await prisma.currentWorkRecord.findUnique({ where: { issueId } });

  if (triggerSource !== 'stale_sweep') {
    if (existingCwr?.snapshotSetHash === newHash) {
      console.log(`[cwr-generate] Hash unchanged for ${issueId}, skipping`);
      return;
    }
  } else {
    // stale_sweep: only proceed if isStale would change or staleSince would change
    // We still run synthesis to detect staleness by time — proceed always
  }

  // 4. Synthesise
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const openAiClient = createOpenAiClient(config.OPENAI_API_KEY, MODELS.STAGE4_CWR);

  const synthesis = await runCwrSynthesis(
    {
      issueId: issue.id,
      jiraIssueKey: issue.jiraIssueKey,
      jiraStatus: (issue as any).status ?? null,
      jiraAssigneeId: (issue as any).assigneeId ?? null,
      jiraAssigneeName: (issue as any).assigneeName ?? null,
      jiraPriority: (issue as any).priority ?? null,
      snapshots,
    },
    openAiClient,
  );

  // stale_sweep: if nothing stale-related changed, skip the write
  if (triggerSource === 'stale_sweep' && existingCwr) {
    if (existingCwr.isStale === synthesis.isStale) {
      console.log(`[cwr-generate] Stale sweep: no staleness change for ${issueId}, skipping`);
      return;
    }
  }

  // 5. Determine freshest source timestamp
  const sourceFreshnessAt =
    snapshots.length > 0
      ? snapshots.reduce((latest, s) => (s.updatedAt > latest ? s.updatedAt : latest), snapshots[0].updatedAt)
      : new Date();

  // 6. Build new CWR data
  const newCwrData = {
    workspaceId: issue.workspaceId,
    currentState: synthesis.currentState,
    ownerDisplayName: synthesis.ownerDisplayName,
    ownerExternalId: synthesis.ownerExternalId,
    ownerSource: synthesis.ownerSource,
    blockerSummary: synthesis.blockerSummary,
    blockerDetectedAt: synthesis.blockerSummary && !existingCwr?.blockerSummary ? new Date() : (existingCwr?.blockerDetectedAt ?? null),
    waitingOnType: synthesis.waitingOnType,
    waitingOnDescription: synthesis.waitingOnDescription,
    openQuestions: synthesis.openQuestions,
    nextStep: synthesis.nextStep,
    riskScore: synthesis.riskScore,
    urgencyReason: synthesis.urgencyReason,
    isStale: synthesis.isStale,
    staleSince: synthesis.isStale && !existingCwr?.isStale ? new Date() : (synthesis.isStale ? existingCwr?.staleSince : null),
    lastJiraStatus: (issue as any).status ?? null,
    lastJiraAssigneeId: (issue as any).assigneeId ?? null,
    sourceMemoryUnitIds: units.map((u) => u.id),
    sourceSnapshotIds: snapshots.map((s) => s.id),
    snapshotSetHash: newHash,
    dataSources: synthesis.dataSources,
    sourceFreshnessAt,
    confidence: synthesis.confidence,
    modelId: MODELS.STAGE4_CWR,
    promptVersion: PROMPT_VERSIONS.STAGE4_CWR,
  };

  // 7. Diff for MeaningfulEvents
  const prevForDiff = existingCwr ?? {
    id: 'new', blockerSummary: null, ownerExternalId: null,
    waitingOnType: null, waitingOnDescription: null, nextStep: null,
    isStale: false, lastJiraStatus: null,
  };
  const nextForDiff = {
    id: existingCwr?.id ?? 'new',
    blockerSummary: synthesis.blockerSummary,
    ownerExternalId: synthesis.ownerExternalId,
    waitingOnType: synthesis.waitingOnType,
    waitingOnDescription: synthesis.waitingOnDescription,
    nextStep: synthesis.nextStep,
    isStale: synthesis.isStale,
    lastJiraStatus: (issue as any).status ?? null,
  };

  const primarySource = triggerSource === 'jira_change' ? 'jira' : 'slack';
  const eventDrafts = diffCwr(prevForDiff as any, nextForDiff as any, primarySource);

  // 8. Transaction: upsert CWR + insert events
  await prisma.$transaction(async (tx) => {
    const upserted = await tx.currentWorkRecord.upsert({
      where: { issueId },
      create: { issueId, ...newCwrData },
      update: {
        ...newCwrData,
        lastMeaningfulChangeAt: eventDrafts.length > 0 ? new Date() : existingCwr?.lastMeaningfulChangeAt,
        lastMeaningfulChangeSummary:
          eventDrafts.length > 0
            ? eventDrafts[0].summary
            : existingCwr?.lastMeaningfulChangeSummary,
      },
    });

    if (eventDrafts.length > 0) {
      await tx.meaningfulEvent.createMany({
        data: eventDrafts.map((e) => ({
          id: uuidv4(),
          issueId,
          workspaceId: issue.workspaceId,
          idempotencyKey: idempKey(upserted.id, e.eventType, e.metadata),
          ...e,
          metadata: e.metadata ?? null,
          occurredAt: e.occurredAt,
        })),
        skipDuplicates: true,
      });
    }

    // ProductEvent instrumentation
    await tx.productEvent.create({
      data: {
        id: uuidv4(),
        workspaceId: issue.workspaceId,
        eventType: 'cwr_generated',
        metadata: { issueId, triggerSource, eventsEmitted: eventDrafts.length },
        occurredAt: new Date(),
      },
    });
  });

  console.log(
    `[cwr-generate] CWR updated for ${issue.jiraIssueKey} — ${eventDrafts.length} events emitted`,
  );
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/memory-engine/cwr-generate-handler.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/handlers/cwr-generate.ts tests/memory-engine/cwr-generate-handler.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): add cwr-generate handler with synthesis, diff, and transaction write

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire trigger — enqueue CWR after stage 2 completes

**Files:**
- Modify: `apps/worker/src/handlers/memory-jobs.ts`

- [ ] **Step 1: Modify `handleMemorySnapshot` to enqueue CWR**

In `apps/worker/src/handlers/memory-jobs.ts`, update `handleMemorySnapshot` to accept `queue` and enqueue `cwr_generate` when the unit has an `issueId`:

Change the function signature from:
```typescript
export async function handleMemorySnapshot(
  message: MemorySnapshotMessage,
  _queue: IQueueProducer,
): Promise<void> {
```
To:
```typescript
export async function handleMemorySnapshot(
  message: MemorySnapshotMessage,
  queue: IQueueProducer,
): Promise<void> {
```

After the existing `runSnapshot` call (after line `if (isNew) { console.log(...) }`), add:

```typescript
  // Trigger CWR generation when the memory unit is linked to an issue
  if (unit?.issueId) {
    await queue.send(QueueNames.CWR_GENERATE, {
      id: uuidv4(),
      idempotencyKey: `cwr-generate:${unit.issueId}:snapshot:${snapshot.id}`,
      workspaceId: message.workspaceId,
      timestamp: new Date().toISOString(),
      type: 'cwr_generate',
      payload: { issueId: unit.issueId, triggerSource: 'stage2_complete' },
    });
  }
```

Also add `import { QueueNames } from '@remi/shared';` and `import { v4 as uuidv4 } from 'uuid';` if not already present.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @remi/worker typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/handlers/memory-jobs.ts
git commit -m "$(cat <<'EOF'
feat(worker): enqueue cwr-generate after stage 2 snapshot completes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire trigger — enqueue CWR on Jira status/assignee/priority change

**Files:**
- Modify: `apps/worker/src/handlers/jira-events.ts`

- [ ] **Step 1: Enqueue CWR on relevant Jira events**

In `apps/worker/src/handlers/jira-events.ts`, find where Jira webhook events are handled (the function handling `JiraEventMessage`). After the existing processing that handles `issue_updated` events, add a CWR trigger when the event involves status, assignee, or priority:

```typescript
// After existing Jira event processing, add CWR trigger for relevant field changes:
import { QueueNames } from '@remi/shared';
import { v4 as uuidv4 } from 'uuid';

// Inside handleJiraEvent, after any existing logic that processes issue_updated:
// Add this after the issue is identified and its DB record is found:

const CWR_TRIGGER_EVENTS = new Set(['issue_updated', 'status_changed', 'assignee_changed', 'priority_changed']);

if (CWR_TRIGGER_EVENTS.has(message.payload.kind) && message.payload.issueId) {
  // Look up the internal issue ID
  const issue = await prisma.issue.findFirst({
    where: { jiraIssueKey: message.payload.issueKey, workspaceId: message.workspaceId },
    select: { id: true },
  });
  if (issue) {
    await queue.send(QueueNames.CWR_GENERATE, {
      id: uuidv4(),
      idempotencyKey: `cwr-generate:${issue.id}:jira:${message.payload.issueKey}:${message.timestamp}`,
      workspaceId: message.workspaceId,
      timestamp: new Date().toISOString(),
      type: 'cwr_generate',
      payload: { issueId: issue.id, triggerSource: 'jira_change' },
    });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @remi/worker typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/handlers/jira-events.ts
git commit -m "$(cat <<'EOF'
feat(worker): trigger cwr-generate on Jira status/assignee/priority changes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Register consumer and stale sweep in `apps/worker/src/index.ts`

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Import and register the CWR consumer**

In `apps/worker/src/index.ts`:

Add import:
```typescript
import { handleCwrGenerate } from './handlers/cwr-generate.js';
import type { CWRGenerateMessage } from '@remi/shared';
```

Add to `queueUrls` in the `SqsQueueAdapter` config:
```typescript
[QueueNames.CWR_GENERATE]: config.SQS_CWR_GENERATE_URL ?? '',
```

Add consumer registration after the existing `startConsumer` calls:
```typescript
startConsumer(queue, QueueNames.CWR_GENERATE, (msg) =>
  handleCwrGenerate(msg as CWRGenerateMessage),
);
```

- [ ] **Step 2: Add the stale sweep interval**

After the Gmail sync block, add:

```typescript
// ─── CWR stale sweep ──────────────────────────────────────────────────────────
// Runs on a configurable interval (default 1 hour).
// Sends a stale_sweep trigger for every issue that has a CWR.
// The handler re-evaluates staleness and only writes if isStale changed.

async function runStaleSweep() {
  const cwrs = await prisma.currentWorkRecord.findMany({
    select: { issueId: true, workspaceId: true },
  });
  for (const cwr of cwrs) {
    await queue.send(QueueNames.CWR_GENERATE, {
      id: uuidv4(),
      idempotencyKey: `cwr-stale-sweep:${cwr.issueId}:${Math.floor(Date.now() / 3_600_000)}`,
      workspaceId: cwr.workspaceId,
      timestamp: new Date().toISOString(),
      type: 'cwr_generate',
      payload: { issueId: cwr.issueId, triggerSource: 'stale_sweep' },
    });
  }
  console.log(`[stale-sweep] Enqueued ${cwrs.length} CWR sweep jobs`);
}

if (config.CWR_STALE_SWEEP_INTERVAL_MS > 0) {
  runStaleSweep().catch((err: unknown) =>
    console.error('[stale-sweep] Initial sweep error:', err),
  );
  setInterval(() => {
    runStaleSweep().catch((err: unknown) =>
      console.error('[stale-sweep] Sweep error:', err),
    );
  }, config.CWR_STALE_SWEEP_INTERVAL_MS);
}
```

Add `import { prisma } from '@remi/db';` and `import { v4 as uuidv4 } from 'uuid';` if not already present.

- [ ] **Step 3: Typecheck and run tests**

```bash
pnpm --filter @remi/worker typecheck
pnpm test -- tests/memory-engine/
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "$(cat <<'EOF'
feat(worker): register cwr-generate consumer and stale sweep interval

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
