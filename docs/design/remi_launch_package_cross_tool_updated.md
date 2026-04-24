# Remi Launch Package — Cross-Tool Coordination Version

Derived launch package. [Remi-ticket-reconstruction-assistant-v3.md](Remi-ticket-reconstruction-assistant-v3.md) is the singular source of truth for product strategy, scope, ICP, roadmap priorities, and positioning. If this launch package conflicts with V3, V3 wins.

## Positioning Guardrail

This package updates the earlier launch story from **Slack-to-Jira handoff briefs** to the new **minimum testable product**:

**Slack + Jira + Gmail + Current Work Record + controlled writeback**

That means Remi should no longer be positioned as:
- a Slack helper
- a Jira add-on
- a generic summarizer
- Gmail as a side note

It should be positioned as:

**Remi reconstructs ticket reality across Slack, Jira, and email, maintains the Current Work Record, and helps the next action happen through controlled updates.**

The core category claim now needs to match the current testing direction:
- context is reconstructed across **three systems**
- output is **issue-scoped**, not broad company search
- AI is part of the product, but **trust and control** are central
- writeback is **controlled and reviewable**, not uncontrolled automation

---

## Company Line And Product Line

### Company / strategic line

**Remi is the coordination layer for messy issues.**

### Product / GTM line

**When the ticket is no longer the whole story, Remi reconstructs what is actually happening and helps the next action happen.**

### Shorter variant

**Maintain the Current Work Record across Slack, Jira, and Gmail.**

### Internal shorthand

**Native integrations move updates between tools. Remi reconstructs the real state of the work when critical context is scattered across them.**

---

## Ideal Customer Profile

### Best Early ICP

Primary target: support, implementation, and customer operations teams handling escalations and vendor/customer issues.

- 20-200 person support, implementation, customer operations, technical operations, or escalation-heavy delivery teams
- already run work across **Slack + Jira + Google Workspace**
- regularly lose issue context across internal chat, formal tickets, and customer/vendor email
- feel pain around stalled escalations, unclear ownership, hidden blockers, and repeated manual status reconstruction
- are open to a guided pilot in a test or non-production environment

### Best Buyer

- Head of Support
- Support Operations Lead
- Head of Implementation
- VP Customer Operations
- Program Manager / Delivery Lead
- Head of Engineering for cross-functional escalation workflows
- COO or transformation lead in a smaller company

### Best Champion

- support manager
- escalation manager
- implementation lead
- delivery lead
- program manager
- engineering manager who owns the workflow day to day

### Strong Pain Signals

- status updates require checking Jira, Slack, and email separately
- ticket ownership changes without clear reasoning attached
- support or implementation escalations stall because critical email context is missing from the ticket
- managers ask "what is actually happening on this issue?" and someone has to reconstruct it manually
- teams spend time chasing blockers rather than resolving them
- customer or vendor context lives outside Jira and never makes it back into the operational workflow

### Not Ideal Yet

- teams not using Slack, Jira, and Google Workspace together
- buyers looking mainly for enterprise search
- teams wanting broad company-wide indexing across all communications on day one
- buyers requiring mature enterprise certifications before a pilot
- organizations wanting production-wide rollout before a narrow guided test
- teams expecting unrestricted autonomous writeback without review controls

---

## 7-Slide Deck

## Slide 1: One-Sentence Category And Value

**Headline**

Maintain the Current Work Record across Slack, Jira, and Gmail

**Subhead**

Remi reconstructs the real state of work from chat, tickets, and email, maintains the Current Work Record, and helps the next action happen through controlled updates.

**Speaker note**

We are not selling generic search or another integration layer. We are selling one operational outcome: when ticket context is scattered across three systems, a team can still understand what is actually happening without manually reconstructing it.

---

## Slide 2: The Problem

**Headline**

The ticket is not the whole story

**Bullets**

- Jira holds the formal workflow record, but not the full reasoning behind the work
- Slack holds the internal discussion, blockers, and handoff detail
- email often holds the customer, vendor, or escalation context that never makes it back into the ticket
- by the time someone asks for status, the team has to manually reconstruct the real state of the issue across multiple systems
- fragmented context creates delay, status chasing, duplicate work, and slower handoffs

