import { api } from '@/lib/api';
import Link from 'next/link';

export default async function WorkspacesPage() {
  let workspaces: any[] = [];
  let error: string | null = null;

  try {
    const data = await api.getWorkspaces();
    workspaces = data.workspaces;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load workspaces';
  }

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>Workspaces</h1>

      {error && (
        <div
          className="card badge-red"
          style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '4px' }}
        >
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Slack Workspace</th>
              <th>Jira Site</th>
              <th>ID</th>
              <th>Connected</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.length === 0 && !error ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#6c757d', padding: '24px' }}>
                  No workspaces found
                </td>
              </tr>
            ) : (
              workspaces.map((ws) => {
                const slackName = ws.slackInstalls?.[0]?.slackTeamName ?? ws.name;
                const jiraSite = ws.jiraInstalls?.[0]?.jiraSiteUrl;
                return (
                  <tr key={ws.id}>
                    <td>
                      <Link href={`/workspaces/${ws.id}`} style={{ fontWeight: 500 }}>
                        {slackName}
                      </Link>
                      {ws.slackInstalls?.[0] ? null : (
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6c757d' }}>
                          (no Slack)
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {jiraSite ? (
                        <code style={{ fontSize: '13px' }}>{jiraSite.replace('https://', '')}</code>
                      ) : (
                        <span style={{ color: '#6c757d' }}>not connected</span>
                      )}
                    </td>
                    <td>
                      <code style={{ fontSize: '12px', color: '#6c757d' }}>{ws.id}</code>
                    </td>
                    <td style={{ color: '#6c757d', fontSize: '13px' }}>
                      {ws.createdAt ? new Date(ws.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
