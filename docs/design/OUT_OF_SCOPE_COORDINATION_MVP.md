# Out of Scope — Coordination MVP

Canonical list of features intentionally deferred while Remi pivots toward issue-scoped ticket reconstruction and Current Work Records. Revisit these only after a narrow guided pilot proves value in support, implementation, customer operations, or escalation-heavy workflows.

Some items here are deferred to later phases, not permanently rejected. Outbound email drafting, monitoring-triggered ticket creation, richer docs automation, and broader connector work may become P1/P2 once the Current Work Record loop is validated.

---

## Enterprise Email / Magic Link Auth

V1 uses Slack OAuth as the sole authentication path for the web platform (`apps/web`). Users sign in with their Slack identity, which maps them to the correct workspace automatically.

A magic link / email-based auth flow would allow enterprise customers to log in without requiring Slack installation first — useful for non-Slack-first enterprise procurement paths and eventual SSO/SAML integration (Okta, Azure AD, Google Workspace IdP). This would likely pair with email domain → workspace mapping so users get routed to the right account automatically.

**Why deferred:** Slack OAuth covers all pilot and early-stage customers who are by definition Slack-first. Email auth adds identity verification flows, token storage, email delivery infrastructure, and domain → workspace routing logic. Over-engineered for the current stage.

**Trigger:** An enterprise prospect or design partner cannot use Slack OAuth as their primary auth path, or sales conversations reveal that auth method is a blocker.

---

## Outlook / Exchange Integration
Microsoft Graph API with MSAL app-only auth (Exchange admin consent). The batch sync and DB pattern would be nearly identical to Gmail — roughly 1–2 days of work once Gmail is proven. Deferred until Gmail is validated with real users.

## Real-time Gmail Push (Pub/Sub)
Gmail push notifications require a Google Cloud Pub/Sub topic + subscription, a new API push endpoint (`POST /gmail/webhook`), push token verification, and calling `users.watch()` per mailbox every 7 days (subscriptions expire). Current 5-minute batch sync is sufficient for v1.

## Email Attachment Parsing
Extracting text from PDF, Word, or image attachments for issue key detection. Requires binary fetches and document parsing libraries. `bodySnippet` covers the common case — most issue keys appear in the email body or subject.

## Email Composing / Sending via Remi
Allowing Remi to draft or send emails on behalf of users. Out of scope — Remi is a read-only observer of email context.

## Jira Forge Migration
Migrating from Jira Connect (descriptor URL) to Atlassian Forge (hosted, no self-managed lifecycle). Atlassian ended new Connect installs via descriptor URL on March 31 2026. Forge migration requires rewriting the Jira package as a Forge app with a different auth model. Deferred — existing Connect installs continue to work.

## Gmail historyId-based Incremental Sync
Using Gmail's `users.history.list` API with a stored `historyId` for truly incremental syncs (only fetch messages since last run). Current approach re-queries the last 24h on every run and deduplicates by `gmailMessageId`. Slightly less efficient but operationally simpler. Can be added as an optimization later.

## Per-email Slack Interactive Buttons
Adding "Link it" / "Dismiss" action buttons to the Slack DM suggestion. Currently the DM is informational — users follow up with `/link-ticket`. Requires Slack Block Kit interactive components and an interactions handler.

---

## Current Work Record Pipeline: Quality-Premium Model Upgrade (Gemini + GPT-5.4 mini)

V1 ships with Gemini 2.5 Flash-Lite (Stage 1) + GPT-5.4 nano (Stages 2–3) at ~$0.55/workspace/month. When customer volume grows enough to justify eval investment and a ~55% cost increase, upgrade Stage 3 (/brief and snapshot synthesis) from `gpt-5.4-nano` to `gpt-5.4-mini`.

**Estimated cost at upgrade**: ~$0.85/workspace/month.

**What changes**: Stage 3 model ID in `packages/memory-engine/src/models.ts` from `gpt-5.4-nano` ($0.20/$1.25 per 1M) to `gpt-5.4-mini` ($0.75/$4.50 per 1M). Stage 1 (Gemini Flash-Lite) and Stage 4 (GPT-5.4 escalation) are unchanged.

