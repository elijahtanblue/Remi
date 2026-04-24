# Remi Founder Pack

> Singular source of truth for Remi's product strategy, scope, ICP, roadmap priorities, and positioning. Other strategy docs are derived references, archives, evidence, or implementation notes.

## Purpose
This document is the singular source of truth for Remi's strategic redirection, MVP feature scope, competitive landscape, and design principles.

It is written for three audiences:
1. Founder and leadership alignment
2. Coding AI / vibe coding implementation guidance
3. Design partner and pilot planning

This version assumes Remi is no longer being built as a generic memory layer, Slack helper, or PM ticket updater.

Remi is now being defined as:

**The coordination layer for messy issues.**

More specifically:

**Remi shows the real status of an issue when the important updates are scattered across Jira, Slack, and email, then helps the team take the next action.**

---

# Document 1: Feature Truth and Product Build Spec

## 1. Core Product Thesis

Remi should not be built as:
- a generic AI memory layer
- a broad company search tool
- a summarizer
- a Slack add-on
- a PM replacement
- a standup replacement
- an autonomous agent that silently changes systems

Remi should be built as:
- an issue-scoped coordination product
- a maintained current work record for messy issues
- a tool that identifies what needs action
- a tool that helps teams move stalled work forward
- a system that turns fragmented context into clear next steps

### Canonical user problem
A team has a ticket or issue where:
- Jira is incomplete
- Slack has hidden reasoning or blocker detail
- email contains customer, vendor, or escalation context
- ownership is unclear or changed
- the team is waiting on another person, team, or company
- someone asks: "What is actually happening here?"

### Canonical Remi output
For each issue, Remi must answer:
- what is happening now
- what changed recently
- who owns it now
- what is blocked
- what are we waiting on
- what evidence matters
- what should happen next

That artifact is called the **Current Work Record**.

---

## 2. Product Shape

Remi should have three product surfaces.

### A. Slack surface
Use Slack for:
- issue linking
- quick brief retrieval
- action notifications
- lightweight approvals
- nudges and chase-ups
- surfacing changes where work is already being discussed

Slack is the fast surface, not the full home of the product.

### B. Jira surface
Use Jira for:
- issue identity / anchor
- formal system-of-record context
- controlled writeback
- embedded issue panel

Jira is the formal anchor, not the decision engine.

### C. Remi web platform
This should become the actual home of the product.

It must not become a generic dashboard.

It should be a focused coordination workspace containing:
- work queue of issues needing action
- issue detail page with current work record
- evidence timeline
- action center / approval center
- workflow settings and scope controls

---

## 3. Product Model

### Unit of work
The product unit is **one issue**.

Not:
- one user
- one team knowledge base
- one dashboard tile
- one chat session

Every major feature should strengthen the issue-level loop.

### Core workflow loop
1. A real issue exists in Jira or is linked from Slack
2. Remi gathers relevant evidence from Slack, Jira, and Gmail
3. Remi synthesizes a Current Work Record
4. User checks Remi instead of manually digging across tools
5. Remi suggests the next step
6. User triggers or approves the next action
7. Work changes, and Remi updates the record
8. The issue remains understandable over time

If a feature does not strengthen this loop, it is not core.

---

## 4. P0, P1, P2 Roadmap

## P0: Must-build for the MVP
These features are required to prove the wedge.

### P0.1 Current Work Record engine
Build the canonical issue-level output with these fields:
- issue key / ID
- title
- current state
- last meaningful change
- owner
- blocker
- waiting on
- open questions
- next step
- freshness timestamp
- confidence where applicable
- citations / source references

### P0.2 Scoped evidence ingestion
Build ingestion only for the scoped pilot workflow.

Required sources:
- linked Slack thread messages
- Jira issue activity and comments
- Gmail messages tied to the issue or pilot mailbox

Do not build broad workspace ingestion as default.

### P0.3 Issue intake and linking
Build these entrypoints:
- Slack `/link-ticket ISSUE-KEY`
- Jira-side attach / open in Remi
- Gmail issue detection suggestion if issue key is found

### P0.4 Web issue detail page
This is the core product page.

Sections:
- current work record header
- meaningful evidence timeline
- source evidence panel
- actions panel
- writeback / approval history

### P0.5 Slack brief
Build a useful and concise issue brief surfaced in Slack.

Must show:
- state
- blocker
- owner
- waiting on
- next step
- freshness

### P0.6 Jira embedded panel
Show the current work record in Jira.

Must show:
- current state
- blocker
- owner
- next step
- freshness
- pending proposal if present

### P0.7 Basic risk / stale detection
Detect at minimum:
- issue stale beyond threshold
- blocker mentioned but no follow-up
- owner unclear
- waiting on external party too long
- Slack active but Jira stale
- Jira changed but Slack thread has no updated context
- important email signal not reflected in the issue record

### P0.8 Controlled writeback proposals
Do not auto-mutate external systems.

At MVP, support:
- draft Jira comment/update proposal
- approve / reject proposal
- audit log for actions taken

### P0.9 Work queue homepage
This is the Remi homepage.

It should be a queue of issues that need action, not a dashboard.

Homepage sections:
- Needs action now
- Recently changed
- Awaiting approval

### P0.10 Pilot workflow scoping and permissions
Add controls for:
- enable per workflow / workspace
- scoped channel inclusion
- scoped mailbox inclusion
- scoped Jira project inclusion
- approvals required for writeback
- auditability

### P0.11 Model routing and confidence policy
Keep the current layered architecture direction:
- raw storage first
- extraction from deltas only
- bounded snapshot updates
- proposal generation after structured state exists
- never silently overwrite high-confidence facts with low-confidence ones

### P0.12 Admin/operator review surface
This should be minimal but useful.

Must include:
- memory unit / issue record list
- proposal list
- issue detail inspection
- rerun action
- approval log

### P0.13 Basic instrumentation
Track these events:
- issue_linked
- brief_viewed
- issue_viewed
- proposal_generated
- proposal_approved
- proposal_rejected
- action_triggered
- stale_issue_detected
- user_checked_remi_before_followup

---

## P1: Makes Remi habit-forming
These features move Remi from useful to regularly used.

### P1.1 Recommended next-step engine
For each issue, Remi should recommend the best next move.

Examples:
- follow up with vendor contact
- confirm owner after reassignment
- request blocker clarification
- post Jira update
- escalate to stakeholder
- ask for technical owner

### P1.2 One-click actions
Build lightweight action triggers from issue page and Slack.

Actions:
- draft Jira update
- draft Slack follow-up
- chase owner
- prepare escalation summary
- mark owner confirmed
- mark blocker resolved
- request clarification

### P1.3 Escalation / handoff pack
Generate a concise, cited pack containing:
- issue summary
- what changed
- current blocker
- owner / waiting on
- unresolved questions
- timeline of meaningful events
- customer/vendor context
- recommended ask / escalation line

### P1.4 Role-based views
Different views for:
- support lead
- implementation lead
- program/delivery manager
- engineering manager
- executive sponsor

### P1.5 Workflow-level risk digest
Send scheduled digests containing:
- stale issues
- unclear owners
- vendor-dependent issues
- blocked issues with no follow-up
- recently changed critical issues

### P1.6 Better risk heuristics
Detect:
- ownership changed without reasoning
- repeated reopen cycles
- email escalation but no recorded action
- waiting on approval too long
- thread sentiment / urgency spikes
- duplicate follow-up loops