**Optional support line**

In fragmented workflows, the problem is not lack of information. The problem is that the reasoning behind the work is split across systems.

**Speaker note**

We are not starting from a macro AI trend story. We are starting from a practical workflow failure: the work moved, but the full context did not.

---

## Slide 3: Why Current Approaches Fail

**Headline**

Most tools connect systems or surface information, but they do not maintain the Current Work Record

**Comparison**

| Approach | What it misses |
|---|---|
| Jira + Slack integration | useful updates and interactions, but not a maintained Current Work Record |
| email in isolation | valuable external context, but disconnected from the ticket and handoff path |
| generic AI search / summaries | helps teams read scattered information, but does not maintain an issue-scoped Current Work Record |
| manual status updates | stale quickly, depend on manual recall, and are expensive to repeat |

**Bottom line**

Search helps teams find work. Remi helps teams understand the current state of the work and carry it forward.

**Speaker note**

This is the distinction that matters. Existing tools explain or route information. Remi reconstructs the operational truth of an issue when the evidence is split across systems.

---

## Slide 4: What Remi Does

**Headline**

Remi turns scattered evidence into one Current Work Record

**Flow**

1. Anchor the work around a Jira issue and linked Slack thread
2. Pull in the relevant Slack thread, Jira activity, and Gmail evidence tied to that issue
3. Extract structured observations such as current state, recent changes, blocker, owner, decision, open question, and next step
4. Synthesize one issue-scoped Current Work Record
5. Surface that record in the web queue / issue page, Slack brief, Jira panel, and operator review views
6. Generate controlled writeback proposals or AI-backed updates within the defined pilot workflow

**Speaker note**

The product is still built around a concrete unit of work: one issue, one body of linked evidence, one Current Work Record. That keeps it legible, trialable, and easier to trust.

---

## Slide 5: What The Output Looks Like

**Headline**

One place to understand what is actually happening

**Show / mock**

- **Slack brief**
  - current state
  - recent change
  - blocker
  - owner
  - open questions
  - recommended next step
- **Jira issue panel**
  - latest work record
  - linked evidence sources
  - blocker summary
  - owner / next step
  - freshness or generated timestamp
- **Email-linked context**
  - cited customer or escalation signal
  - reason it matters to the current issue
- **Operator / admin surface**
  - Current Work Record history
  - pending writeback proposals
  - approval or review state

**Suggested caption**

Not search. Not notes. One Current Work Record tied to a real issue.

**Speaker note**

Use a three-surface before-and-after sequence:
- before: stale Jira issue, long Slack thread, important email buried in inbox
- after: one current issue-scoped record that is useful enough to act on

---

## Slide 6: Soft-Launch Offer

**Headline**

Design partner pilot for one cross-tool workflow

**Offer**

- 2-week guided pilot
- one Slack workspace
- one Jira project or escalation workflow
- Gmail configured for the pilot scope
- founder-led onboarding
- 10-30 real tickets or escalations during the pilot
- success criteria agreed up front

**Pilot outputs**

- Current Work Records on real tickets
- trust and usefulness feedback from actual users
- one measured outcome, such as reduced status reconstruction time
- recommendation for rollout or product changes

**Pilot structure**

- free for 2-3 design partners where learning value is unusually high
- optional low fixed pilot fee for warm accounts that want tighter commitment
- do not publish recurring SaaS pricing yet

**Speaker note**

At this stage, the goal is to prove usefulness, trust, and control in a real workflow. The goal is not to optimize the final pricing or enterprise packaging yet.

---

## Slide 7: Trust And Boundaries

**Headline**

Private beta, narrow scope, controlled AI updates

**State clearly**

- guided design-partner rollout
- issue-scoped Current Work Records, not broad company-wide indexing
- pilot scope is intentionally narrow so data boundaries stay clear
- output is tied to defined source evidence
- AI-backed updates or writeback should be framed as controlled and reviewable
- security and compliance work are in progress
- best fit is teams comfortable with a guided pilot, not buyers requiring full enterprise procurement today

