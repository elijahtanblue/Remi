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