### P1.7 Better evidence timeline
Upgrade from raw event list to meaningful event compression.

Meaningful event types:
- blocker created
- blocker removed
- owner changed
- next step changed
- customer/vendor reply received
- decision made
- escalation triggered
- Jira status drift

### P1.8 Action approval inbox
Dedicated surface for:
- pending updates
- pending follow-up drafts
- pending escalation packs
- pending writebacks

### P1.9 Better Gmail handling
Improve:
- issue matching
- conversation threading
- importance scoring
- extraction of customer / vendor escalation signals

### P1.10 Workflow configuration templates
Offer templates for:
- vendor escalation workflow
- support escalation workflow
- implementation handoff workflow
- cross-functional delivery blocker workflow

---

## P2: Expands moat after wedge is proven
These features make sense only after P0/P1 are clearly working.

### P2.1 Additional connectors
Potential later connectors:
- Microsoft Teams
- Outlook / Exchange
- Zendesk
- ServiceNow
- Salesforce
- Notion
- Confluence read/sync or embedded UI
- monitoring/alerting tools such as Datadog / PagerDuty / Sentry only if tightly connected to the issue workflow

### P2.2 Ticket creation from upstream signals
Only after the core wedge is proven.

Examples:
- monitoring alert creates triage draft
- customer escalation email creates intake draft
- repeated blocker pattern proposes new issue

### P2.3 Workflow boards
Purpose-built views for:
- all active escalations
- all vendor-owned blockers
- all stalled handoffs
- all issues waiting on approval

### P2.4 Cross-issue pattern detection
Detect patterns such as:
- repeated vendor delays
- recurring blocker types
- repeated ownership confusion
- common approval bottlenecks
- recurring customer-impact root causes

### P2.5 Playbooks and policy automation
Examples:
- if vendor issue stale > 3 days, suggest escalation template
- if customer escalation signal found, increase urgency score
- if assignee changed but no handoff context exists, ask for owner confirmation

### P2.6 Broader agentic action system
Only after human-in-the-loop trust is strong.

Examples:
- multi-step action chain with review
- coordination nudges across tools
- workflow-specific reminders
- escalation routing suggestions

---

## 5. Main Screens

## Screen 1: Work Queue (Homepage)
Purpose: show only issues needing action.

Sections:
- Needs action now
- Recently changed
- Awaiting approval

Each issue card should show:
- issue key/title
- current state
- blocker
- owner
- waiting on
- freshness
- recommended next step
- source badges (Slack/Jira/Gmail)
- quick action buttons

Quick actions:
- View
- Chase owner
- Draft update
- Prepare escalation
- Approve proposal

## Screen 2: Issue Detail Page
Purpose: the primary operating page.

Top block:
- current state
- owner
- blocker
- waiting on
- next step
- freshness
- risk flag

Middle block:
- meaningful event timeline
- source-linked evidence

Side panel:
- actions
- writeback proposal
- approvals
- citations / confidence

## Screen 3: Approval Inbox
Purpose: human-in-the-loop review center.

Show:
- pending Jira updates
- pending Slack updates
- pending escalation packs
- pending follow-up drafts

Actions:
- approve
- reject
- edit and approve

## Screen 4: Workflow Settings / Scope
Purpose: control what Remi sees and where it acts.

Settings:
- workflow name
- included channels
- included Jira project(s)
- included mailbox(es)
- writeback targets allowed
- approval rules
- retention / scope notes

---

## 6. Detailed Feature Build List for Coding AI

This section is intentionally explicit.

## 6.1 Frontend / UX

### Build now
- work queue homepage
- issue detail page
- approval inbox
- workflow settings page
- Slack brief formatting
- Jira panel UI
- risk badges
- freshness badges
- quick action buttons on queue cards
- compact evidence preview cards
- meaningful timeline view

### Change from current product
- reduce emphasis on generic admin dashboard pages
- move away from summary-history-as-primary-value
- stop making the legacy Slack app surface the main product home
- keep Slack, but make the web issue page the primary deep-work surface

### Deactivate or hide for now
- broad analytics views as primary navigation
- any generic company memory / knowledge pages
- docs-sync marketing surfaces
- broad integration center for non-core connectors
- UI that implies whole-company surveillance or indexing

## 6.2 Backend / Data Model

### Build now
- canonical CurrentWorkRecord model or equivalent snapshot extension
- issue-level urgency / risk state
- waitingOn field with type enum
- nextAction field
- meaningful event model or derivation layer
- proposal model for outbound actions
- approval state model
- workflow scope config model

### Leverage from current system
- MemoryUnit
- MemoryObservation
- MemorySnapshot
- MemoryWritebackProposal
- raw source storage pattern
- worker-driven architecture
- queue abstraction
- storage abstraction
- existing Slack/Jira/Gmail data ingestion
- existing admin routes where useful

### Change from current system
- stop treating all-channel ingestion as default
- stop treating engineering/product teams as the default audience
- make issue-level scope the main product boundary
- treat app home and summary history as secondary surfaces, not the core product

### Deactivate or postpone
- docs-tool sync beyond write-only Confluence drafts
- broad company memory domain modeling
- broad autonomous mutation of Jira
- whole-workspace indexing logic as a default mode

## 6.3 Intelligence / AI Layer

### Build now
- extraction from new deltas only
- issue state synthesis from prior snapshot + deltas
- blocker detection
- owner update detection
- waitingOn classification
- stale/risk scoring
- next-step recommendation generation
- proposal drafting for Jira comments / updates
- evidence ranking by issue relevance

### Leverage from current system
- hybrid model routing
- confidence policy
- prompt/version tracking
- human approval workflow
- bounded snapshot logic

### Change from current system
- optimize prompts for issue triage and coordination, not generic memory
- train heuristics around owner/blocker/waiting-on/next-step
- treat email signals as issue relevance inputs, not generic document memory

### Deactivate or postpone
- broad company Q&A
- open-ended enterprise search interface
- generic chat assistant for everything

## 6.4 Actions Layer

### Build now
- draft Jira comment proposal
- draft Slack follow-up proposal
- prepare escalation summary proposal
- chase-owner action
- mark-owner-confirmed action
- mark-blocker-cleared action

### Build later in P1/P2
- draft outbound email
- auto-create issue from external signal
- multi-step workflow actions
- role-based action recommendations

### Rules
- every action must be reviewable
- every action must point to supporting evidence
- every action must be scoped to a workflow/issue

## 6.5 Integrations

### Keep and strengthen now
- Slack
- Jira
- Gmail / Google Workspace

### Leverage
- current Slack commands
- current Jira panel and writeback direction
- current Gmail issue-key detection and mailbox monitoring

### Change
- product should no longer be sold as Slack-first only
- Gmail should no longer be treated as optional side functionality in the strategy docs
- Jira should remain the anchor, but not the only decision surface

### Deactivate or postpone for now
- Outlook / Exchange
- Notion writeback
- two-way Confluence sync
- Forge-native Confluence macros or panels
- Teams / Outlook parity
- monitoring / alerting tool integrations
- Salesforce / Zendesk unless a design partner absolutely requires it and it supports the pilot workflow directly

## 6.6 Analytics and Instrumentation

### Build now
- issue resolution/triage metrics
- time-to-understand metrics
- action acceptance metrics
- issue view -> action conversion
- stale issue counts
- proposal approval rates