**Plain-language trust points**

- Remi reads only the pilot-scoped Slack, Jira, and Gmail context needed to reconstruct the issue state
- Remi is not positioned as a broad workspace search or surveillance tool
- outputs are shown in approved pilot surfaces
- confidence, freshness, citations, and approval state should be made visible where possible
- external writeback should be framed as controlled, reviewable, and bounded

**Important current platform boundary**

Jira onboarding should still be framed as a controlled private-app / design-partner flow while Forge migration and packaging are worked through.

**How to say it**

Remi is a guided pilot product today, not a broad self-serve marketplace app.

---

## Homepage Copy

## Hero

**Eyebrow**

Coordination layer for messy issues

**Headline**

Maintain the Current Work Record across Slack, Jira, and Gmail

**Subhead**

Remi reconstructs the real state of work from chat, tickets, and email, maintains the Current Work Record, and helps the next action happen through controlled updates.

**Primary CTA**

Request a pilot

**Secondary CTA**

See the demo

### Supporting proof strip

- Built for Slack + Jira + Google Workspace teams
- One Current Work Record, not scattered context
- Controlled AI updates
- Guided design-partner rollout

## Problem Section

**Headline**

Your ticket is not the whole story

**Body**

The real work lives across Slack threads, Jira changes, and email conversations. By the time someone asks for a status update, the reasoning behind the issue is already fragmented.

Remi reconstructs that missing context and turns it into one Current Work Record your team can actually use.

## How It Works

**Card 1**

Collect the evidence  
Pull together the Slack thread, Jira activity, and Gmail context linked to the issue.

**Card 2**

Reconstruct the state  
Generate a Current Work Record with blocker, owner, open questions, decisions, waiting-on, and next step.

**Card 3**

Keep it current  
Update the Current Work Record as new evidence arrives, with controlled writeback where appropriate.

## Outcomes

**Headline**

Understand the real state of work faster

**Bullets**

- less time reconstructing ticket context
- clearer owner and blocker visibility
- faster cross-team handoffs and escalations
- fewer status-chasing messages
- stronger foundation for later automation

## Honest Boundary Section

**Headline**

Private beta for design partners

**Body**

Remi is currently best for teams already working across Slack, Jira, and Gmail who want a guided rollout. We are intentionally keeping pilot scope narrow so onboarding, data boundaries, trust, and success criteria stay clear.

---

## Demo Script

## Demo Goal

Show that Remi reduces "what is actually happening on this issue?" time across Slack, Jira, and email.

## Flow

### 1. Start with the pain

Show:
- a Jira issue that looks incomplete or stale
- a Slack thread with internal discussion
- an email or escalation message that explains part of the issue

Say:

"The ticket exists, but the real status, blocker, and reasoning are split across chat, tickets, and email."

### 2. Show the fragmented context

Show:
- Jira alone is incomplete
- Slack alone has partial reasoning
- email alone has external or escalation detail

Say:

"This team does not have a lack-of-data problem. It has a fragmented-context problem."

### 3. Show Remi's reconstructed work record

Show:
- the Current Work Record or brief
- highlight current state, blocker, owner, waiting-on, open questions, and next step
- cite or point to the evidence sources

Say:

"Remi reconstructs the current state of the issue from the evidence already spread across systems."

### 4. Show that it updates with work

Show:
- a new Slack message, Jira change, or relevant email signal
- refresh or re-render the Current Work Record

Say:

"Remi is useful because it stays current as the work changes. This is not static documentation."

### 5. Show the controlled AI update / writeback layer

Show:
- a pending proposal, current update, or controlled backend write
- any approval, review, or operator control surface that is truly available for testing

Say:

"The goal is not uncontrolled automation. The goal is controlled, reviewable updates that help the next action happen."

### Close

Say:

"If we can reduce the time your team spends reconstructing issue status across Slack, Jira, and email, this creates real workflow value quickly."

---

## Pricing Narrative

## Near-Term Recommendation

Use a **pilot-first** pricing story, not a public self-serve SaaS pricing page.

That fits the current product shape better than publishing broad recurring pricing too early.

## Pilot Structure