**Trigger**: Run a held-out eval set comparing `/brief` quality between `gpt-5.4-nano` and `gpt-5.4-mini`. Only upgrade if nano's output has measurable quality gaps on real customer threads AND monthly AI spend across the customer base makes the absolute cost delta worthwhile (at 1,000 workspaces: ~$300/month extra).

## Current Work Record Pipeline: Live vs. Backfill Queue Split

Replace the single `memory-extract` queue with two explicit queues:
- `memory-extract-live` — new Slack/Jira/email events (priority)
- `memory-extract-backfill` — admin "Sync Jira Content" and historical backfills

**Why deferred**: Requires provisioning two new SQS queues in AWS, new env vars, updated consumer registration, and routing logic in event handlers. The immediate issue (4 concurrent free-tier jobs colliding) is resolved by startup jitter + retry jitter in `gemini.ts`. Queue splitting adds operational priority guarantees at scale, not a correctness fix.

**Trigger**: When live `/brief` responsiveness is noticeably degraded by a concurrent admin backfill run. At current scale (single workspace, ~4 Jira events per sync), the single queue is adequate.

## Current Work Record Pipeline: Transient 429 -> Delayed Re-enqueue Instead of Dead-Letter

When Gemini Stage 1 exhausts all in-client retries (4 attempts), the job currently dead-letters permanently. A better model:
1. Classify exhausted-retry failures as `TransientRateLimitError`
2. Re-enqueue the same `memory-extract` job with a `DelaySeconds` offset (SQS) rather than dead-lettering
3. Track a bounded retry counter on the message; only dead-letter after `MAX_RETRY_COUNT` transient failures

**Why deferred**: Requires extending `IQueueProducer` with a `sendDelayed` method, implementing timer-based delay in `MemoryQueueAdapter` and `DelaySeconds` in `SqsQueueAdapter`, a fresh idempotency key per retry (to bypass SQS FIFO dedup), and a retry counter on the message envelope. Minimum a day of careful work. The jitter fix prevents exhaustion in the first place for the current load.

**Trigger**: If dead-lettered memory extract jobs appear in the errors panel after the jitter fix is deployed. At that point the re-enqueue path becomes necessary.

## Current Work Record Pipeline: DeepSeek Digest/Summary (Cheapest Confirmed Route)

If cost pressure becomes significant at scale, DeepSeek-V3.2 (`deepseek-chat`) with prompt caching is the cheapest confirmed route for Stages 2–3. Estimated cost: ~$0.50/workspace/month (vs $0.55 for current stack).

**Why deferred**: Quality on user-facing summaries is unvalidated. DeepSeek's output pricing ($0.42/1M) is extremely competitive but the model has not been run through an eval against Remi's actual thread data. Do not put it in front of customers without eval data.

**Trigger**: Build an eval dataset of ≥50 real Slack thread samples with known expected summary outputs. If DeepSeek matches GPT-5.4 nano quality and the infra complexity of a third vendor is acceptable, swap Stages 2–3.

---

## FAQ / Q&A Bot over Confluence + Slack + Jira

Answering natural-language questions ("What was decided about the auth system?") by pulling from all three sources. Requires a RAG pipeline (vector embeddings, chunking strategy), a permissions-aware retrieval layer, and LLM answer synthesis. This is a different product layer, not a side feature of doc generation.

**Why deferred**: Infrastructure commitment (vector store, embedding API, retrieval scoring) is disproportionate to V1 scope. The FAQ bot requires Confluence to be read back into Remi first — itself out of scope for V1.

**Trigger**: When a paying customer explicitly requests search/Q&A over Current Work Records or issue evidence, not just issue reconstruction and doc generation.

## Forge-native Confluence UI (Macros / Panels)

Building embedded UI components inside Confluence (page macros, issue panels, sidebar apps) using Atlassian Forge. Atlassian Connect is deprecated December 2026; Forge is the successor.