### Do not overbuild yet
- heavy BI dashboards
- broad vanity analytics
- usage heatmaps that do not support pilot learning

## 6.7 Trust / Safety / Governance

### Build now
- issue-scoped source boundaries
- explicit workflow allowlists
- approval gates
- audit logs
- freshness visibility
- citation visibility
- confidence visibility where relevant
- rerun controls
- fail-safe behavior when extraction fails

### Change
- move away from all-Slack-channels-by-default posture
- make narrow scope the default trust model

### Deactivate or hide for now
- any messaging that implies unrestricted indexing
- any automatic external writeback by default

---

## 7. What To Build, Change, Leverage, and Deactivate

## Build now
- Current Work Record
- Work Queue homepage
- Issue Detail Page
- Slack brief
- Jira panel refresh
- Gmail evidence relevance layer
- stale/risk detection
- next-step engine basic version
- writeback proposals
- approval inbox
- workflow scoping controls
- instrumentation for pilot outcomes

## Change now
- product positioning from memory layer to coordination layer
- audience from generic PMs / software teams to cross-team operations / escalations / delivery workflows
- trust model from broad ingestion to narrow scoped workflows
- Slack from home of product to action surface only
- admin from broad operations dashboard to proposal / issue review support layer

## Leverage now
- existing Slack integration and `/link-ticket`
- existing `/brief`
- existing Jira connection and panel
- existing Gmail integration groundwork
- existing worker architecture
- existing raw payload storage
- existing memory data model direction
- existing writeback proposal pattern

## Deactivate / postpone now
- broad company memory search
- docs-tool sync promises
- whole-workspace ingestion by default
- Outlook / Exchange work
- generic dashboard expansion
- monitoring-service ticket creation
- autonomous writeback without approval
- role-agnostic AI chat layer

---

# Document 2: Competitor Map, Wedge, ICP, and Market Focus

## 1. Strategic Summary

Remi is entering a market where search, summarization, and connected-app AI are becoming rapidly commoditized.

The company should not compete head-on as:
- a better enterprise search tool
- a general memory layer
- a generic summarizer
- a broad AI assistant for all work

Remi's best wedge is:

**Issue-scoped coordination for messy, high-friction work where the real status is split across Jira, Slack, and email.**

That wedge is strongest when:
- ownership is unclear
- blocker status is buried in chat
- email contains important external context
- the system of record is incomplete
- handoffs are broken
- a manager or operator needs the real answer fast

---

## 2. Competitor Categories

## Category A: Platform incumbents
These are the biggest strategic threats.

### Atlassian Rovo
**Who they are**
Atlassian's AI platform spanning search, chat, agents, and Teamwork Graph.

**What they do**
- Rovo Search across Atlassian and connected tools
- Rovo Chat based on company data
- Rovo Agents and Skills
- Teamwork Graph as unified data layer
- strong Jira/Confluence adjacency
- increasing AI-powered workflow and Dev tooling

**Why users choose them**
- already in Atlassian stack
- native integration advantage
- trusted enterprise procurement path
- one vendor story

**Why they matter**
They are the most obvious long-term platform threat if Remi stays too close to Jira knowledge/search.

**Where Remi differs**
Remi should not try to beat Rovo at broad search, graph depth, or general AI assistant functionality.
Remi should focus on:
- one issue
- one current work record
- one coordination loop
- one next action
- one approval path

**Threat level**
Very high.

### Microsoft 365 Copilot
**Who they are**
The horizontal enterprise AI layer across M365.

**What they do**
- search and summarize enterprise data in Microsoft 365
- index Jira via connector
- use Teams, Outlook, SharePoint, and docs as context
- enterprise-grade deployment and admin controls

**Why users choose them**
- often already bought or in procurement path
- broad enterprise trust
- natural fit for Outlook/Teams-heavy orgs

**Why they matter**
They can satisfy many generic "search my stuff" and "summarize my work" needs.

**Where Remi differs**
Remi should not compete as a horizontal knowledge assistant.
It should win on:
- issue-specific operational state
- workflow-bound actions
- blocker/owner/waiting-on tracking
- keeping a shared current record, not just answering a question once

**Threat level**
Very high.

### Slack AI
**Who they are**
Slack's native AI features for communication summarization and search.

**What they do**
- channel summaries
- thread summaries
- daily recaps
- AI search / answers
- emerging action-item and message assistance features

**Why users choose them**
- already in Slack
- low friction
- directly reduces message-reading overhead

**Why they matter**
They commoditize basic chat summarization quickly.

**Where Remi differs**
Remi should not be a better Slack summarizer.
It should connect Slack context to issue state, ownership, blockers, and action across Jira and email.

**Threat level**
Medium to high.

### Notion AI / Enterprise Search
**Who they are**
Cross-app workspace and search layer with AI.

**What they do**
- enterprise search across connected apps
- AI summaries and research workflows
- documentation-centric intelligence

**Why users choose them**
- existing doc/wiki hub
- easy cross-source knowledge retrieval

**Why they matter**
They make vague "unified memory" and "search across tools" positioning weaker.

**Where Remi differs**
Remi is not a documentation/workspace AI layer.
Remi is a current work record and action layer for messy issues.

**Threat level**
Medium.

### ServiceNow / Now Assist / AI Agents
**Who they are**
Major enterprise workflow and ITSM platform.

**What they do**
- incident management
- service workflows
- AI agents for support / operations
- automation and orchestration

**Why users choose them**
- operational workflow depth
- enterprise standard in service-heavy environments
- strong ITSM positioning

**Why they matter**
They are a strong threat if Remi drifts too far into generalized incident or service management.

**Where Remi differs**
Remi should initially focus on cross-tool coordination around Jira/Slack/Gmail workflows, not replace enterprise ITSM platforms.

**Threat level**
Medium.

---

## Category B: Workflow-native competitors
These are strong in narrower domains.

### Linear + Linear Agent
**Who they are**
Modern product development platform with strong AI-native posture.

**What they do**
- issue tracking for modern software teams
- agent-based intake and workflow features
- AI-native product development workflows
- growing automation and code intelligence capabilities

**Why users choose them**
- sleek product
- strong startup/product team fit
- native place where work is already tracked

**Why they matter**
They make startup/product-team PM workflows less attractive as Remi's primary wedge.

**Where Remi differs**
Remi should not anchor itself to AI-native software teams already living in Linear.
Instead, it should target workflows with:
- external stakeholders
- messy handoffs
- email-heavy coordination
- non-ideal systems-of-record
- cross-functional enterprise pain

**Threat level**
High for startup PM wedge, lower for the new wedge.

### Jira + Slack integrations / native automation
**Who they are**
Existing direct integrations and lightweight workflow automations.

**What they do**
- link updates between systems
- notifications
- comments and status changes

**Why users choose them**
- already available
- cheap / default
- no new platform needed

**Why they matter**
They satisfy low-complexity workflows and make simple integration stories weak.

**Where Remi differs**
Remi should maintain the issue's real operational state, not just push events between tools.

**Threat level**
Medium.

---

## Category C: Adjacent startups
These are useful comparison points and directional threats.

### Dex / ThirdLayer / browser-first operator AI
**Who they are**
Browser-native AI workspace / operator assistant products.

**What they do**
- cross-app memory
- browser context
- operational agent flows
- broad connected workspace intelligence

