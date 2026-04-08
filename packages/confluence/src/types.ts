/**
 * IssueDocContext — the stable intermediate object consumed by the Confluence
 * page renderer. Neither summary-engine nor memory-engine is imported directly
 * by the renderer; instead, each engine provides an adapter that builds this
 * type. This keeps the renderer decoupled from engine internals and able to
 * survive the summary-engine → memory-engine transition.
 */
export interface IssueDocContext {
  issue: {
    key: string;
    title: string;
    status: string;
    assignee?: string;
    priority?: string;
  };
  timeline: Array<{
    date: Date;
    event: string;
    actor?: string;
  }>;
  keyDecisions: Array<{
    content: string;
    source: string; // 'slack' | 'jira' | 'email'
    citedAt: Date;
  }>;
  blockers: Array<{
    content: string;
    source: string;
    citedAt: Date;
  }>;
  openQuestions: Array<{
    content: string;
    source: string;
    citedAt: Date;
  }>;
  participants: string[];
  linkedThreads: Array<{
    channelName?: string;
    permalink?: string;
    messageCount: number;
  }>;
  relatedEmails: Array<{
    subject: string;
    participants: string[];
  }>;
  /** Present when a PM has uploaded a project brief or context doc for this issue. */
  uploadedContext?: {
    filename: string;
    uploadedAt: Date;
    excerpt: string;
  };
  department?: string;
  generatedAt: Date;
  docType: 'handoff' | 'summary' | 'escalation';
}

export interface RenderedPage {
  title: string;
  /** Confluence storage format (XHTML-like). */
  body: string;
}