**Why deferred**: V1 Confluence integration is write-only via REST API — no embedded UI is needed. Forge development adds significant overhead (Forge CLI, hosting, review/approval process). Invest in Forge UI only when there is customer demand for in-Confluence interaction beyond page generation.

**Trigger**: A customer asks for a Confluence panel or macro, or the write-only flow generates insufficient adoption.

## Two-way Confluence Sync (Read Confluence → Remi)

Reading Confluence pages back into Remi as an additional context source for memory units and doc generation. Non-trivial: page hierarchy, space-level permission inheritance, content parsing from Confluence storage format (XHTML), attachment handling, incremental sync via page version history.

**Why deferred**: V1 is write-only — Remi produces docs, not consumes them. Reading back is the right direction for making Confluence a first-class data source alongside Slack and Jira, but it is a separate architectural track.

**Trigger**: When customers report that Remi-generated docs are missing context that lives in existing Confluence pages (e.g., ADRs, runbooks).

## Global Workspace Document Library

A workspace-wide upload store where documents are uploaded once and automatically referenced in relevant Remi outputs. Requires RAG/vector retrieval for relevance scoring across the library — otherwise every query includes every uploaded document regardless of relevance.

**Why deferred**: Issue-scoped contextual upload covers the core use case without RAG. Global search requires a vector DB and chunking pipeline that adds new infrastructure and latency.

**Trigger**: When users upload documents to many different issues and ask for a unified search experience across them.

## Uploaded Documents as Higher Truth

Treating an uploaded document as canonical truth that automatically outranks live Jira, Slack, or Gmail evidence.

**Why deferred**: Contextual uploads are pinned reference inputs. They should enrich retrieval and generation, but they should not override fresher live evidence by default. If an uploaded brief conflicts with a Jira status change, Slack decision, or customer email, Remi should surface the conflict rather than silently choose the upload.

**Trigger**: Only revisit if design partners explicitly need admin-configurable source precedence and can explain how conflicts should be resolved in their workflow.

## Multiple Context Documents per Issue

Allowing many uploaded docs on a single issue, with ordering, labels, selective inclusion, and relevance scoring.

**Why deferred**: One pinned reference doc per issue is enough to validate the use case. Multiple docs require a more mature retrieval layer and UI.

**Trigger**: Users repeatedly upload replacement docs because they need several distinct references attached to one issue.

## Full RBAC + Scope Access Enforcement

Role assignments, membership models, and enforced query scoping across all repos — so that members of one scope cannot read another scope's issues, memory units, summaries, contextual uploads, or Confluence pages.

**Why deferred**: The current implementation has a department-flavoured grouping foundation, but the strategic primitive should be `Scope` / `scopeId` because the boundary may be a team, workflow, project, department, or pilot boundary. Enforcement requires RBAC middleware, role assignment UI, and scoped filtering in every repository function.

**Trigger**: When an enterprise prospect or compliance requirement mandates data isolation between scopes, not just labelling.

## PostgreSQL Row Level Security (RLS)

Enforcing tenant and scope boundaries at the database level using Postgres RLS policies, so that application-layer bugs cannot leak cross-tenant or cross-scope data.

**Why deferred**: Application-level `workspaceId` and future `scopeId` filtering is correct for the current stage. RLS requires policy definition per table, Prisma connection pooling adjustments, and careful testing of policy interactions with transactions.

**Trigger**: Enterprise procurement with compliance requirements for DB-level data isolation.

## PRD / RFC / Runbook Generation

Generating product requirements documents, architecture decision records, or operational runbooks from Remi's assembled context.

**Why deferred**: PRDs and RFCs require upstream intentional context (market requirements, design constraints, stakeholder sign-off) that does not exist in Slack threads, Jira events, or email. Runbooks require operational knowledge (system topology, alert thresholds) not captured by Remi. Attempting these doc types with available context produces misleading outputs. Supported V1 types: handoff, summary, escalation brief.

