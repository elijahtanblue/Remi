# Remi

Remi is the coordination layer for messy issues.

It reconstructs the real status of work across Jira, Slack, and email, shows who owns it, what is blocked, what everyone is waiting on, and what should happen next, then helps teams take the next action through controlled updates.

## How It Works

1. An issue is linked or opened.
2. Remi gathers relevant Slack, Jira, and Gmail evidence within the scoped workflow.
3. Remi builds a Current Work Record.
4. Users review it in the web work queue / issue page, Slack brief, and Jira panel.
5. Remi proposes next actions and controlled writebacks for review.

## Singular Product Source

[Remi-ticket-reconstruction-assistant-v3.md](docs/design/Remi-ticket-reconstruction-assistant-v3.md) is the singular source of truth for Remi's product strategy, scope, ICP, roadmap priorities, and positioning.

The near-term wedge is support, implementation, customer operations, and escalation-heavy workflows where the ticket is no longer the whole story.

## Docs Map

- Singular product source: [docs/design/Remi-ticket-reconstruction-assistant-v3.md](docs/design/Remi-ticket-reconstruction-assistant-v3.md)
- Derived quick reference: [docs/design/PRODUCT_DIRECTION.md](docs/design/PRODUCT_DIRECTION.md)
- Derived launch package: [docs/design/remi_launch_package_cross_tool_updated.md](docs/design/remi_launch_package_cross_tool_updated.md)
- Implementation setup: [docs/business/SETUP.md](docs/business/SETUP.md)
- Coordination MVP deferrals: [docs/design/OUT_OF_SCOPE_COORDINATION_MVP.md](docs/design/OUT_OF_SCOPE_COORDINATION_MVP.md)
- Deployment log: [docs/design/DEPLOYMENT_LOG.md](docs/design/DEPLOYMENT_LOG.md)

## Product Boundaries

Remi is issue-scoped, not broad workspace search. Slack is an action surface, Jira is the issue anchor, Gmail is part of the core evidence triad, and the web product is the workflow home.

AI-backed updates must be cited, reviewable, and controlled before writeback.
