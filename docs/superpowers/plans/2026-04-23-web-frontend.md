# Web Frontend (`apps/web`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `apps/web` — the new Next.js 15 user-facing coordination platform. Includes Slack OAuth login, session management, and five pages: Work Queue, Issue Detail, Approval Inbox, Workflow Settings, and Login.

**Architecture:** Next.js App Router server components. Session cookie validated in Next.js middleware on every request — redirect to `/login` if invalid. API calls go through a thin server-side `api-client.ts` that attaches session context and calls `apps/api /web/*`. `apps/web` holds its own Slack OAuth credentials (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`) for the identity flow — separate from `apps/api`'s bot credentials. During development, `src/lib/mock-data.ts` seeds realistic fixture data matching `packages/shared/src/types/api.ts` types so the frontend can be built without a running API.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, `packages/shared` types

**Dependency:** Requires `packages/shared/src/types/api.ts` from Plan 1 Task 3. All other backend plans (2–4) can run in parallel — use mock data until the real API is ready.

---

### Task 1: Scaffold `apps/web`

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/.env.local.example`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@remi/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3002",
    "build": "next build",
    "start": "next start --port 3002",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf .next"
  },
  "dependencies": {
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@remi/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@remi/shared'],
};

export default config;
```

- [ ] **Step 4: Create `apps/web/.env.local.example`**

```
# Slack identity OAuth (separate from bot credentials in apps/api)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

# Shared secret with apps/api (must match apps/api INTERNAL_TOKEN)
INTERNAL_TOKEN=dev-internal-token

# apps/api base URL (for server-side API calls)
API_URL=http://localhost:3000

# Own base URL (used for OAuth callback URL construction)
WEB_URL=http://localhost:3002

# Set to 'true' to use mock data instead of real API
USE_MOCK_DATA=true
```

Copy `.env.local.example` to `.env.local` and fill in values.

- [ ] **Step 5: Install dependencies and verify**

```bash
pnpm --filter @remi/web install
pnpm --filter @remi/web typecheck
```
Note: typecheck will fail until Next.js generates its types (after the first `next dev` run or `next build`). That's expected at this stage.

- [ ] **Step 6: Create Tailwind config**

Create `apps/web/tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

Create `apps/web/postcss.config.js`:
```javascript
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "$(cat <<'EOF'
feat(web): scaffold apps/web Next.js app with Tailwind

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create mock data fixtures

**Files:**
- Create: `apps/web/src/lib/mock-data.ts`

- [ ] **Step 1: Create mock data matching the shared API types**

Create `apps/web/src/lib/mock-data.ts`:

```typescript
import type {
  IssueQueueItem,
  IssueDetail,
  MeaningfulEventItem,
  EvidenceItem,
  ProposalItem,
  ScopeItem,
  WorkflowConfigItem,
  CWRSummary,
  CWRDetail,
} from '@remi/shared';

const mockCwrSummary: CWRSummary = {
  currentState: 'Waiting on vendor to provide updated API credentials following security incident.',
  ownerDisplayName: 'Sarah Chen',
  ownerExternalId: 'U01ABC123',
  blockerSummary: 'Vendor has not responded in 8 days. Security team is blocking prod deploy.',
  waitingOnType: 'external_vendor',
  waitingOnDescription: 'Acme Payments for updated API credentials',
  nextStep: 'Escalate to vendor account manager and loop in legal',
  riskScore: 0.82,
  urgencyReason: 'Vendor silent 8 days, prod deploy blocked',
  isStale: false,
  staleSince: null,
  sourceFreshnessAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  lastMeaningfulChangeAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  lastMeaningfulChangeSummary: 'Owner changed from James to Sarah via Slack',
  dataSources: ['slack', 'jira', 'email'],
  confidence: 0.87,
};

const mockCwrDetail: CWRDetail = {
  ...mockCwrSummary,
  ownerSource: 'slack',
  blockerDetectedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  openQuestions: [
    {
      content: 'Does the new credential set require a new OAuth flow or just a key rotation?',
      source: 'slack',
      askedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      ownerName: 'James Liu',
      status: 'open',
    },
  ],
  generatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
};

