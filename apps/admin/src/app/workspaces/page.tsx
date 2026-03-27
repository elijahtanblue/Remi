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
              <th>Name</th>
              <th>Slug</th>
              <th>ID</th>
              <th>Created At</th>
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
              workspaces.map((ws) => (
                <tr key={ws.id}>
                  <td>
                    <Link href={`/workspaces/${ws.id}`} style={{ fontWeight: 500 }}>
                      {ws.name ?? '—'}
                    </Link>
                  </td>
                  <td>
                    <code style={{ fontSize: '13px' }}>{ws.slug ?? '—'}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: '12px', color: '#6c757d' }}>{ws.id}</code>
                  </td>
                  <td style={{ color: '#6c757d', fontSize: '13px' }}>
                    {ws.createdAt ? new Date(ws.createdAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