**Why users choose them**
- magic feeling
- broad context capture
- works across many apps without deep per-app product design

**Why they matter**
They occupy the "self-driving workspace" / operator AI lane.

**Where Remi differs**
Remi should not become a browser-native personal copilot.
It should remain a shared issue coordination product with explicit workflow scope.

**Threat level**
Medium.

### Kinso AI
**Who they are**
Unified inbox and AI assistant for business messages.

**What they do**
- one inbox for email and messages
- message prioritization
- contact memory
- drafts and reply assistance

**Why users choose them**
- personal communication leverage
- inbox triage
- response assistance

**Why they matter**
They show that "focus on what matters" is a broad, crowded claim.

**Where Remi differs**
Kinso is communication-centric.
Remi should be issue/workflow-centric.
Kinso helps manage conversations.
Remi should help move messy work forward.

**Threat level**
Low to medium if Remi stays issue-scoped. Higher if Remi drifts toward unified inbox behavior.

---

## Category D: The invisible competitor
This is often the strongest real competitor.

### DIY AI workflow
**Who they are**
The user's own stack:
- Claude Code
- MCP integrations
- Granola or meeting transcripts
- copy-paste into Jira/Linear
- personal prompt workflows

**Why users choose them**
- free enough
- flexible
- already good enough for organized AI-native users

**Why they matter**
This is the strongest reason startup/product teams may not buy Remi.

**Where Remi differs**
Remi should create:
- a shared team artifact
- a maintained issue state over time
- a workflow-level queue
- approvals and actions
- less dependence on one user's promptcraft discipline

**Threat level**
Very high in startups, lower in enterprise coordination workflows.

---

## 3. What We Must Not Compete On

Do not compete primarily on:
- generic search
- generic summarization
- broad memory
- standup replacement math
- "save time reading messages"
- unified inbox
- broad company indexing
- PM productivity for software teams

Those areas are either crowded, weakly differentiated, or easy for incumbents to absorb.

---

## 4. Best Wedge

## Strategic wedge
**Issue-scoped coordination for messy, cross-team, or cross-company work where the truth is fragmented across tickets, chat, and email.**

## Plain-English wedge
**Remi tells teams what is really happening on a messy issue, who owns it, what is blocked, and what should happen next.**

## Strongest workflow wedge
The strongest workflow wedge is likely one of:
- vendor escalation management
- support escalation management
- implementation handoff coordination
- cross-functional delivery blocker workflow

These workflows are strong because they naturally have:
- fragmented context
- multiple systems involved
- owner ambiguity
- external dependencies
- urgency and accountability

---

## 5. ICP

## Best early ICP
Teams of roughly 20 to 200 people that already run work across Slack, Jira, and Google Workspace, and regularly lose issue context across internal chat, formal tickets, and customer/vendor email.

Ideal functions:
- support operations
- implementation / delivery
- customer operations
- technical operations
- cross-functional engineering or program teams with escalation pain

## Best buyers
- Head of Support
- Support Operations Lead
- Head of Implementation
- VP Customer Operations
- Program Manager / Delivery Lead
- Head of Engineering for cross-functional escalation workflows
- COO / transformation lead in smaller companies

## Best champions
- escalation manager
- support manager
- implementation lead
- delivery lead
- program manager
- engineering manager close to workflow pain

## Strong pain signals
- people check Jira, Slack, and email separately for status
- ownership changes without visible reasoning
- blockers live in Slack or calls, not the ticket
- vendor/customer context lives outside Jira
- managers ask for status and someone manually reconstructs it
- teams spend too much time chasing work rather than moving it forward

## Not ideal right now
- startup product teams already using Linear + Claude-style workflows
- teams not using Slack/Jira/Gmail together
- companies wanting broad enterprise search
- buyers requiring mature enterprise packaging before a narrow pilot
- teams with little cross-functional or external issue coordination

---

## 6. Best Company Types to Target

### Best targets
- B2B SaaS companies with enterprise customers and implementation/support workflows
- mid-market software or services companies with customer-facing escalations
- regulated or process-heavy enterprises with cross-team delivery pain
- vendor-heavy organizations where technical ownership is hard to identify
- distributed teams across time zones where walking over to someone is not feasible

### Good size range
Start with companies roughly in the 50 to 500 employee range, or focused teams within larger enterprises.

### Good pilot traits
- recurring messy issues every week
- enough pain to provide 10-30 real issues during a pilot
- existing Slack + Jira + Google Workspace setup
- one workflow owner willing to sponsor a scoped pilot

### Avoid first
- tiny startups with clean, fast, highly AI-native workflows
- very large enterprises demanding marketplace-grade packaging from day one
- teams with no email/ticket/chat fragmentation problem

---

## 7. How Remi Must Differentiate

Remi must be clear that it is not:
- replacing Rovo
- replacing Copilot
- replacing Slack AI
- replacing Notion
- replacing ITSM

It is doing something narrower and more operationally specific.

### Differentiation pillars
1. **Issue-scoped, not company-scoped**
2. **Current work record, not one-off answer**
3. **Action-driving, not read-only**
4. **Shared workflow artifact, not personal assistant**
5. **Blocked/owner/waiting-on model, not general retrieval**
6. **Controlled writeback, not blind automation**

---

## 8. Pilot and Value Story

Do not lead with:
- daily standups eliminated
- x hours saved per year math
- minimum wage conversion

Those arguments are weak, easy to challenge, and too close to generic productivity language.

Lead with:
- less manual status reconstruction
- earlier blocker visibility
- clearer owner and waiting-on visibility
- fewer status-chasing messages
- faster escalations and handoffs
- more consistent next-step execution

### Pilot success metrics
- time to answer "what is happening on this issue?"
- time to identify owner
- time to identify blocker
- number of follow-up pings per issue
- stale issue count
- proposal approval rate
- percentage of issues where users checked Remi first
- subjective trust and reuse rate

---

## 9. Crucial truths for project success

### Truth 1
If Remi becomes a better summarizer, it will be copied or ignored.

### Truth 2
If Remi becomes the place users go when they need to move an issue forward, it has a chance.

### Truth 3
Slack-only is too narrow now.
Remi needs a web home, but not a dashboard.

### Truth 4
Trust and scope are part of the product.
Not an afterthought.

### Truth 5
The best competition is not won feature-to-feature.
It is won by owning a painful workflow that incumbents still serve generically.

---

# Document 3: Design Principles and Product Decisions

## 1. Primary product principle

**Every page must either reveal what needs action or help take that action.**

If a page does neither, cut it.

---

## 2. Remi is not a dashboard

Remi must not become:
- analytics-first
- chart-heavy
- passive reporting
- another admin console
- a pretty summary viewer

The main home screen must be an action queue.

### Good homepage
- issues that need action now
- issues that changed meaningfully
- proposals awaiting approval

### Bad homepage
- usage charts
- generic KPI widgets
- total summaries generated
- total integrations connected
- memory heatmaps

---

## 3. Remi is not broad enterprise search

Do not build or position Remi as:
- search your company
- ask AI about everything
- one place for all knowledge
- broad cross-company memory

That is an incumbent battleground.

Remi should remain:
- issue-scoped
- workflow-scoped
- action-oriented

---

## 4. The issue is the product unit

The center of the product is not:
- the user inbox
- the team dashboard
- the company graph

