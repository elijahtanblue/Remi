// Matches Jira-style issue keys: PROJECT-123 (case-insensitive in emails).
// Captures mixed-case variants (proj-123, Proj-123) and normalises to uppercase
// so they match the jiraIssueKey stored in the database.
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/gi;

export function detectIssueKeys(text: string): string[] {
  const matches = [...text.matchAll(ISSUE_KEY_RE)];
  return [...new Set(matches.map((m) => m[1].toUpperCase()))];
}