**Trigger**: If contextual uploads capture sufficient intentional context that PRD/RFC drafting becomes tractable, re-evaluate with a clearly labelled LLM drafting layer.

## LLM Prose Rewriting (V1b)

Adding an optional LLM-generated narrative section to Confluence pages — e.g., an "Executive Summary" written in natural language from the structured data.

**Why deferred**: Mixing deterministic and LLM-generated sections in a single doc creates two quality tiers with no clear boundary for the user, breaks full source traceability, and produces inconsistent output across re-runs. Introduce LLM output as a deliberate V2 feature with proper framing ("AI-drafted — verify before sharing"), not as an optional flag in the deterministic V1 page writer.

**Trigger**: When users consistently report that the structured output is too dense and request a prose summary layer.

## Notion Integration

Same architecture as Confluence (OAuth, page create API, `IssueDocContext` renderer) but targeting Notion workspaces instead of Confluence. Relevant for companies running Jira + Notion rather than Jira + Confluence.

**Why deferred**: Confluence has priority because it shares the Atlassian ecosystem with Jira. The `IssueDocContext` → renderer design in `packages/confluence/src/page-writer.ts` is intentionally decoupled; adding a Notion adapter is a new output format, not a rewrite.

**Trigger**: A customer on the Jira + Notion stack requests it, or Confluence adoption data shows the majority of prospects use Notion.

## Multi-database / Schema-per-Scope Architecture

Provisioning separate Postgres databases or schemas per scope or workspace for hard data isolation.

**Why deferred**: Row-level filtering by `workspaceId` / `scopeId` is the correct multi-tenancy model. Separate databases multiply operational overhead (connection pools, migrations, backups, monitoring) with no correctness advantage for the current scale.

**Trigger**: Strict data-residency compliance requirements (e.g., data must physically reside in a different region or account per customer) that cannot be satisfied by row-level isolation.

## Cross-scope Context Merging

Automatically combining context from multiple scopes when generating a doc for cross-functional work (for example, an escalation that crosses Support, Implementation, Engineering, and a vendor-facing workflow).

**Why deferred**: The scope boundary is a trust boundary. Auto-merging across scopes reintroduces the data-jumbling problem that scoped workflows are meant to solve. Manual linking by an authorized user is the right V1 affordance.

**Trigger**: When users regularly request that escalation or handoff docs pull from two scopes, and the manual linking workflow is too cumbersome.

## Confidence Level for Observation Resolution

When an observation (blocker, decision, open question) is marked as superseded and displayed as strikethrough in a Confluence doc, Remi currently uses a binary model: the memory pipeline either supersedes an observation or it does not, based on whether new information contradicts it. A confidence level system would add a scored signal to each supersession — distinguishing between high-confidence resolutions (engineer explicitly confirmed a fix in an email) and low-confidence ones (the issue simply stopped being mentioned). Strikethrough items would carry a confidence indicator, and users could choose a threshold below which items remain active rather than struckthrough.

**Why deferred**: The binary supersession model is sufficient for V1 — the goal is to show meaningful evolution between doc versions, not to provide an auditable confidence score. Adding confidence scoring requires changes to the memory extraction pipeline (LLM must output a confidence value alongside the supersession decision), a new column on observations, and UI treatment in the Confluence renderer. Validate that users actually care about false-positive strikethroughs before building the scoring system.

**Trigger**: When users report that struckthrough items were not actually resolved, or when sales prospects ask how Remi decides when something is fixed.

## Scanned / Image PDF Extraction

Extracting text from PDFs that are scans or contain image-only pages (no embedded text layer). Requires an OCR pipeline (Tesseract, Google Vision API, or AWS Textract).

**Why deferred**: `pdf-parse` covers text-based PDFs which represent the majority of real-world project briefs, architecture docs, and notes. Scanned PDFs are edge-case inputs that add OCR infrastructure complexity and significant latency.

**Trigger**: Users report upload failures on documents that are clearly scans (e.g., photographed whiteboards, printed-and-scanned contracts).