The center is:
- one issue
- one current work record
- one set of next actions

Everything should strengthen issue-level clarity and movement.

---

## 5. Action over observation

Remi should not stop at:
- summarizing
- highlighting
- tagging
- ranking

It must lead to:
- draft update
- chase owner
- prepare escalation
- confirm blocker
- write back with approval

If Remi only helps users read faster, it will remain optional.

---

## 6. Keep the system legible

Users must understand:
- why Remi thinks an issue matters
- where information came from
- how old the information is
- what is inferred vs explicit
- what action is being proposed

That means visible:
- citations
- freshness
- source badges
- approval states
- human review points

---

## 7. Narrow scope beats broad magic

The product should feel:
- bounded
- controlled
- specific
- workflow-aware

Not:
- omniscient
- invasive
- vaguely intelligent
- surveillance-like

Start narrow.
Earn trust.
Expand later.

---

## 8. Slack is a surface, not the home

Slack should be used for:
- invocation
- notifications
- brief views
- lightweight approvals

The web app should be used for:
- issue queue
- issue detail
- approvals
- actions

Jira should be used for:
- issue anchor
- embedded record
- controlled writeback

---

## 9. Human-in-the-loop by default

Remi should not silently mutate customer systems.

Design rule:
- propose first
- approve second
- apply third

Automation should feel controlled and reviewable.

---

## 10. Build for the second visit, not the first wow

A cool first summary is not enough.

The product must succeed when:
- the user comes back tomorrow
- the issue has changed
- the record is still useful
- the next step is still clear

That is how habit forms.

---

## 11. Avoid role confusion

Remi should not try to be:
- the PM
- the engineer
- the support rep
- the exec dashboard

It should be the coordination layer they all use when work gets messy.

---

## 12. Best pages are triage pages

Every main screen should support triage.

Triage means:
- what matters most
- why it matters
- who owns it
- what is blocked
- what should happen next

---

## 13. The queue is more important than the dashboard

The queue is where users start.
The issue page is where users think.
The action panel is where users move work forward.

That is the sequence.

---

## 14. Do not replace Atlassian Rovo

Remi is not trying to become:
- a better Teamwork Graph
- a better search assistant
- a better company AI chat

Remi is trying to be:
- a better coordination layer for fragmented issue reality

This distinction must stay sharp in product and messaging.

---

## 15. Do not replace Copilot

Remi is not a horizontal enterprise AI layer.

It should not be judged by:
- number of connected apps
- breadth of knowledge retrieval
- general productivity features

It should be judged by:
- whether it helps teams move messy issues forward

---

## 16. Not every integration is good scope

An integration is only valuable if it helps answer one of these questions:
- what is happening now?
- who owns it?
- what is blocked?
- what are we waiting on?
- what should happen next?

If it does not, postpone it.

---

## 17. Design for workflows, not feature tours

A user should be able to do one of these immediately:
- understand a messy issue
- approve an update
- chase an owner
- prepare an escalation

Do not create product tours that require explaining many tabs before value appears.

---

## 18. Reduce cognitive load, not add another place to check

This is critical.

Remi should feel like:
- fewer tabs
- fewer pings
- fewer reconstructions
- fewer memory-dependent updates

If Remi becomes one more place to monitor, the product has failed.

That means:
- strong filters
- only important issues shown by default
- concise summaries
- clear next step
- action from the same screen

---

## 19. Build confidence through evidence

Every major claim in the UI should be supported by:
- source evidence
- timestamps
- or explicit confidence labeling

Users should not need blind trust.

---

## 20. Product decisions to hold constant

### Keep constant
- issue is the core unit
- current work record is the core artifact
- Slack/Jira/Gmail are the initial source triad
- controlled writeback remains default
- pilots stay narrow

### Change from earlier direction
- move beyond Slack-only product shape
- stop centering PM ticket updates
- stop broad memory positioning
- stop all-channel-ingestion-by-default assumptions

### Do not do now
- broad company-wide search
- generalized AI chat
- docs sync as a primary wedge
- monitoring-driven ticket generation as a core MVP
- replacement of ITSM / PM suites

---

## 21. Final design rule

**A user should open Remi because they need to move an issue forward, not because they want to read a nicer summary.**

That is the standard every feature and screen should be judged against.

---

# Final one-line product definition

**Remi shows the real status of a messy issue, who owns it, what is blocked, and what should happen next, even when the important context is split across Jira, Slack, and email.**



---

# Document 4: ICP Ranking From Interview Evidence

## Purpose

This section updates the founder pack with a ranked ICP view based on actual interview evidence, not just strategic preference.

Use this to decide:
- who to target first
- who not to target first
- which workflows deserve pilot effort
- which demo narrative will be hardest to dismiss

## Ranking Framework

Each ICP is ranked against six criteria:

1. **Pain intensity**  
   How painful is the current workflow?

2. **Context fragmentation**  
   How often is the real issue state split across Jira, Slack/Teams, and email?

3. **Current workaround weakness**  
   Are manual follow-up, Copilot, Rovo, or DIY AI workflows clearly insufficient?

4. **Ability to see value quickly**  
   Can this buyer understand the value from one concrete demo?

5. **Competitive pressure**  
   How easy is it for them to say “Copilot / Rovo / Claude already does this”?

6. **Pilotability**  
   Can a narrow pilot produce repeated evidence within 2 weeks without waiting for a rare disaster?

---

## Rank 1 — Support / Implementation / Customer Operations teams handling escalations and vendor issues

### Why this is the best ICP
This is the strongest fit for Remi's wedge.

These teams naturally have:
- formal issue tracking
- internal chat discussion
- external customer or vendor email context
- owner ambiguity
- repeated follow-up loops
- painful manual reconstruction of the current state

### Interview evidence
- **Suncorp PM:** the hardest part was identifying the actual technical person responsible on the vendor side; the current process was repeated follow-up and escalation; a filtered issue-scoped view could help if it highlighted what mattered.
- **EY PM:** blockers and hanging questions were the hardest information to find when comments were incomplete; the queue felt like a black box; an issue-scoped view would be a real workflow improvement.

### Score
- Pain intensity: **High**
- Context fragmentation: **High**
- Workaround weakness: **High**
- Ability to see value quickly: **Medium-High**
- Competitive pressure: **Medium**
- Pilotability: **High**

### Best buyers
- Head of Support
- Support Operations Lead
- Head of Implementation
- VP Customer Operations
- Escalation Manager

### Best champions
- support manager
- implementation lead
- escalation lead
- delivery lead
- engineering manager close to escalation workflows

### Why they would buy
Because poor coordination here creates:
- customer dissatisfaction
- vendor delay
- more escalations
- more status chasing
- higher managerial overhead
- slower next actions

---

## Rank 2 — Delivery / Program Managers in cross-functional enterprise workflows

### Why this is strong
This group coordinates work across:
- engineering
- operations
- compliance
- regional stakeholders
- vendor teams
- approval layers

This is a strong fit when the workflow is cross-functional and status is fragmented.

### Interview/context evidence
- The Mastercard contextual discussion pointed toward governance acceleration, approval visibility, and cross-functional project tracking rather than pure PM ticket hygiene.

### Score
- Pain intensity: **Medium-High**
- Context fragmentation: **High**
- Workaround weakness: **Medium**
- Ability to see value quickly: **Medium**
- Competitive pressure: **Medium**
- Pilotability: **Medium-High**

