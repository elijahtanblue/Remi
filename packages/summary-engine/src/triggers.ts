import { TriggerReason } from '@remi/shared';

export interface SummaryTriggerContext {
  eventType?: string;
  hasLinkedThreads: boolean;
}

export function shouldTriggerSummary(ctx: SummaryTriggerContext): {
  should: boolean;
  reason: string | null;
} {
  switch (ctx.eventType) {
    case 'status_changed':
      return { should: true, reason: TriggerReason.STATUS_CHANGE };
    case 'assignee_changed':
      return { should: true, reason: TriggerReason.ASSIGNEE_CHANGE };
    case 'priority_changed':
      return { should: true, reason: TriggerReason.PRIORITY_CHANGE };
    case 'slack_activity':
      if (ctx.hasLinkedThreads) {
        return { should: true, reason: TriggerReason.SLACK_ACTIVITY };
      }
      return { should: false, reason: null };
    default:
      return { should: false, reason: null };
  }
}
