import type { SummaryOutput } from '@remi/shared';

export function formatSummaryForSlack(summary: SummaryOutput): unknown[] {
  const blocks: unknown[] = [];

  // Header block
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${summary.issueKey}: ${summary.issueTitle}`,
      emoji: false,
    },
  });

  // Status / assignee / threads section
  const assigneeText = summary.assignee ? summary.assignee : '_Unassigned_';
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Status*\n${summary.currentStatus}`,
      },
      {
        type: 'mrkdwn',
        text: `*Assignee*\n${assigneeText}`,
      },
      {
        type: 'mrkdwn',
        text: `*Threads / Messages*\n${summary.linkedThreadStats.totalThreads} threads, ${summary.linkedThreadStats.totalMessages} messages`,
      },
    ],
  });

  // Recommended next step
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Recommended next step*\n${summary.recommendedNextStep}`,
    },
  });

  // Probable blockers
  if (summary.probableBlockers.length > 0) {
    const blockerLines = summary.probableBlockers
      .map((b, i) => `${i + 1}. ${b}`)
      .join('\n');
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Probable Blockers*\n${blockerLines}`,
      },
    });
  }

  // Open questions
  if (summary.openQuestions.length > 0) {
    const questionLines = summary.openQuestions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Open Questions*\n${questionLines}`,
      },
    });
  }

  // Missing signals context block
  if (summary.missingSignals.length > 0) {
    blocks.push({ type: 'divider' });
    const signalText = summary.missingSignals.map((s) => `• ${s}`).join('\n');
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Missing signals*\n${signalText}`,
        },
      ],
    });
  }

  // Footer
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Generated at ${summary.generatedAt.toISOString()}`,
      },
    ],
  });

  return blocks;
}