### Design Partner Pilot

- free for 2-3 design partners where learning value is high
- optional low fixed pilot fee for warm accounts that want tighter commitment
- one workspace
- one scoped workflow
- 2 weeks
- founder-led onboarding
- no public recurring SaaS pricing yet

## How To Explain Commercial Value

Do not lead with "minutes saved."

Sell:
- less manual status reconstruction
- earlier blocker visibility
- clearer owner and next-step visibility
- faster escalations and handoffs
- cleaner path to later automation and writeback

Suggested line:

"We are proving value first around fragmented issue context, trust, and workflow speed before finalizing the long-term commercial model."

---

## Source Index

Use these in deck notes, internal messaging, or trust framing.

### Internal product / positioning sources

- launch package draft
- revised slide outline
- pilot demo runbook
- archived v1 pipeline plan as historical implementation evidence only
- README and setup docs

### Core internal truths to keep consistent

- Remi should be sold around **reconstructed operational context**, not generic search
- the issue should remain the core unit of work
- Gmail is now part of the minimum testable product, not a side note
- trust, scope, and reviewability are central once AI-backed writeback is part of the product
- the pilot should stay narrow even if the long-term company vision is broader

---

## Final Advice

For this launch version, avoid positioning Remi as:

- enterprise search
- generic AI knowledge management
- workflow discovery
- "just another Slack + Jira integration"
- "we connect three tools"

Lead with:

**When the ticket is no longer the whole story, Remi reconstructs what is actually happening and helps the next action happen.**

That is more differentiated, closer to the actual minimum product you described, and more defensible than a pure Slack-to-Jira story.

---

## Happy Path

## Core Idea

The true happy path of Remi is not:

- connect every tool in the company
- browse a large admin dashboard
- turn on AI everywhere

It is:

**take one real issue with context split across Slack, Jira, and email, reconstruct one genuinely useful Current Work Record, and make that record the place the team returns to when work changes.**

That is the shortest path to value.

## The True Happy Path

### Step 1: Install Slack

The user installs Remi in Slack and receives setup instructions.

**Why it matters**

Slack is the most immediate workflow entry point for the pilot.

### Step 2: Connect Jira

The user connects the Jira site so Remi has the formal ticket anchor.

**Why it matters**

Jira provides the issue identity and workflow structure.

### Step 3: Configure Gmail for the pilot scope

The workspace configures the relevant pilot mailbox or monitored email scope.

**Why it matters**

This gives Remi access to the external or escalation context that often never reaches the ticket.

### Step 4: Select a real issue with fragmented context

The team chooses a real ticket where important evidence exists across all three systems.

**Why it matters**

The product proves itself best when the fragmentation is obvious and costly.

### Step 5: Generate the first Current Work Record

Remi reconstructs the current state of the issue from Slack, Jira, and Gmail evidence.

**Why it matters**

This is the product's first real "aha." The team sees whether Remi reduces manual reconstruction and improves clarity.

The Current Work Record should answer:
- what is happening now
- what changed recently
- what is blocked
- who owns it
- what is still unclear
- what should happen next

### Step 6: Work changes, and the record stays useful

A new Slack reply, Jira change, or Gmail signal updates the Current Work Record.

**Why it matters**

If the output goes stale, trust dies. The habit-forming value is that the Current Work Record stays fresh enough to reuse.

### Step 7: The team starts checking Remi instead of reconstructing context

The Current Work Record becomes the fastest way to answer:
- what is actually happening on this issue?
- who owns it now?
- what is blocked?
- what changed?
- what should happen next?

This is the real loop. Repeated use, not just setup.

## The Customer Aha Sequence

1. **Setup feels controlled**  
   Slack, Jira, and Gmail are scoped clearly for the pilot.
2. **The first issue is a real pain case**  
   Context is visibly fragmented across systems.
3. **The first reconstruction is actually useful**  
   Not just descriptive, but operationally useful.
4. **The Current Work Record improves the second status check**  
   They come back later and it is still helpful.
5. **The team starts trusting the Current Work Record**  
   They use it during escalations, handoffs, and reviews.

If any one of those breaks, the loop weakens.

