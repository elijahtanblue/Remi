import type { SummaryOutput } from '@remi/shared';

interface CWRData {
  currentState: string;
  ownerDisplayName: string | null;
  waitingOnType: string | null;
  waitingOnDescription: string | null;
  nextStep: string | null;
  blockerSummary: string | null;
  riskScore: number;
  confidence: number;
  isStale: boolean;
  updatedAt: string;
}

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function riskColor(score: number): string {
  if (score >= 0.8) return '#de350b';
  if (score >= 0.5) return '#ff8b00';
  return '#00875a';
}

function renderCwr(cwr: CWRData): string {
  const risk = Math.round(cwr.riskScore * 100);
  const conf = Math.round(cwr.confidence * 100);
  const updated = relativeTime(cwr.updatedAt);

  return `
  <div class="section">
    ${cwr.isStale ? '<div class="stale-badge">⚠ Stale — update overdue</div>' : ''}
    <div class="state">${escapeHtml(cwr.currentState)}</div>
  </div>

  <div class="meta-grid">
    ${cwr.ownerDisplayName ? `<div class="meta-row"><span class="label">Owner</span><span>${escapeHtml(cwr.ownerDisplayName)}</span></div>` : ''}
    ${cwr.waitingOnType ? `<div class="meta-row"><span class="label">Waiting on</span><span>${escapeHtml(cwr.waitingOnDescription ?? cwr.waitingOnType)}</span></div>` : ''}
    ${cwr.nextStep ? `<div class="meta-row"><span class="label">Next step</span><span>${escapeHtml(cwr.nextStep)}</span></div>` : ''}
    <div class="meta-row">
      <span class="label">Risk</span>
      <span style="color:${riskColor(cwr.riskScore)};font-weight:600">${risk}%</span>
    </div>
    <div class="meta-row"><span class="label">Confidence</span><span>${conf}%</span></div>
    <div class="meta-row"><span class="label">Updated</span><span>${updated}</span></div>
  </div>

  ${cwr.blockerSummary ? `
  <div class="section blocker-box">
    <div class="label blocker-label">Blocker</div>
    <div>${escapeHtml(cwr.blockerSummary)}</div>
  </div>` : ''}`;
}

function renderLegacySummary(summary: SummaryOutput): string {
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

  ${blockers.length > 0 ? `<div class="section">
    <div class="label blocker-label">Blockers</div>
    <ul>${listItems(blockers)}</ul>
  </div>` : ''}

  ${questions.length > 0 ? `<div class="section">
    <div class="label">Open Questions</div>
    <ul>${listItems(questions)}</ul>
  </div>` : ''}

  <div class="section">
    <div class="label">Generated</div>
    <div class="value small">${new Date(summary.generatedAt).toLocaleString()}</div>
  </div>`;
}

export function renderIssuePanel(params: {
  issueKey: string;
  summary: SummaryOutput | null;
  linkedThreadCount: number;
  cwr?: CWRData | null;
}): string {
  const { issueKey, summary, linkedThreadCount, cwr } = params;

  const bodyHtml = cwr
    ? renderCwr(cwr)
    : summary
      ? renderLegacySummary(summary)
      : `<div class="empty"><p>No summary has been generated yet.</p><p>Link a Slack thread and it will appear here.</p></div>`;

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
  .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b778c;margin-bottom:4px;display:block}
  .blocker-label{color:#de350b}
  .value{font-size:13px;color:#172b4d}
  .small{font-size:11px;color:#6b778c}
  ul{padding-left:16px;margin-top:4px}
  li{margin-bottom:2px}
  .threads{font-size:12px;color:#6b778c;margin-bottom:12px}
  .empty{color:#6b778c;line-height:1.6}
  .footer{border-top:1px solid #dfe1e6;padding-top:8px;font-size:11px;color:#97a0af;text-align:center;margin-top:12px}
  .state{font-size:13px;color:#172b4d;line-height:1.6;margin-top:4px}
  .meta-grid{display:flex;flex-direction:column;gap:0;border-top:1px solid #dfe1e6;margin-bottom:12px}
  .meta-row{display:grid;grid-template-columns:80px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid #dfe1e6;align-items:start;font-size:12px}
  .blocker-box{background:#fff5f5;border:1px solid #ffbdad;border-radius:4px;padding:8px 10px;color:#de350b;font-size:12px}
  .stale-badge{font-size:11px;font-weight:600;color:#ff8b00;margin-bottom:6px}
</style>
</head>
<body>
<h2>Remi – ${escapeHtml(issueKey)}</h2>
<div class="threads">${linkedThreadCount} linked Slack thread${linkedThreadCount !== 1 ? 's' : ''}</div>
${bodyHtml}
<div class="footer">Powered by Remi</div>
</body>
</html>`;
}
