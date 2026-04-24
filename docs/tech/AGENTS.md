# Multi-Agent Workflow

This file is the shared source of truth for agent workflow only (Claude, Codex, Gemini).
`CLAUDE.md` and `GEMINI.md` both defer to this file.

Product strategy, scope, ICP, roadmap priorities, and positioning defer to [Remi-ticket-reconstruction-assistant-v3.md](../design/Remi-ticket-reconstruction-assistant-v3.md), the singular product source of truth.

---

## Agent Roles

| Agent | Role | Strengths |
|-------|------|-----------|
| **Claude** | Lead / Orchestrator | Planning, implementation, coordination |
| **Codex** | Correctness Reviewer | Catching small bugs, logic errors, edge cases Claude misses |
| **Gemini** | Architecture Reviewer | Broader structural issues, design patterns, systemic concerns |

---

## Workflow

### 1. Claude Takes the First Pass
- Claude handles planning and initial implementation.
- Before handing off, Claude must ensure: code compiles/runs, obvious errors are resolved, and the implementation matches the task requirements.

### 2. Parallel Review (Codex + Gemini)
After implementation, Claude dispatches **both reviewers simultaneously** via CLI:

**Codex** (correctness):
```bash
codex "Review the changes in this PR/diff for correctness bugs, logic errors, off-by-one errors, null handling, and any issues Claude typically overlooks. Be specific about file and line numbers. Do not suggest stylistic or opinionated changes — only flag true bugs."
```

**Gemini** (architecture):
```bash
gemini "Review the changes in this PR/diff for broader architectural concerns: design patterns, coupling, scalability, separation of concerns, and systemic issues. Focus on structural problems, not line-level bugs."
```

> Run these in parallel. Do not wait for one before starting the other.

### 3. Handling Review Feedback

**If Codex or Gemini flags a true bug** (logic error, broken behavior, incorrect output):
- Claude applies the fix automatically without waiting for user input.
- Claude states what was fixed and why in a brief summary.

**If Codex or Gemini flags an opinionated suggestion** (style, naming, architectural preference, non-breaking trade-offs):
- Claude **pauses** and presents the suggestion to the user.
- Claude does **not** auto-apply opinionated changes.
- Claude asks: _"Codex/Gemini suggested [X]. Would you like me to apply this?"_

**If reviews conflict** (Codex and Gemini disagree):
- Claude surfaces both perspectives to the user with a brief neutral summary.
- Claude waits for user direction before acting.

### 4. Final Pass
After all fixes are applied and the user has resolved any opinionated suggestions, Claude does a final review to confirm consistency before closing out the task.

---

## CLI Invocation Reference

Invoke Codex:
```bash
codex "<prompt>"
```

Invoke Gemini:
```bash
gemini "<prompt>"
```

Both tools should receive relevant context: the diff, affected files, or a description of what changed and why.

---

## Autonomy Rules

- Claude **may act autonomously** on: true bugs, compilation errors, test failures, and broken behavior.
- Claude **must pause and ask** on: opinionated refactors, architectural rewrites, naming changes, and anything subjective.
- When in doubt, **pause and ask**. The cost of asking is lower than the cost of an unwanted change.

---

## Parallel Execution

Whenever Codex and Gemini reviews are independent (no shared state), run them in parallel to reduce turnaround time. Only serialize if one review depends on the output of the other (rare).