## Most Value-Generating Features

### Tier 1: Must-Win Features

#### 1. Issue-scoped cross-tool reconstruction

This is the foundation of the product.

**Why it generates value**

- creates clean scope
- avoids fuzzy company-wide positioning
- makes the product legible and easier to trust

#### 2. Current Work Record / brief

This is the clearest value-delivery moment.

**Why it generates value**

- compresses fragmented context into one operational view
- gives immediate payoff
- is easy to demo and easy to reuse

#### 3. Automatic refresh as work changes

The record has to stay useful after the first moment.

**Why it generates value**

- reduces repeated reconstruction
- preserves trust
- makes Remi feel like a system, not a one-off summarizer

#### 4. Structured operational fields

The highest-value fields are:
- blocker
- owner
- decision
- open question
- next step

Customers do not pay for "a summary." They pay for faster decisions and cleaner execution.

#### 5. Controlled AI-backed writeback or update path

This is strategically important because it moves Remi from passive interpretation toward operational action.

**Why it generates value**

- maintains the Current Work Record
- reduces manual copy-back into the system of record
- increases the product's operational usefulness
- creates a stronger future wedge if trust is earned

### Tier 2: Strong Expansion Features

#### 6. Operator / admin visibility

Useful for proposal review, history, approvals, and reruns.

#### 7. Broader review surfaces

The web work queue, issue detail page, approval inbox, additional views, and scope controls can strengthen repeat use once the core loop is trusted.

#### 8. Future system expansion

Over time the model can expand to additional systems, but that should come after the three-system pilot proves value.

### Tier 3: Supporting Features

These matter, but they are not where customer value is born.

- broad integration settings surfaces
- long admin tours
- future docs-tool writeback
- policy depth beyond what is truly testable in the pilot

## What To Emphasize In Demo And Sales

If you only have a few minutes, emphasize these in order:

1. the issue looks incomplete on its own
2. Slack, Jira, and email each hold part of the truth
3. Remi reconstructs the current state
4. the output shows blocker, owner, and next step
5. the work record updates as the work changes
6. the AI-backed update path is controlled

That is the cleanest value story.

## What Not To Lead With

Do not lead with:
- admin dashboard
- analytics
- generic AI context language without a workflow
- broad company-wide indexing
- future Outlook promises or broad docs-platform promises beyond near-term Confluence draft generation
- raw integration setup details

These are supporting layers, not the heart of the product.

## Best Customer Outcome

The best version of the product experience is:

> A support lead, implementation lead, engineering manager, or operator opens an issue and understands the real state of the work in under 30 seconds, even when the evidence is split across Jira, Slack, and email.

That means they can see:
- what changed
- what is blocked
- who owns it
- what evidence matters
- what should happen next

If Remi reliably delivers that, the product is generating real value.

## North Star Filter

Use this as the internal filter:

**A customer chooses one real issue with fragmented context, gets a genuinely useful Current Work Record, and comes back because Remi is now the fastest way to understand issue reality across Slack, Jira, and Gmail.**

If a feature strengthens that loop, it is high priority.

If it does not, it is probably secondary for now.

---

## Near-Term Roadmap Appendix

These items refine the launch package without changing the wedge.

### Scope foundation

Use **Scope** / `scopeId` as the future internal boundary, not Team / `teamId`. A scope can be a team, workflow, project, department, or pilot boundary. Apply this model to future `Issue`, `MemoryUnit`, contextual upload, Confluence page, and retrieval/query designs.

### Confluence before Notion

Confluence draft generation is the first docs target because it sits beside Jira and can validate issue reconstruction outputs without making Remi a docs product.

Near-term constraints:
- write-only first
- Slack-triggered generation first
- no macro-heavy or Forge-native Confluence UI in V1
- no two-way Confluence sync in V1
- Notion deferred until Confluence is validated

### Contextual uploads

Contextual uploads are pinned reference context for a specific issue: project briefs, customer requirements, vendor docs, or implementation notes.

They are trusted inputs, not higher truth. They should enrich the Current Work Record, but they should not automatically override fresher Jira, Slack, or Gmail evidence.