### Best buyers
- Program Manager
- Delivery Lead
- Transformation Lead
- COO in smaller firms
- PMO-style workflow owner

### Caveat
This ICP is good, but the workflow must be concrete. If the pitch stays abstract, this group can dismiss it as “another project visibility tool.”

---

## Rank 3 — Engineering Managers / Technical Leads on escalation-heavy workflows

### Why this is viable
This group cares directly about:
- who owns the issue
- what is blocked
- whether a dependency is external
- what changed
- what the next move is

It works especially well if they are close to:
- customer-impacting issues
- support escalations
- cross-team delivery blockers
- vendor dependencies

### Score
- Pain intensity: **Medium-High**
- Context fragmentation: **Medium-High**
- Workaround weakness: **Medium**
- Ability to see value quickly: **Medium**
- Competitive pressure: **Medium**
- Pilotability: **Medium**

### Caveat
If they are too code/repo-centric, they are more exposed to GitHub / Linear / internal AI workflow substitutes.

---

## Rank 4 — Enterprise PMs in legacy-heavy environments without a strong escalation focus

### Why this is mixed
These users have real pain, but often normalize the friction or already rely on standups, Copilot, or Rovo.

### Interview evidence
- **BOQ Senior PM:** uses Rovo to summarize ticket history, uses standups to ask questions, and asked directly why they would not just use Copilot if it had access to the tools.

### Score
- Pain intensity: **Medium**
- Context fragmentation: **Medium**
- Workaround weakness: **Low-Medium**
- Ability to see value quickly: **Low-Medium**
- Competitive pressure: **High**
- Pilotability: **Medium**

### Conclusion
This is not the best first ICP. It may become viable later, but it is too easy for them to say “good enough already.”

---

## Rank 5 — AI-native startup PMs / product teams

### Why this is weak for the current wedge
These teams often already have:
- cleaner workflows
- fewer governance layers
- direct access to people
- AI-native personal workflows
- a stronger culture of keeping tickets updated manually or via custom automation

### Interview evidence
- **Edtech Startup PM:** already uses Claude Code + Linear MCP + Granola; sees the concept as more of a nice-to-have; says blockers are hardest to find, but overall the workflow is already manageable.

### Score
- Pain intensity: **Low-Medium**
- Context fragmentation: **Medium**
- Workaround weakness: **Low**
- Ability to see value quickly: **Low**
- Competitive pressure: **Very High**
- Pilotability: **Medium**

### Conclusion
Useful for learning. Weak for commercial focus.

---

## Rank 6 — Co-located junior PMs with light process / planner-based workflows

### Why this is the weakest ICP
This environment is too easy to manage through:
- walking over to someone
- Teams chat
- direct emails
- basic planner tools

### Interview evidence
- **Mastercard Junior PM:** chasing is often just going to a desk or sending a message; AI tools already help them search quickly; did not see strong value in the concept for their own workflow.

### Score
- Pain intensity: **Low**
- Context fragmentation: **Low-Medium**
- Workaround weakness: **Low**
- Ability to see value quickly: **Low**
- Competitive pressure: **High**
- Pilotability: **Low**

### Conclusion
Do not target first.

---

## Final ICP Ranking

### Best to worst
1. **Support / Implementation / Customer Operations teams handling escalations and vendor issues**
2. **Delivery / Program Managers in cross-functional enterprise workflows**
3. **Engineering Managers / Technical Leads on escalation-heavy workflows**
4. **Enterprise PMs in legacy-heavy environments without strong escalation pain**
5. **AI-native startup PMs / product teams**
6. **Co-located junior PMs with light task-tracking workflows**

---

## ICP Decision

### Primary target now
**Support / implementation / customer operations teams with recurring escalations, vendor dependencies, and fragmented Jira + chat + email context.**

### Secondary target
**Cross-functional delivery / program workflows where issues move across teams, approvals, and external stakeholders.**

### Avoid first
- startup PM workflows
- general PM productivity
- teams whose main mental model is “just keep the ticket updated”
- teams with low coordination complexity
- buyers primarily looking for enterprise search

---

# Document 5: Strongest Demo Use Case and Messaging Guardrails

## Why the current one-liner can be dismissed

The line:

> Remi tells teams what is really happening on a messy issue, who owns it, what is blocked, and what should happen next.

creates an obvious objection:

> “Isn’t that what a well-maintained ticket is supposed to do?”

That objection is valid.

So the product must be demoed and messaged in workflows where the ticket is predictably **not** the whole story.

---

## Messaging correction

Do **not** imply:
- every team should need this
- every ticket is incomplete
- Remi replaces good ticket hygiene
- the product exists because people are bad at Jira

Instead say:

### Core messaging line
**When the ticket is no longer the whole story, Remi reconstructs what is actually happening and helps the next action happen.**

### Strong operational line
**Remi reconstructs the real status of an issue across Jira, chat, and email when the ticket alone is incomplete.**

### Buyer-facing line
**Remi helps teams resolve messy issues faster by showing the real blocker, owner, and next step when that context is scattered across systems.**

---

## The strongest use case to demo

### Best demo use case
**A stalled vendor or customer-facing escalation where Jira is incomplete, Slack or Teams has the internal reasoning, and email contains the real external context.**

This is the strongest because it proves all three things at once:
1. the ticket is not enough
2. the problem is not “finding notes,” it is reconstructing reality
3. the value is not just summary, it is action

### Why this is the best demo
It directly showcases:
- owner ambiguity
- blocker ambiguity
- waiting-on ambiguity
- multi-system context
- external dependency
- need for escalation or follow-up

It is much harder to dismiss than a simple “ticket update” use case.

---

## Demo narrative to use

### Before
Show:
- a Jira issue that looks stale, vague, or incomplete
- a Slack/Teams thread with partial reasoning or blocker detail
- an email thread with customer or vendor context that changed the situation

### Then show Remi
Show the Current Work Record with:
- current state
- blocker
- owner
- waiting on
- recent change
- open questions
- recommended next step
- evidence links / citations

### Then show the action moment
Show one or more of:
- draft Jira update
- draft Slack follow-up
- escalation pack
- approval flow

### Key line during demo
**Without Remi, someone has to manually reconstruct the issue by checking Jira, chat, and email. Remi restores the missing chain of context and helps the next action happen.**

---

## What not to demo first

Do not lead with:
- a tidy internal engineering ticket
- a generic dashboard tour
- analytics
- broad search
- “AI can summarize your issue”
- standup replacement
- a scenario where a disciplined PM already keeps everything perfectly updated

Those are easier to dismiss.

---

## Demo success test

A strong demo makes the buyer say:
- “Yes, that would have saved real follow-up work”
- “Yes, that issue really would not be fully represented in Jira”
- “Yes, I can see why the owner/blocker is hard to reconstruct today”
- “Yes, I would use this before asking around manually”

If the demo does not do that, it is too weak.

---

## The honest objection response

If someone says:

> “Why not just keep the tickets up to date?”

Respond with:

**If your team truly keeps every ticket current with all blocker, owner, and external context, you probably do not need Remi. Remi exists for the workflows where that does not happen reliably in practice, especially when the real issue state is split across Jira, chat, and email.**

This is the honest answer, and it makes the product more credible.

---

## Design implication from this objection