export const mockIssues: IssueQueueItem[] = [
  {
    id: 'issue-1',
    jiraIssueKey: 'SUP-4821',
    jiraIssueUrl: 'https://example.atlassian.net/browse/SUP-4821',
    title: 'Payment gateway credentials expired — prod deploy blocked',
    status: 'In Progress',
    priority: 'High',
    scopeId: 'scope-1',
    scopeName: 'Customer Support',
    cwr: mockCwrSummary,
    queueSection: 'needs_action',
    pendingProposalCount: 1,
  },
  {
    id: 'issue-2',
    jiraIssueKey: 'IMP-339',
    jiraIssueUrl: 'https://example.atlassian.net/browse/IMP-339',
    title: 'Enterprise onboarding — data migration failing on large tenants',
    status: 'In Progress',
    priority: 'Medium',
    scopeId: 'scope-2',
    scopeName: 'Implementation',
    cwr: {
      currentState: 'Migration script fails for tenants with >50k records. Root cause identified.',
      ownerDisplayName: 'James Liu',
      ownerExternalId: 'U02DEF456',
      blockerSummary: null,
      waitingOnType: 'internal_team',
      waitingOnDescription: 'Platform team for database limit increase',
      nextStep: 'Submit platform request ticket by EOD',
      riskScore: 0.45,
      urgencyReason: 'Customer go-live scheduled for Friday',
      isStale: false,
      staleSince: null,
      sourceFreshnessAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      lastMeaningfulChangeAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastMeaningfulChangeSummary: 'Root cause confirmed in Slack thread',
      dataSources: ['slack', 'jira'],
      confidence: 0.91,
    },
    queueSection: 'recently_changed',
    pendingProposalCount: 0,
  },
  {
    id: 'issue-3',
    jiraIssueKey: 'ESC-112',
    jiraIssueUrl: 'https://example.atlassian.net/browse/ESC-112',
    title: 'Enterprise customer SLA breach — response SLA missed by 3 hours',
    status: 'Open',
    priority: 'Critical',
    scopeId: 'scope-1',
    scopeName: 'Customer Support',
    cwr: {
      currentState: 'SLA breached. Customer is escalating to C-suite. Awaiting management approval to offer credit.',
      ownerDisplayName: 'Maria Santos',
      ownerExternalId: 'U03GHI789',
      blockerSummary: 'Approval from VP Customer Success needed before offering credit',
      waitingOnType: 'approval',
      waitingOnDescription: 'VP Customer Success approval for $2k credit',
      nextStep: 'Send approval request to VP CS via email',
      riskScore: 0.91,
      urgencyReason: 'C-suite escalation, SLA already breached',
      isStale: false,
      staleSince: null,
      sourceFreshnessAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      lastMeaningfulChangeAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      lastMeaningfulChangeSummary: 'Blocker created: VP approval needed',
      dataSources: ['slack', 'email'],
      confidence: 0.93,
    },
    queueSection: 'needs_action',
    pendingProposalCount: 0,
  },
];

export const mockIssueDetail: IssueDetail = {
  id: 'issue-1',
  jiraIssueKey: 'SUP-4821',
  jiraIssueUrl: 'https://example.atlassian.net/browse/SUP-4821',
  title: 'Payment gateway credentials expired — prod deploy blocked',
  status: 'In Progress',
  statusCategory: 'indeterminate',
  priority: 'High',
  issueType: 'Bug',
  scopeId: 'scope-1',
  scopeName: 'Customer Support',
  cwr: mockCwrDetail,
};

export const mockTimeline: MeaningfulEventItem[] = [
  {
    id: 'evt-1',
    eventType: 'blocker_created',
    summary: 'Blocker detected: Vendor has not responded in 8 days. Security team is blocking prod deploy.',
    source: 'slack',
    sourceRef: null,
    sourceUrl: null,
    actorName: 'Sarah Chen',
    occurredAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    metadata: { blocker: 'Vendor unresponsive' },
  },
  {
    id: 'evt-2',
    eventType: 'owner_changed',
    summary: 'Owner changed from James Liu to Sarah Chen via Slack',
    source: 'slack',
    sourceRef: null,
    sourceUrl: null,
    actorName: null,
    occurredAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    metadata: { from: 'James Liu', to: 'Sarah Chen' },
  },
  {
    id: 'evt-3',
    eventType: 'status_changed',
    summary: 'Jira status changed from Open to In Progress',
    source: 'jira',
    sourceRef: null,
    sourceUrl: 'https://example.atlassian.net/browse/SUP-4821',
    actorName: null,
    occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { from: 'Open', to: 'In Progress' },
  },
];

export const mockEvidence: EvidenceItem[] = [
  {
    id: 'obs-1',
    category: 'blocker',
    content: 'Vendor Acme Payments has not responded to our credential rotation request sent 8 days ago.',
    confidence: 0.92,
    sourceApp: 'slack',
    state: 'active',
    extractedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    citationUrls: [],
  },
  {
    id: 'obs-2',
    category: 'action_item',
    content: 'Sarah to escalate to vendor account manager and loop in legal by EOD Thursday.',
    confidence: 0.88,
    sourceApp: 'slack',
    state: 'active',
    extractedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    citationUrls: [],
  },
];

