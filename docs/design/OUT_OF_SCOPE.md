# Out of Scope — Remi V0.x

Features deferred from the current roadmap. Revisit after core Gmail integration is stable.

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

## Autonomous Memory: Quality-Premium Model Upgrade (Gemini + GPT-5.4 mini)

V1 ships with Gemini 2.5 Flash-Lite (Stage 1) + GPT-5.4 nano (Stages 2–3) at ~$0.55/workspace/month. When customer volume grows enough to justify eval investment and a ~55% cost increase, upgrade Stage 3 (/brief and snapshot synthesis) from `gpt-5.4-nano` to `gpt-5.4-mini`.

**Estimated cost at upgrade**: ~$0.85/workspace/month.

**What changes**: Stage 3 model ID in `packages/memory-engine/src/models.ts` from `gpt-5.4-nano` ($0.20/$1.25 per 1M) to `gpt-5.4-mini` ($0.75/$4.50 per 1M). Stage 1 (Gemini Flash-Lite) and Stage 4 (GPT-5.4 escalation) are unchanged.

**Trigger**: Run a held-out eval set comparing `/brief` quality between `gpt-5.4-nano` and `gpt-5.4-mini`. Only upgrade if nano's output has measurable quality gaps on real customer threads AND monthly AI spend across the customer base makes the absolute cost delta worthwhile (at 1,000 workspaces: ~$300/month extra).

## Autonomous Memory: Live vs. Backfill Queue Split

Replace the single `memory-extract` queue with two explicit queues:
- `memory-extract-live` — new Slack/Jira/email events (priority)
- `memory-extract-backfill` — admin "Sync Jira Content" and historical backfills

**Why deferred**: Requires provisioning two new SQS queues in AWS, new env vars, updated consumer registration, and routing logic in event handlers. The immediate issue (4 concurrent free-tier jobs colliding) is resolved by startup jitter + retry jitter in `gemini.ts`. Queue splitting adds operational priority guarantees at scale, not a correctness fix.

**Trigger**: When live `/brief` responsiveness is noticeably degraded by a concurrent admin backfill run. At current scale (single workspace, ~4 Jira events per sync), the single queue is adequate.

## Autonomous Memory: Transient 429 → Delayed Re-enqueue Instead of Dead-Letter

When Gemini Stage 1 exhausts all in-client retries (4 attempts), the job currently dead-letters permanently. A better model:
1. Classify exhausted-retry failures as `TransientRateLimitError`
2. Re-enqueue the same `memory-extract` job with a `DelaySeconds` offset (SQS) rather than dead-lettering
3. Track a bounded retry counter on the message; only dead-letter after `MAX_RETRY_COUNT` transient failures

**Why deferred**: Requires extending `IQueueProducer` with a `sendDelayed` method, implementing timer-based delay in `MemoryQueueAdapter` and `DelaySeconds` in `SqsQueueAdapter`, a fresh idempotency key per retry (to bypass SQS FIFO dedup), and a retry counter on the message envelope. Minimum a day of careful work. The jitter fix prevents exhaustion in the first place for the current load.

**Trigger**: If dead-lettered memory extract jobs appear in the errors panel after the jitter fix is deployed. At that point the re-enqueue path becomes necessary.

## Autonomous Memory: DeepSeek Digest/Summary (Cheapest Confirmed Route)

If cost pressure becomes significant at scale, DeepSeek-V3.2 (`deepseek-chat`) with prompt caching is the cheapest confirmed route for Stages 2–3. Estimated cost: ~$0.50/workspace/month (vs $0.55 for current stack).

**Why deferred**: Quality on user-facing summaries is unvalidated. DeepSeek's output pricing ($0.42/1M) is extremely competitive but the model has not been run through an eval against Remi's actual thread data. Do not put it in front of customers without eval data.

**Trigger**: Build an eval dataset of ≥50 real Slack thread samples with known expected summary outputs. If DeepSeek matches GPT-5.4 nano quality and the infra complexity of a third vendor is acceptable, swap Stages 2–3.
