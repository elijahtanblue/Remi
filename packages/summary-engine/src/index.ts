export { generateSummary } from './engine.js';
export type { GenerateSummaryResult } from './engine.js';

export { formatSummaryForSlack } from './formatters/slack-formatter.js';

export { shouldTriggerSummary } from './triggers.js';
export type { SummaryTriggerContext } from './triggers.js';

export type {
  IssueSnapshot,
  IssueEventRecord,
  SlackMessageRecord,
  ThreadData,
  CollectedData,
  AnalysisResult,
} from './types.js';