export const mockProposals: ProposalItem[] = [
  {
    id: 'prop-1',
    issueId: 'issue-1',
    issueKey: 'SUP-4821',
    issueTitle: 'Payment gateway credentials expired — prod deploy blocked',
    target: 'jira_comment',
    status: 'pending_approval',
    payload: {
      jiraIssueKey: 'SUP-4821',
      commentBody:
        'Update (2026-04-24): Sarah Chen is now the owner. Vendor Acme Payments has been unresponsive for 8 days. Escalation to vendor account manager and legal is the next step. Security team blocking prod deploy pending credential resolution.',
    },
    confidence: 0.87,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

export const mockScopes: ScopeItem[] = [
  { id: 'scope-1', name: 'Customer Support', type: 'team' },
  { id: 'scope-2', name: 'Implementation', type: 'team' },
];

export const mockWorkflowConfigs: WorkflowConfigItem[] = [
  {
    id: 'wc-1',
    scopeId: 'scope-1',
    workflowKey: 'vendor-escalation',
    name: 'Vendor Escalation',
    includedChannelIds: ['C01ABC', 'C02DEF'],
    includedJiraProjects: ['SUP', 'ESC'],
    includedMailboxes: ['support@example.com'],
    writebackEnabled: true,
    approvalRequired: true,
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/mock-data.ts
git commit -m "$(cat <<'EOF'
feat(web): add mock data fixtures matching shared API types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Session library and API client

**Files:**
- Create: `apps/web/src/lib/session.ts`
- Create: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Create `apps/web/src/lib/session.ts`**

```typescript
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'remi_session';
const STATE_COOKIE = 'remi_oauth_state';

export function getSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}

export function setSessionCookie(token: string, expiresAt: Date): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export function setStateCookie(state: string): void {
  cookies().set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
}

export function getAndClearStateCookie(): string | undefined {
  const value = cookies().get(STATE_COOKIE)?.value;
  cookies().delete(STATE_COOKIE);
  return value;
}

export async function validateSession(): Promise<
  { userId: string; workspaceId: string } | null
> {
  const token = getSessionToken();
  if (!token) return null;

  try {
    const res = await fetch(`${process.env.API_URL}/internal/sessions/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_TOKEN!,
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ userId: string; workspaceId: string }>;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create `apps/web/src/lib/api-client.ts`**

```typescript
import type {
  IssueQueueItem,
  IssueDetail,
  MeaningfulEventItem,
  EvidenceItem,
  ProposalItem,
  ScopeItem,
  WorkflowConfigItem,
  QueueSection,
  ProposalEditRequest,
  WorkflowConfigCreateRequest,
  TriggerActionRequest,
  TriggerActionResponse,
} from '@remi/shared';
import * as mock from './mock-data.js';

const USE_MOCK = process.env.USE_MOCK_DATA === 'true';

function apiHeaders(userId: string, workspaceId: string) {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Token': process.env.INTERNAL_TOKEN!,
    'X-User-Id': userId,
    'X-Workspace-Id': workspaceId,
  };
}

async function apiFetch<T>(
  path: string,
  userId: string,
  workspaceId: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${process.env.API_URL}/web${path}`, {
    ...init,
    headers: { ...apiHeaders(userId, workspaceId), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Issues ──────────────────────────────────────────────────────────────────

export async function getIssueQueue(
  userId: string,
  workspaceId: string,
  opts: { section?: QueueSection | 'all'; scopeId?: string; page?: number; limit?: number },
): Promise<{ items: IssueQueueItem[]; total: number }> {
  if (USE_MOCK) {
    const items = opts.section && opts.section !== 'all'
      ? mock.mockIssues.filter((i) => i.queueSection === opts.section)
      : mock.mockIssues;
    return { items, total: items.length };
  }
  const params = new URLSearchParams();
  if (opts.section) params.set('section', opts.section);
  if (opts.scopeId) params.set('scopeId', opts.scopeId);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  return apiFetch(`/issues?${params}`, userId, workspaceId);
}

export async function getIssueDetail(
  userId: string,
  workspaceId: string,
  issueId: string,
): Promise<IssueDetail> {
  if (USE_MOCK) return mock.mockIssueDetail;
  return apiFetch(`/issues/${issueId}`, userId, workspaceId);
}

export async function getIssueTimeline(
  userId: string,
  workspaceId: string,
  issueId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<{ events: MeaningfulEventItem[]; nextCursor: string | null }> {
  if (USE_MOCK) return { events: mock.mockTimeline, nextCursor: null };
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.before) params.set('before', opts.before);
  return apiFetch(`/issues/${issueId}/timeline?${params}`, userId, workspaceId);
}

export async function getIssueEvidence(
  userId: string,
  workspaceId: string,
  issueId: string,
): Promise<{ items: EvidenceItem[] }> {
  if (USE_MOCK) return { items: mock.mockEvidence };
  return apiFetch(`/issues/${issueId}/evidence`, userId, workspaceId);
}

export async function triggerAction(
  userId: string,
  workspaceId: string,
  issueId: string,
  req: TriggerActionRequest,
): Promise<TriggerActionResponse> {
  if (USE_MOCK) return { proposalId: null, message: `Mock action: ${req.type}` };
  return apiFetch(`/issues/${issueId}/actions`, userId, workspaceId, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ─── Proposals ───────────────────────────────────────────────────────────────

export async function getProposals(
  userId: string,
  workspaceId: string,
  opts: { status?: string; page?: number } = {},
): Promise<{ items: ProposalItem[]; total: number }> {
  if (USE_MOCK) return { items: mock.mockProposals, total: mock.mockProposals.length };
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.page) params.set('page', String(opts.page));
  return apiFetch(`/proposals?${params}`, userId, workspaceId);
}

export async function approveProposal(
  userId: string,
  workspaceId: string,
  proposalId: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) return { ok: true };
  return apiFetch(`/proposals/${proposalId}/approve`, userId, workspaceId, { method: 'POST' });
}

export async function rejectProposal(
  userId: string,
  workspaceId: string,
  proposalId: string,
  reason?: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) return { ok: true };
  return apiFetch(`/proposals/${proposalId}/reject`, userId, workspaceId, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function editProposal(
  userId: string,
  workspaceId: string,
  proposalId: string,
  data: ProposalEditRequest,
): Promise<ProposalItem> {
  if (USE_MOCK) return { ...mock.mockProposals[0], payload: { ...mock.mockProposals[0].payload, commentBody: data.commentBody } };
  return apiFetch(`/proposals/${proposalId}`, userId, workspaceId, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Scopes + Workflow Configs ───────────────────────────────────────────────

export async function getScopes(
  userId: string,
  workspaceId: string,
): Promise<{ items: ScopeItem[] }> {
  if (USE_MOCK) return { items: mock.mockScopes };
  return apiFetch('/scopes', userId, workspaceId);
}

export async function getWorkflowConfigs(
  userId: string,
  workspaceId: string,
  scopeId?: string,
): Promise<{ items: WorkflowConfigItem[] }> {
  if (USE_MOCK) return { items: mock.mockWorkflowConfigs };
  const params = scopeId ? `?scopeId=${scopeId}` : '';
  return apiFetch(`/workflow-configs${params}`, userId, workspaceId);
}

export async function createWorkflowConfig(
  userId: string,
  workspaceId: string,
  data: WorkflowConfigCreateRequest,
): Promise<WorkflowConfigItem> {
  if (USE_MOCK) return { id: 'wc-new', ...data };
  return apiFetch('/workflow-configs', userId, workspaceId, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/session.ts apps/web/src/lib/api-client.ts
git commit -m "$(cat <<'EOF'
feat(web): add session library and API client with mock fallback

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Auth route handlers and middleware

**Files:**
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/auth/slack/route.ts`
- Create: `apps/web/src/app/auth/slack/callback/route.ts`
- Create: `apps/web/src/app/auth/logout/route.ts`

- [ ] **Step 1: Create `apps/web/src/middleware.ts`**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/auth/slack', '/auth/slack/callback'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('remi_session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Validate session with apps/api
  try {
    const res = await fetch(`${process.env.API_URL}/internal/sessions/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_TOKEN!,
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('remi_session');
      return response;
    }

    const { userId, workspaceId } = (await res.json()) as { userId: string; workspaceId: string };
    const next = NextResponse.next();
    next.headers.set('x-user-id', userId);
    next.headers.set('x-workspace-id', workspaceId);
    return next;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Create `apps/web/src/app/auth/slack/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

export async function GET(): Promise<NextResponse> {
  const state = randomBytes(16).toString('hex');
  const clientId = process.env.SLACK_CLIENT_ID!;
  const redirectUri = `${process.env.WEB_URL}/auth/slack/callback`;

  // Store state in short-lived HttpOnly cookie
  cookies().set('remi_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'identity.basic',
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`,
  );
}
```

- [ ] **Step 3: Create `apps/web/src/app/auth/slack/callback/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
  }

  // Verify state
  const storedState = cookies().get('remi_oauth_state')?.value;
  cookies().delete('remi_oauth_state');
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/login?error=state_mismatch', request.url));
  }

  // Exchange code for Slack user identity
  const redirectUri = `${process.env.WEB_URL}/auth/slack/callback`;
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    ok: boolean;
    authed_user?: { id: string };
    team?: { id: string };
    error?: string;
  };

  if (!tokenData.ok || !tokenData.authed_user?.id || !tokenData.team?.id) {
    console.error('[auth] Slack token exchange failed:', tokenData.error);
    return NextResponse.redirect(new URL('/login?error=slack_auth_failed', request.url));
  }

  // Resolve identity to a Remi session
  const resolveRes = await fetch(`${process.env.API_URL}/internal/sessions/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': process.env.INTERNAL_TOKEN!,
    },
    body: JSON.stringify({
      slackUserId: tokenData.authed_user.id,
      slackTeamId: tokenData.team.id,
    }),
  });

  if (!resolveRes.ok) {
    const body = (await resolveRes.json()) as { error?: string };
    const msg = encodeURIComponent(body.error ?? 'Access denied');
    return NextResponse.redirect(new URL(`/login?error=${msg}`, request.url));
  }

  const { token } = (await resolveRes.json()) as { token: string };

  const response = NextResponse.redirect(new URL('/queue', request.url));
  response.cookies.set('remi_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });
  return response;
}
```

- [ ] **Step 4: Create `apps/web/src/app/auth/logout/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = cookies().get('remi_session')?.value;

  if (token) {
    // Revoke on the API side (fire-and-forget is acceptable here)
    fetch(`${process.env.API_URL}/internal/sessions/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_TOKEN!,
      },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('remi_session');
  return response;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/app/auth/
git commit -m "$(cat <<'EOF'
feat(web): add Slack OAuth flow, session middleware, and logout handler

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Root layout and login page

**Files:**
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: Create root layout**

Create `apps/web/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `apps/web/src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Remi — Work Queue',
  description: 'Operational coordination platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create login page**

Create `apps/web/src/app/login/page.tsx`:
```typescript
import { redirect } from 'next/navigation';
import { validateSession } from '@/lib/session';

interface Props {
  searchParams: { error?: string };
}

export default async function LoginPage({ searchParams }: Props) {
  const session = await validateSession();
  if (session) redirect('/queue');

  const errorMessages: Record<string, string> = {
    oauth_failed: 'Sign-in was cancelled or failed. Please try again.',
    state_mismatch: 'Security check failed. Please try signing in again.',
    slack_auth_failed: 'Could not authenticate with Slack. Please try again.',
  };

  const errorMsg = searchParams.error
    ? (errorMessages[searchParams.error] ?? decodeURIComponent(searchParams.error))
    : null;

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="max-w-sm w-full space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Remi</h1>
          <p className="mt-2 text-gray-500">Operational coordination platform</p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
            {errorMsg}
          </div>
        )}

        <a
          href="/auth/slack"
          className="flex items-center justify-center gap-3 w-full bg-[#4A154B] hover:bg-[#611f69] text-white font-medium py-3 px-6 rounded-lg transition-colors"
        >
          <SlackIcon />
          Sign in with Slack
        </a>
      </div>
    </main>
  );
}

function SlackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 122.8 122.8" xmlns="http://www.w3.org/2000/svg">
      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#e01e5a"/>
      <path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#e01e5a"/>
      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36c5f0"/>
      <path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36c5f0"/>
      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2eb67d"/>
      <path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2eb67d"/>
      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ecb22e"/>
      <path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ecb22e"/>
    </svg>
  );
}
```

- [ ] **Step 3: Verify the app starts**

```bash
pnpm --filter @remi/web dev
```

Navigate to `http://localhost:3002/login`. Expected: login page with "Sign in with Slack" button renders without errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/login/ apps/web/src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(web): add root layout and login page with Slack OAuth button

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Work Queue page (`/queue`)

**Files:**
- Create: `apps/web/src/app/queue/page.tsx`
- Create: `apps/web/src/components/queue-card.tsx`

- [ ] **Step 1: Create the queue card component**

Create `apps/web/src/components/queue-card.tsx`:

```typescript
import type { IssueQueueItem } from '@remi/shared';
import Link from 'next/link';

interface Props {
  issue: IssueQueueItem;
}

function RiskBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? 'bg-red-100 text-red-700' :
    pct >= 60 ? 'bg-orange-100 text-orange-700' :
    'bg-gray-100 text-gray-600';
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>Risk {pct}</span>;
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, string> = { slack: 'Slack', jira: 'Jira', email: 'Email' };
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
      {labels[source] ?? source}
    </span>
  );
}

export function QueueCard({ issue }: Props) {
  const cwr = issue.cwr;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <a
              href={issue.jiraIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-blue-600 hover:underline"
            >
              {issue.jiraIssueKey}
            </a>
            {issue.scopeName && (
              <span className="text-xs text-gray-400">{issue.scopeName}</span>
            )}
          </div>
          <Link
            href={`/issues/${issue.id}`}
            className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2"
          >
            {issue.title}
          </Link>

          {cwr && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-600 line-clamp-2">{cwr.currentState}</p>

              {cwr.blockerSummary && (
                <p className="text-xs text-red-600 font-medium">
                  ⚠ {cwr.blockerSummary}
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-1">
                {cwr.ownerDisplayName && (
                  <span className="text-xs text-gray-500">Owner: {cwr.ownerDisplayName}</span>
                )}
                {cwr.urgencyReason && (
                  <span className="text-xs text-orange-600">{cwr.urgencyReason}</span>
                )}
              </div>

              {cwr.nextStep && (
                <p className="text-xs text-gray-500">Next: {cwr.nextStep}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {cwr && <RiskBadge score={cwr.riskScore} />}
          {cwr && (
            <div className="flex gap-1">
              {cwr.dataSources.map((s) => <SourceBadge key={s} source={s} />)}
            </div>
          )}
          {issue.pendingProposalCount > 0 && (
            <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">
              {issue.pendingProposalCount} pending
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/issues/${issue.id}`}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded transition-colors"
        >
          View
        </Link>
        {issue.pendingProposalCount > 0 && (
          <Link
            href={`/approvals`}
            className="text-xs bg-yellow-50 hover:bg-yellow-100 text-yellow-700 px-3 py-1 rounded transition-colors"
          >
            Approve
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the queue page**

Create `apps/web/src/app/queue/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getIssueQueue } from '@/lib/api-client';
import { QueueCard } from '@/components/queue-card';
import Link from 'next/link';
import type { QueueSection } from '@remi/shared';

const SECTIONS: { key: QueueSection; label: string }[] = [
  { key: 'needs_action', label: 'Needs Action' },
  { key: 'awaiting_approval', label: 'Awaiting Approval' },
  { key: 'recently_changed', label: 'Recently Changed' },
];

interface Props {
  searchParams: { section?: string };
}

export default async function QueuePage({ searchParams }: Props) {
  const h = headers();
  const userId = h.get('x-user-id');
  const workspaceId = h.get('x-workspace-id');
  if (!userId || !workspaceId) redirect('/login');

  const section = (searchParams.section as QueueSection) ?? 'needs_action';
  const { items, total } = await getIssueQueue(userId, workspaceId, { section });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Work Queue</h1>
        <nav className="flex gap-2">
          <Link href="/approvals" className="text-sm text-gray-500 hover:text-gray-700">Approvals</Link>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">Settings</Link>
          <form action="/auth/logout" method="post">
            <button type="submit" className="text-sm text-gray-400 hover:text-gray-600">Sign out</button>
          </form>
        </nav>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={`/queue?section=${s.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              section === s.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </Link>
        ))}
        <Link
          href="/queue?section=all"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            section === ('all' as any)
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All
        </Link>
      </div>

      {/* Issue list */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No issues in this section</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((issue) => (
            <QueueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 text-right">{total} total</p>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders**

With `USE_MOCK_DATA=true` in `.env.local`, start the app and navigate to `http://localhost:3002/queue`. Expected: three issue cards visible in Needs Action tab, section tabs work.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/queue/ apps/web/src/components/queue-card.tsx
git commit -m "$(cat <<'EOF'
feat(web): add Work Queue page with section tabs and issue cards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Issue Detail page (`/issues/[id]`)

**Files:**
- Create: `apps/web/src/app/issues/[id]/page.tsx`
- Create: `apps/web/src/components/timeline.tsx`
- Create: `apps/web/src/components/evidence-panel.tsx`

- [ ] **Step 1: Create the timeline component**

Create `apps/web/src/components/timeline.tsx`:

```typescript
import type { MeaningfulEventItem } from '@remi/shared';

const EVENT_LABELS: Record<string, string> = {
  blocker_created: '⚠ Blocker detected',
  blocker_removed: '✓ Blocker cleared',
  owner_changed: '→ Owner changed',
  waiting_on_changed: '⏳ Waiting on changed',
  next_step_changed: '▶ Next step updated',
  external_reply_received: '✉ External reply',
  status_changed: '↔ Status changed',
  stale_detected: '🔴 Gone stale',
  stale_resolved: '🟢 Stale resolved',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  events: MeaningfulEventItem[];
  nextCursor: string | null;
}

export function Timeline({ events, nextCursor }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 py-4">No timeline events yet.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((evt) => (
        <div key={evt.id} className="flex gap-3">
          <div className="w-1 bg-gray-200 rounded-full shrink-0 mt-1" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-gray-700">
                {EVENT_LABELS[evt.eventType] ?? evt.eventType}
              </span>
              <span className="text-xs text-gray-400">{relativeTime(evt.occurredAt)}</span>
              {evt.actorName && (
                <span className="text-xs text-gray-400">by {evt.actorName}</span>
              )}
            </div>
            <p className="text-sm text-gray-600">{evt.summary}</p>
            {evt.sourceUrl && (
              <a
                href={evt.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                View source →
              </a>
            )}
          </div>
        </div>
      ))}
      {nextCursor && (
        <button className="text-xs text-blue-500 hover:underline">Load more</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the evidence panel component**

Create `apps/web/src/components/evidence-panel.tsx`:

```typescript
import type { EvidenceItem } from '@remi/shared';

const CATEGORY_LABELS: Record<string, string> = {
  blocker: 'Blocker',
  action_item: 'Action Item',
  decision: 'Decision',
  open_question: 'Open Question',
  status_update: 'Status Update',
  owner_update: 'Owner Update',
  risk: 'Risk',
};

interface Props {
  items: EvidenceItem[];
}

export function EvidencePanel({ items }: Props) {
  const active = items.filter((i) => i.state === 'active');

  if (active.length === 0) {
    return <p className="text-sm text-gray-400">No active evidence.</p>;
  }

  return (
    <div className="space-y-2">
      {active.map((item) => (
        <div key={item.id} className="text-sm border border-gray-100 rounded p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500">
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
            {item.sourceApp && (
              <span className="text-xs text-gray-400">{item.sourceApp}</span>
            )}
            <span className="text-xs text-gray-300">
              {Math.round(item.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-gray-700">{item.content}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the Issue Detail page**

Create `apps/web/src/app/issues/[id]/page.tsx`:

```typescript
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getIssueDetail, getIssueTimeline, getIssueEvidence } from '@/lib/api-client';
import { Timeline } from '@/components/timeline';
import { EvidencePanel } from '@/components/evidence-panel';
import Link from 'next/link';

interface Props {
  params: { id: string };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800">{value}</dd>
    </div>
  );
}

export default async function IssueDetailPage({ params }: Props) {
  const h = headers();
  const userId = h.get('x-user-id');
  const workspaceId = h.get('x-workspace-id');
  if (!userId || !workspaceId) redirect('/login');

  const [issue, timelineData, evidenceData] = await Promise.all([
    getIssueDetail(userId, workspaceId, params.id),
    getIssueTimeline(userId, workspaceId, params.id, { limit: 20 }),
    getIssueEvidence(userId, workspaceId, params.id),
  ]);

  if (!issue) notFound();

  const cwr = issue.cwr;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/queue" className="text-sm text-gray-400 hover:text-gray-600">← Work Queue</Link>
      </div>

      <div className="flex items-start gap-2 mb-6">
        <a
          href={issue.jiraIssueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-blue-600 hover:underline"
        >
          {issue.jiraIssueKey}
        </a>
        {issue.status && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {issue.status}
          </span>
        )}
        {issue.priority && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {issue.priority}
          </span>
        )}
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-6">{issue.title}</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {/* Current Work Record */}
          {cwr ? (
            <Section title="Current Status">
              <p className="text-sm text-gray-700 mb-3">{cwr.currentState}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="Owner" value={cwr.ownerDisplayName} />
                <Field label="Risk" value={`${Math.round(cwr.riskScore * 100)}/100`} />
                <Field label="Blocker" value={cwr.blockerSummary} />
                <Field label="Waiting on" value={cwr.waitingOnDescription} />
                <Field label="Next step" value={cwr.nextStep} />
                <Field label="Urgency" value={cwr.urgencyReason} />
              </dl>
              {cwr.openQuestions.filter((q) => q.status === 'open').length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Open Questions</p>
                  {cwr.openQuestions
                    .filter((q) => q.status === 'open')
                    .map((q, i) => (
                      <p key={i} className="text-xs text-gray-600">• {q.content}</p>
                    ))}
                </div>
              )}
            </Section>
          ) : (
            <Section title="Current Status">
              <p className="text-sm text-gray-400">No CWR generated yet.</p>
            </Section>
          )}

          {/* Timeline */}
          <Section title="Timeline">
            <Timeline events={timelineData.events} nextCursor={timelineData.nextCursor} />
          </Section>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <Section title="Evidence">
            <EvidencePanel items={evidenceData.items} />
          </Section>

          {cwr && (
            <Section title="Data Sources">
              <div className="flex gap-1 flex-wrap">
                {cwr.dataSources.map((s) => (
                  <span key={s} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                    {s}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Updated {new Date(cwr.sourceFreshnessAt).toLocaleString()}
              </p>
              <p className="text-xs text-gray-300 mt-1">
                Confidence {Math.round(cwr.confidence * 100)}%
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the page renders**

Navigate to `http://localhost:3002/issues/issue-1` (mock data). Expected: CWR fields, timeline, and evidence panel all visible.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/issues/ apps/web/src/components/timeline.tsx apps/web/src/components/evidence-panel.tsx
git commit -m "$(cat <<'EOF'
feat(web): add Issue Detail page with CWR, timeline, and evidence panel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Approval Inbox page (`/approvals`)

**Files:**
- Create: `apps/web/src/app/approvals/page.tsx`

- [ ] **Step 1: Create the Approval Inbox page**

Create `apps/web/src/app/approvals/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getProposals } from '@/lib/api-client';
import Link from 'next/link';
import type { ProposalItem } from '@remi/shared';
import { ApprovalRow } from './approval-row';

export default async function ApprovalsPage() {
  const h = headers();
  const userId = h.get('x-user-id');
  const workspaceId = h.get('x-workspace-id');
  if (!userId || !workspaceId) redirect('/login');

  const { items, total } = await getProposals(userId, workspaceId, { status: 'pending_approval' });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approval Inbox</h1>
        <Link href="/queue" className="text-sm text-gray-400 hover:text-gray-600">← Work Queue</Link>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No proposals pending approval</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((proposal) => (
            <ApprovalRow
              key={proposal.id}
              proposal={proposal}
              userId={userId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">{total} pending</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the client-side `ApprovalRow` component**

Create `apps/web/src/app/approvals/approval-row.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { ProposalItem } from '@remi/shared';
import { approveProposal, rejectProposal, editProposal } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

interface Props {
  proposal: ProposalItem;
  userId: string;
  workspaceId: string;
}

export function ApprovalRow({ proposal, userId, workspaceId }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [commentBody, setCommentBody] = useState(proposal.payload.commentBody);
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    if (editing) {
      await editProposal(userId, workspaceId, proposal.id, { commentBody });
    }
    await approveProposal(userId, workspaceId, proposal.id);
    router.refresh();
  }

  async function handleReject() {
    setLoading(true);
    await rejectProposal(userId, workspaceId, proposal.id);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <a
            href={`/issues/${proposal.issueId}`}
            className="text-xs font-mono text-blue-600 hover:underline"
          >
            {proposal.issueKey}
          </a>
          <p className="text-sm text-gray-700 mt-0.5">{proposal.issueTitle}</p>
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {Math.round(proposal.confidence * 100)}% confidence
        </span>
      </div>

      {editing ? (
        <textarea
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          rows={4}
          className="w-full text-sm border border-gray-300 rounded p-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      ) : (
        <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 font-mono whitespace-pre-wrap">
          {commentBody}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          {editing ? 'Save & Approve' : 'Approve'}
        </button>
        <button
          onClick={() => setEditing(!editing)}
          disabled={loading}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
        >
          {editing ? 'Cancel edit' : 'Edit'}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders**

Navigate to `http://localhost:3002/approvals`. Expected: mock proposal visible with Approve / Edit / Reject buttons. Edit should toggle textarea. Approve should trigger api-client call.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/approvals/
git commit -m "$(cat <<'EOF'
feat(web): add Approval Inbox page with inline edit and approve/reject actions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Workflow Settings page (`/settings`)

**Files:**
- Create: `apps/web/src/app/settings/page.tsx`

- [ ] **Step 1: Create the Settings page**

Create `apps/web/src/app/settings/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getWorkflowConfigs, getScopes } from '@/lib/api-client';
import Link from 'next/link';
import type { WorkflowConfigItem } from '@remi/shared';

function ConfigCard({ config }: { config: WorkflowConfigItem }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-gray-800">{config.name}</p>
          <p className="text-xs text-gray-400 font-mono">{config.workflowKey}</p>
        </div>
        <div className="flex gap-2">
          {config.writebackEnabled && (
            <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">
              Writeback on
            </span>
          )}
          {config.approvalRequired && (
            <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded">
              Approval required
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
        <div>
          <p className="font-medium mb-1">Channels</p>
          {config.includedChannelIds.length > 0
            ? config.includedChannelIds.map((id) => <p key={id} className="font-mono">{id}</p>)
            : <p className="text-gray-300">None</p>}
        </div>
        <div>
          <p className="font-medium mb-1">Jira Projects</p>
          {config.includedJiraProjects.length > 0
            ? config.includedJiraProjects.map((p) => <p key={p} className="font-mono">{p}</p>)
            : <p className="text-gray-300">None</p>}
        </div>
        <div>
          <p className="font-medium mb-1">Mailboxes</p>
          {config.includedMailboxes.length > 0
            ? config.includedMailboxes.map((m) => <p key={m}>{m}</p>)
            : <p className="text-gray-300">None</p>}
        </div>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const h = headers();
  const userId = h.get('x-user-id');
  const workspaceId = h.get('x-workspace-id');
  if (!userId || !workspaceId) redirect('/login');

  const [{ items: configs }, { items: scopes }] = await Promise.all([
    getWorkflowConfigs(userId, workspaceId),
    getScopes(userId, workspaceId),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workflow Settings</h1>
        <Link href="/queue" className="text-sm text-gray-400 hover:text-gray-600">← Work Queue</Link>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-600">
          {configs.length} workflow configuration{configs.length !== 1 ? 's' : ''}
        </h2>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No workflow configurations yet.</p>
          <p className="text-sm mt-1">Contact your admin to set up workflow scopes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <ConfigCard key={config.id} config={config} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Navigate to `http://localhost:3002/settings`. Expected: mock workflow config card visible.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/settings/
git commit -m "$(cat <<'EOF'
feat(web): add Workflow Settings page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Add `apps/web` to pnpm workspace and turbo

**Files:**
- Verify: `pnpm-workspace.yaml`
- Verify: `turbo.json`

- [ ] **Step 1: Verify workspace includes `apps/web`**

Check `pnpm-workspace.yaml` at the repo root. It should contain:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```
The `apps/*` glob covers `apps/web` automatically. If the file uses explicit paths, add `apps/web`.

- [ ] **Step 2: Verify turbo.json includes web**

Check `turbo.json` — if it lists apps by name, add `@remi/web`. If it uses `**`, it's covered automatically.

- [ ] **Step 3: Install dependencies from root**

```bash
pnpm install
```

- [ ] **Step 4: Typecheck from root**

```bash
pnpm --filter @remi/web typecheck
```
Expected: no errors (after first `next dev` or `next build` generates types).

- [ ] **Step 5: Final integration test — verify mock flow end-to-end**

With `USE_MOCK_DATA=true`:
1. `http://localhost:3002/login` → renders login page
2. `http://localhost:3002/queue` → redirects to `/login` (no session)
3. After sign-in (or manually setting cookie for dev), `/queue` → shows mock issues in Needs Action tab
4. Click on an issue → Issue Detail page with CWR, timeline, evidence
5. `/approvals` → shows mock proposal with Approve/Edit/Reject
6. `/settings` → shows mock workflow config

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "$(cat <<'EOF'
feat(web): wire apps/web into pnpm workspace — coordination platform frontend complete

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
