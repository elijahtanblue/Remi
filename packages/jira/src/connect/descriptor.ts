export function buildConnectDescriptor(baseUrl: string, workspaceId: string): Record<string, unknown> {
  return {
    key: 'remi-memory',
    name: 'Remi',
    description: 'Operational memory for your Slack and Jira workflow',
    vendor: { name: 'Remi', url: baseUrl },
    baseUrl,
    links: { homepage: baseUrl, documentation: `${baseUrl}/docs` },
    authentication: { type: 'jwt' },
    apiVersion: 1,
    modules: {
      webhooks: [
        { event: 'jira:issue_created', url: '/jira/webhooks' },
        { event: 'jira:issue_updated', url: '/jira/webhooks' },
        { event: 'comment_created', url: '/jira/webhooks' },
        { event: 'comment_updated', url: '/jira/webhooks' },
      ],
      webPanels: [
        {
          key: 'remi-summary-panel',
          name: { value: 'Remi Summary' },
          url: '/jira/panel/{issue.key}?jwt={jwt}',
          location: 'atl.jira.view.issue.right.context',
          conditions: [{ condition: 'user_is_logged_in' }],
        },
      ],
    },
    lifecycle: {
      installed: `/jira/lifecycle/installed?workspaceId=${workspaceId}`,
      uninstalled: '/jira/lifecycle/uninstalled',
    },
    scopes: ['READ', 'WRITE'],
  };
}
