import type { SummaryOutput } from '@remi/shared';

/**
 * Build Block Kit blocks for a Remi brief (summary) response.
 */
export function buildBriefBlocks(summary: SummaryOutput): unknown[] {
  const {
    issueKey,
    issueTitle,
    currentStatus,
    assignee,
    recommendedNextStep,
    probableBlockers,
    openQuestions,
    missingSignals,
    latestImportantChanges,
    generatedAt,
  } = summary;

  const generatedAtStr = new Date(generatedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const blocks: unknown[] = [
    // Header
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${issueKey}: ${issueTitle}`,
        emoji: true,
      },
    },

    // Status + assignee + next step
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Status:* \`${currentStatus}\``,
        },
        {
          type: 'mrkdwn',
          text: `*Assignee:* ${assignee ?? '_Unassigned_'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Recommended Next Step:*\n${recommendedNextStep}`,
        },
      ],
    },
  ];

  // Latest changes
  if (latestImportantChanges.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Recent Changes*\n${latestImportantChanges.map((c) => `• ${c}`).join('\n')}`,
      },
    });
  }

  // Blockers
  if (probableBlockers.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Blockers*\n${probableBlockers.map((b) => `• ${b}`).join('\n')}`,
      },
    });
  }

  // Open questions
  if (openQuestions.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Open Questions*\n${openQuestions.map((q) => `• ${q}`).join('\n')}`,
      },
    });
  }

  // Footer: generated at
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `_Generated at ${generatedAtStr}_`,
      },
    ],
  });

  return blocks;
}
