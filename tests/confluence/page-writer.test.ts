import { describe, expect, it } from 'vitest';
import { renderConfluencePage } from '../../packages/confluence/src/page-writer.js';
import type { IssueDocContext } from '../../packages/confluence/src/types.js';

const baseContext: IssueDocContext = {
  issue: {
    key: 'ENG-123',
    title: 'Fix login timeout bug',
    status: 'In Progress',
    assignee: 'Alice Chen',
    priority: 'High',
  },
  timeline: [
    { date: new Date('2026-04-01T10:00:00Z'), event: 'Status changed: To Do → In Progress', actor: 'Alice Chen' },
    { date: new Date('2026-04-03T14:00:00Z'), event: 'Priority changed: Medium → High', actor: 'Bob Smith' },
  ],
  keyDecisions: [
    { content: 'We will use JWT refresh tokens with 15-minute expiry', source: 'slack', citedAt: new Date('2026-04-02T09:00:00Z') },
  ],
  blockers: [
    { content: 'Waiting on security team review of token rotation approach', source: 'slack', citedAt: new Date('2026-04-03T11:00:00Z') },
  ],
  openQuestions: [],
  participants: ['Alice Chen', 'Bob Smith', 'Carol Davis'],
  linkedThreads: [
    { channelName: 'eng-backend', permalink: 'https://slack.com/archives/C123/p456', messageCount: 14 },
  ],
  relatedEmails: [
    { subject: 'Re: Login timeout investigation', participants: ['alice@co.com', 'security@co.com'] },
  ],
  generatedAt: new Date('2026-04-08T12:00:00Z'),
  docType: 'handoff',
};

// ─── renderConfluencePage ─────────────────────────────────────────────────────

describe('renderConfluencePage', () => {
  it('includes the issue key and title in the output', () => {
    const { title, body } = renderConfluencePage(baseContext);
    expect(title).toContain('ENG-123');
    expect(body).toContain('Fix login timeout bug');
  });

  it('includes a Timeline section with each event', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Timeline');
    expect(body).toContain('Status changed: To Do → In Progress');
    expect(body).toContain('Priority changed: Medium → High');
  });

  it('includes a Key Decisions section', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Key Decisions');
    expect(body).toContain('JWT refresh tokens');
  });

  it('includes a Blockers section when blockers exist', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Blockers');
    expect(body).toContain('security team review');
  });

  it('includes a Participants section', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Participants');
    expect(body).toContain('Alice Chen');
    expect(body).toContain('Bob Smith');
  });

  it('includes a Linked Slack Threads section', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Slack');
    expect(body).toContain('eng-backend');
  });

  it('includes a Related Emails section', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Email');
    expect(body).toContain('Login timeout investigation');
  });

  it('includes a generated-by footer with timestamp', () => {
    const { body } = renderConfluencePage(baseContext);
    expect(body).toContain('Remi');
    expect(body).toContain('2026-04-08');
  });

  it('omits Blockers section entirely when there are no blockers', () => {
    const ctx: IssueDocContext = { ...baseContext, blockers: [] };
    const { body } = renderConfluencePage(ctx);
    expect(body).not.toContain('Blockers');
  });

  it('omits Key Decisions section when there are no decisions', () => {
    const ctx: IssueDocContext = { ...baseContext, keyDecisions: [] };
    const { body } = renderConfluencePage(ctx);
    expect(body).not.toContain('Key Decisions');
  });

  it('omits Linked Threads section when there are no threads', () => {
    const ctx: IssueDocContext = { ...baseContext, linkedThreads: [] };
    const { body } = renderConfluencePage(ctx);
    // Should not include the Slack threads heading
    expect(body).not.toMatch(/Linked.*Thread/i);
  });

  it('produces valid Confluence storage format — starts with ac:structured-macro or p tag', () => {
    const { body } = renderConfluencePage(baseContext);
    // Confluence storage format uses HTML-like tags; must not be plain text
    expect(body).toMatch(/<[a-z]/);
  });

  it('sets docType-specific title prefix for escalation docs', () => {
    const ctx: IssueDocContext = { ...baseContext, docType: 'escalation' };
    const { title } = renderConfluencePage(ctx);
    expect(title.toLowerCase()).toContain('escalation');
  });

  it('sets docType-specific title prefix for summary docs', () => {
    const ctx: IssueDocContext = { ...baseContext, docType: 'summary' };
    const { title } = renderConfluencePage(ctx);
    expect(title.toLowerCase()).toContain('summary');
  });

  it('includes uploaded context section when provided', () => {
    const ctx: IssueDocContext = {
      ...baseContext,
      uploadedContext: { filename: 'brief.md', uploadedAt: new Date('2026-04-01'), excerpt: 'This feature implements SSO login' },
    };
    const { body } = renderConfluencePage(ctx);
    expect(body).toContain('brief.md');
    expect(body).toContain('SSO login');
  });
});
