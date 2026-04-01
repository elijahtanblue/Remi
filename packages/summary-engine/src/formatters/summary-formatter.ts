import type { SummaryOutput } from '@remi/shared';
import type { CollectedData, AnalysisResult } from '../types.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function excerptText(text: string, maxLen = 120): string {
  const trimmed = text.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen - 1) + '…' : trimmed;
}

export function formatSummary(
  collected: CollectedData,
  analysis: AnalysisResult,
  score: { recommendedNextStep: string; missingSignals: string[] },
): SummaryOutput {
  const { issue, threads } = collected;

  // Format latestImportantChanges as strings
  const latestImportantChanges = analysis.latestImportantChanges.map((c) => {
    const from = c.from ? `'${c.from}'` : 'unknown';
    const to = c.to ? `'${c.to}'` : 'unknown';
    return `${c.field} changed from ${from} to ${to} on ${formatDate(c.at)}`;
  });

  // Format probableBlockers as strings
  const probableBlockers = analysis.probableBlockers.map(
    (b) => `Possible blocker: "${excerptText(b.text)}" (${b.matchedKeyword})`,
  );

  // Format openQuestions as strings
  const openQuestions = analysis.openQuestions.map((q) => q.text);

  // Compute thread stats
  const totalMessages = threads.reduce((acc, t) => acc + t.messages.length, 0);
  const participantSet = new Set<string>();
  for (const t of threads) {
    for (const m of t.messages) {
      participantSet.add(m.slackUserId);
    }
  }

  const STATUS_CATEGORY_LABEL: Record<string, string> = {
    new: 'To Do',
    indeterminate: 'In Progress',
    done: 'Done',
  };

  return {
    issueKey: issue.jiraIssueKey,
    issueTitle: issue.title,
    currentStatus: STATUS_CATEGORY_LABEL[issue.statusCategory ?? ''] ?? issue.status ?? 'Unknown',
    assignee: issue.assigneeDisplayName ?? issue.assigneeJiraAccountId ?? null,
    previousAssignee: analysis.previousAssignee,
    latestImportantChanges,
    linkedThreadStats: {
      totalThreads: threads.length,
      totalMessages,
      activeParticipants: participantSet.size,
    },
    probableBlockers,
    openQuestions,
    recommendedNextStep: score.recommendedNextStep,
    missingSignals: score.missingSignals,
    generatedAt: new Date(),
  };
}
