import type { SummaryOutput } from '@remi/shared';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function listItems(items: string[]): string {
  return items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
}

export function renderIssuePanel(params: {
  issueKey: string;
  summary: SummaryOutput | null;
  linkedThreadCount: number;
}): string {
  const { issueKey, summary, linkedThreadCount } = params;

  const noSummaryHtml = `
    <div class="empty">
      <p>No summary has been generated yet.</p>
      <p>Link a Slack thread and it will appear here.</p>
    </div>`;

  const summaryHtml = summary
    ? (() => {
        const blockers = summary.probableBlockers ?? [];
        const questions = summary.openQuestions ?? [];

        return `
    <div class="section row">
      <div><span class="label">Status</span> ${escapeHtml(summary.currentStatus)}</div>
      ${summary.assignee ? `<div><span class="label">Assignee</span> ${escapeHtml(summary.assignee)}</div>` : ''}
    </div>

    <div class="section">
      <div class="label">Recommended Next Step</div>
      <div class="value">${escapeHtml(summary.recommendedNextStep)}</div>
    </div>

    ${
      blockers.length > 0
        ? `<div class="section">
      <div class="label blocker-label">Blockers</div>
      <ul>${listItems(blockers)}</ul>
    </div>`
        : ''
    }

    ${
      questions.length > 0
        ? `<div class="section">
      <div class="label">Open Questions</div>
      <ul>${listItems(questions)}</ul>
    </div>`
        : ''
    }

    <div class="section">
      <div class="label">Generated</div>
      <div class="value small">${new Date(summary.generatedAt).toLocaleString()}</div>
    </div>`;
      })()
    : noSummaryHtml;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Remi – ${escapeHtml(issueKey)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;color:#172b4d;padding:12px;background:#fff}
  h2{font-size:14px;font-weight:600;margin-bottom:12px;color:#0052cc}
  .section{margin-bottom:12px}
  .row{display:flex;gap:16px;flex-wrap:wrap}
  .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b778c;margin-bottom:4px}
  .blocker-label{color:#de350b}
  .value{font-size:13px;color:#172b4d}
  .small{font-size:11px;color:#6b778c}
  ul{padding-left:16px;margin-top:4px}
  li{margin-bottom:2px}
  .threads{font-size:12px;color:#6b778c;margin-bottom:12px}
  .empty{color:#6b778c;line-height:1.6}
  .footer{border-top:1px solid #dfe1e6;padding-top:8px;font-size:11px;color:#97a0af;text-align:center;margin-top:12px}
</style>
</head>
<body>
<h2>Remi – ${escapeHtml(issueKey)}</h2>
<div class="threads">${linkedThreadCount} linked Slack thread${linkedThreadCount !== 1 ? 's' : ''}</div>
${summaryHtml}
<div class="footer">Powered by Remi</div>
</body>
</html>`;
}