Remi should not be designed as:
- a prettier ticket
- a generic status summary
- a dashboard of all issues
- a replacement for basic ticket hygiene

It should be designed as:
- the fastest way to understand a confusing or stalled issue
- the place to see the current work record when reality is fragmented
- the surface that helps the next action happen

---

## Best pilot workflow to pair with the demo

### Strongest pilot workflow
**Cross-team or external escalation where email, chat, and the ticket each contain only part of the truth.**

### Good examples
- vendor issue with unclear technical owner
- implementation delay with missing handoff context
- support escalation where customer email changed priority
- internal blocker where Slack shows the reason but Jira still looks “in progress”

### Why this works
It creates repeated use without depending on a rare disaster, and it proves the value in normal messy work.

---

# Final strategic conclusion

Remi should not be sold as:
- “keep tickets updated with AI”
- “a PM for your PM”
- “enterprise memory”
- “better search across tools”

Remi should be sold as:

**the coordination layer for issues where the ticket is no longer the whole story.**

That is the wedge most supported by the interviews and the hardest for incumbents or DIY workflows to dismiss quickly.


---

# Document 6: ROI Tracking and Success Metrics

## Purpose

Remi should not be justified using vague “AI productivity” language alone.

The business case must be tied to measurable workflow outcomes in the scoped pilot first, then to repeatable economic outcomes at expansion stage.

The most important rule:

**Do not lead with total hours saved from standups or generic productivity uplift.**
Lead with reduced coordination failure on messy issues.

---

## 1. Primary ROI Thesis

Remi creates value when it reduces the cost of not knowing what is actually happening on a messy issue.

That value shows up through:
- faster status reconstruction
- faster owner identification
- faster blocker identification
- fewer follow-up loops
- fewer stale issues
- fewer escalation-prep hours
- faster next meaningful action
- lower coordination overhead on customer/vendor-facing issues

---

## 2. Metrics hierarchy

Use four layers of metrics.

### A. Product usage metrics
These show whether Remi is being used.

Track:
- number of issues linked
- number of active Current Work Records
- Work Queue visits
- Issue Detail Page visits
- Slack brief requests
- proposal generation count
- proposal approval rate
- action trigger rate
- repeat usage per issue
- percentage of users returning to Remi for the second status check

### B. Workflow efficiency metrics
These show whether Remi improves the workflow.

Track:
- average time to answer “what is happening on this issue?”
- average time to identify current owner
- average time to identify current blocker
- average time to identify the next action
- average number of systems checked before answer
- average number of follow-up messages per issue
- average number of status-chasing meetings or escalations per issue
- percentage of issues with unclear owner
- percentage of issues with stale state
- time from new signal to next meaningful action

### C. Quality / trust metrics
These show whether the output is good enough to be relied on.

Track:
- user-rated accuracy of Current Work Record
- citation usefulness rating
- freshness satisfaction
- proposal edit rate before approval
- percentage of proposals approved without major edits
- percentage of users who say they would check Remi first next time
- number of false stale/risk flags
- number of missed blocker/owner signals found later outside Remi

### D. Economic / business metrics
These show whether the workflow improvement has commercial relevance.

Track where possible:
- hours spent weekly on manual status reconstruction
- reduction in repeated follow-up work
- reduction in escalation prep time
- reduction in stale issue age
- reduction in time blocked waiting on wrong owner
- reduction in delayed customer/vendor responses
- reduction in avoidable internal escalation loops
- manager time saved per week on status-chasing
- downstream SLA / customer escalation improvements where measurable

---

## 3. Pilot success metrics

For a 2-week pilot, use a tight metric set.

### Required pilot metrics
1. **Time to understand issue state**
   - Baseline: how long it takes today to answer “what is actually happening here?”
   - Target: measurable reduction during pilot

2. **Owner clarity**
   - Baseline: percentage of pilot issues where current owner is unclear
   - Target: reduced unclear-owner rate

3. **Blocker clarity**
   - Baseline: percentage of pilot issues where blocker is unclear or buried
   - Target: improved blocker clarity on pilot issues

4. **Action conversion**
   - Measure how often viewing Remi leads directly to a follow-up, update, or escalation action

5. **Repeat trust**
   - Percentage of pilot users who say they checked Remi before manually reconstructing context on the next issue

### Recommended pilot threshold
A pilot is meaningfully successful if:
- users repeatedly check Remi before manual reconstruction
- proposal approval rate is healthy enough to trust the writeback path
- owner/blocker clarity improves materially
- time to understand issue state drops enough that users notice without prompting

---

## 4. ROI story by maturity stage

### Stage 1: Pilot ROI
Use:
- reduced status reconstruction time
- fewer follow-up pings
- earlier blocker visibility
- faster owner identification

### Stage 2: Team ROI
Use:
- manager time saved
- reduced coordination overhead
- fewer stale escalations
- faster handoffs
- better workflow predictability

### Stage 3: Business ROI
Use:
- customer-impacting issue resolution speed
- escalation reduction
- lower internal coordination cost
- stronger execution reliability
- lower dependence on specific individuals holding context in their head

---

## 5. Metrics to avoid leading with

Do not lead with:
- total company hours saved based on extreme standup assumptions
- minimum wage conversions
- “AI saves X% productivity” style claims
- vanity usage metrics without workflow impact

These are weak and easy to dismiss.

---

## 6. Suggested internal North Star metrics

### Product North Star
**Percentage of messy issues where Remi becomes the first place users check to understand current state.**

### Workflow North Star
**Reduction in time to identify owner, blocker, and next step on scoped high-friction issues.**

### Commercial North Star
**Reduction in manual coordination effort on escalations and handoffs.**

---

# Document 7: Current State vs End State

## Purpose

Remi should not be explained as if the final business is only “ticket reconstruction.”

Ticket reconstruction is the wedge.
The real long-term business is larger.

---

## 1. Current State

Today, Remi is best understood as:

- an issue-scoped coordination product
- using Slack, Jira, and Gmail as the initial source triad
- creating one Current Work Record per issue
- helping a user understand what is happening now
- surfacing owner, blocker, waiting on, next step, and evidence
- proposing controlled updates and follow-ups
- running in a narrow pilot workflow with explicit scope and approval boundaries

### Current-state core surfaces
- Slack brief / invocation
- Jira issue panel
- web Work Queue
- web Issue Detail Page
- Approval Inbox

### Current-state core value
**Understand one messy issue faster and move the next action forward.**

---

## 2. End State

The end-state company should not be:
- a better summarizer
- broad enterprise search
- generic workflow automation glue
- a dashboard of all company work

The end-state company should be:

**the coordination control plane for fragmented enterprise work.**

That means Remi eventually:
- ingests more workflow-relevant systems
- detects issues needing action proactively
- understands relationships across multiple issues and workflows
- recommends or triggers playbooks with human review
- becomes the operating layer for escalations, handoffs, approvals, and other high-friction work
- helps organizations move work forward when the system of record is incomplete

---

## 3. Current State vs End State table

| Area | Current State | End State |
|---|---|---|
| Core unit | One issue | Network of issues, workflows, and exception chains |
| Main sources | Slack + Jira + Gmail | Multi-source workflow graph across communication, ticketing, CRM, docs, ops systems, and alerts |
| Main output | Current Work Record | Workflow control surface with triage, action routing, policy, and patterns |
| Primary value | Understand a messy issue | Keep fragmented work aligned and moving |
| Action model | Controlled proposals | Workflow playbooks and broader orchestration with approvals |
| Risk model | Basic stale / blocker / owner flags | Rich risk, dependency, pattern, and priority detection |
| User surface | Queue + issue page + brief | Multi-role control plane for operators, managers, and leaders |
| Intelligence scope | Issue-level | Issue-level + cross-issue learning + workflow memory |
| Sales motion | One scoped pilot workflow | Expand across teams, workflows, and departments |
| Commercial story | Coordination reduction on high-friction issues | Execution control for fragmented enterprise operations |

---

## 4. End-state capabilities

### A. More sources, but only workflow-relevant
Examples:
- Teams / Outlook
- ServiceNow / Zendesk
- Salesforce
- Notion
- Confluence read/sync or embedded UI
- monitoring and alerting tools
- internal approval systems
- vendor/customer systems when useful

### B. More action depth
Examples:
- issue playbooks
- escalation routing
- policy-based next-step recommendations
- structured follow-up generation
- controlled multi-step workflows

### C. More organizational memory
Examples:
- recurring blocker patterns
- repeated ownership confusion
- repeated vendor/customer issue types
- prior successful resolution paths
- workflow bottleneck detection

### D. More role-specific views
Examples:
- support lead view
- implementation lead view
- delivery manager view
- engineering manager view
- executive escalation view

---

## 5. What should not change between current and end state

Even at scale, these should remain constant:
- issue/workflow scope first
- evidence-backed state
- action over observation
- controlled writeback
- narrow useful views instead of broad dashboard sprawl
- trust and reviewability as part of the product

---

# Document 8: Scalability and How to Scale the Business

## 1. Strategic scaling thesis

Remi scales in three ways:

1. **Workflow depth**
   - go deeper into one painful workflow until it becomes must-have

2. **Team and department expansion**
   - take the same workflow success and spread it across adjacent teams

3. **Control surface expansion**
   - move from understanding work to coordinating and routing action across more workflows

This means Remi should scale **from wedge to control point**, not from “more summaries” to “more summaries.”

---

## 2. The scaling ladder

### Phase 1: Nail one painful workflow
Target:
- support escalations
- implementation handoffs
- vendor-facing delivery blockers
- customer operations issue coordination

Goal:
- prove repeated use
- prove trust
- prove workflow value
- prove action-driving habit

### Phase 2: Expand within the team
Once the first workflow works:
- add more issue volume
- add more users in the same function
- add more action templates
- strengthen workflow digests and escalation packs

Goal:
- become embedded in that function’s weekly operating rhythm

### Phase 3: Expand to adjacent teams
Move into teams that touch the same issues:
- support → implementation
- implementation → delivery / program
- delivery → engineering / customer operations
- engineering → vendor coordination or service workflows

Goal:
- use the same Current Work Record model across adjacent coordination problems

### Phase 4: Expand system surface
Only after the workflow is trusted:
- add adjacent source systems
- add role-specific views
- add deeper action / policy logic
- add cross-issue pattern detection

Goal:
- become a cross-team coordination layer, not just a point tool

### Phase 5: Become a control plane
At this stage Remi should:
- show what needs action across workflows
- coordinate next steps
- preserve organizational execution memory
- route work using structured playbooks and approvals

Goal:
- become hard to remove because it sits in the operating rhythm of fragmented work

---

## 3. Best expansion paths

### Expansion Path A: More teams, same workflow
Example:
- land in support escalations
- expand to implementation and delivery
- later expand to engineering managers on the same workflow

### Expansion Path B: More workflows, same team
Example:
- first solve vendor escalations
- then solve stalled approvals
- then solve customer-facing handoffs
- then solve postmortem / follow-up coordination

### Expansion Path C: More systems, same workflow
Example:
- start with Slack, Jira, Gmail
- add Teams/Outlook or CRM only where they strengthen the same workflow

This is safer than adding systems without a workflow reason.

---

## 4. How to keep scaling from becoming dilution

Use this filter for every new feature, integration, or expansion:

**Does this help Remi become the default place to understand and move forward fragmented work?**

If no, do not prioritize it.

### Do not scale via:
- broad enterprise search
- generic AI chat
- dashboard sprawl
- connectors without workflow value
- “AI for everything” expansion

### Scale via:
- stronger current-state reconstruction
- clearer next-step recommendations
- higher action conversion
- adjacent workflow templates
- repeated pattern learning
- better operational trust

---

## 5. Commercial scaling logic

### Land
- one team
- one workflow
- 10-30 real issues
- 2-week pilot
- founder-led support

### Expand
- more seats or users in same workflow
- more projects or issue volume
- more adjacent teams
- more approved action types

### Platform
- role-based surfaces
- governance controls
- cross-workflow boards
- broader data policy features
- workflow templates and playbooks

This is the path from product to platform.

---

## 6. What makes the business durable

The business becomes durable if Remi owns:
- the Current Work Record
- the action queue
- the next-step recommendation layer
- the approval and writeback loop
- the workflow memory that helps repeated issues move faster

That creates stickiness because:
- users check Remi before asking around
- managers rely on it during escalations
- teams use it during handoffs and reviews
- replacing it means going back to manual reconstruction

---

## 7. Biggest scaling risks

### Risk 1: Becoming a nicer summary tool
If Remi only summarizes better, incumbents absorb it.

### Risk 2: Expanding connectors without workflow clarity
More systems without stronger workflow value creates noise.

### Risk 3: Becoming a dashboard
If the product becomes another place to monitor, habit dies.

### Risk 4: Losing trust through broad ingestion or over-automation
If users do not trust the scope or actions, adoption stalls.

### Risk 5: Expanding before proving a must-have loop
Do not expand categories before one workflow is clearly repeat-use and action-driving.

---

## 8. The clearest scaling narrative for leadership / investors

### Near term
Remi reduces coordination failure on messy issues.

### Mid term
Remi becomes the default action workspace for escalations, handoffs, and high-friction workflows.

### Long term
Remi becomes the coordination control plane for fragmented enterprise work.

That is the business-scaling story.

---

# Near-term roadmap appendix

These decisions refine the founder pack without changing the wedge.

## 1. Scope foundation

Use **Scope** / `scopeId` as the canonical future isolation primitive, not Team / `teamId`.

A scope may represent:
- a team
- a workflow
- a project
- a department
- a pilot boundary

Apply the scope model to future `Issue`, `MemoryUnit`, `IssueContextDocument`, Confluence page records, and retrieval/query logic. Existing workspace and department fields can remain implementation details, but new strategy and schema planning should avoid hard-coding the wrong abstraction too early.

## 2. Confluence before Notion

Confluence draft generation is the first docs target because it sits beside Jira in the Atlassian ecosystem and can validate docs output without repositioning Remi as a documentation product.

Near-term constraints:
- write-only first
- Slack-triggered generation first
- no macro-heavy or Forge-native Confluence UI in V1
- no two-way Confluence sync in V1
- Notion remains deferred until Confluence is validated

## 3. Contextual uploads

Contextual uploads are **pinned reference context** for an issue. They are useful for project briefs, customer requirements, vendor docs, and implementation notes that explain why the issue matters.

They are not higher truth and should not automatically override live evidence from Jira, Slack, or Gmail. Retrieval should select relevant uploaded content when it helps reconstruct the issue; it should not stuff every uploaded document into every prompt.
