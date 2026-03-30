'use client';

import { useState } from 'react';
import Link from 'next/link';

interface MemoryUnit {
  id: string;
  scopeType: string;
  scopeRef: string;
  updatedAt: string;
  issue?: { jiraIssueKey: string } | null;
}

interface Proposal {
  id: string;
  status: string;
  confidence: number;
  createdAt: string;
  memoryUnit: { scopeRef: string; issueId: string | null };
}

export default function MemoryPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [units, setUnits] = useState<MemoryUnit[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(wsId: string) {
    if (!wsId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [configRes, unitsRes, proposalsRes] = await Promise.all([
        fetch(`/api/admin/memory/config/${wsId}`),
        fetch(`/api/admin/memory/units/${wsId}`),
        fetch(`/api/admin/memory/proposals/${wsId}`),
      ]);
      if (!configRes.ok || !unitsRes.ok || !proposalsRes.ok) {
        throw new Error('Failed to load memory data');
      }
      const config = await configRes.json();
      setEnabled(config.enabled ?? false);
      setUnits(await unitsRes.json());
      setProposals(await proposalsRes.json());
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled() {
    try {
      const res = await fetch(`/api/admin/memory/config/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error('Failed to update config');
      setEnabled(!enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    }
  }

  async function approve(proposalId: string) {
    try {
      const res = await fetch(`/api/admin/memory/proposals/${proposalId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: 'admin' }),
      });
      if (!res.ok) throw new Error('Failed to approve proposal');
      setProposals((prev) => prev.filter((p) => p.id !== proposalId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    }
  }

  async function reject(proposalId: string) {
    try {
      const res = await fetch(`/api/admin/memory/proposals/${proposalId}/reject`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reject proposal');
      setProposals((prev) => prev.filter((p) => p.id !== proposalId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Autonomous Memory</h1>
      </div>

      <div className="filter-bar" style={{ marginBottom: '20px' }}>
        <input
          placeholder="Workspace ID"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(workspaceId)}
          style={{ flex: 1 }}
        />
        <button
          onClick={() => load(workspaceId)}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loaded && !loading && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Autonomous Memory:</span>
            <button
              onClick={toggleEnabled}
              className={enabled ? 'btn-success' : 'btn-neutral'}
              style={{ padding: '4px 14px', fontSize: '13px' }}
            >
              {enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {proposals.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 className="section-heading">
                Pending Writeback Proposals
                <span className="badge badge-yellow">{proposals.length}</span>
              </h2>
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Proposal ID</th>
                      <th>Scope</th>
                      <th>Confidence</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <code style={{ fontSize: '12px' }}>{p.id.slice(0, 8)}…</code>
                        </td>
                        <td style={{ fontSize: '13px' }}>{p.memoryUnit?.scopeRef ?? '—'}</td>
                        <td>
                          <span
                            className={`badge ${p.confidence >= 0.8 ? 'badge-green' : p.confidence >= 0.5 ? 'badge-yellow' : 'badge-red'}`}
                          >
                            {Math.round(p.confidence * 100)}%
                          </span>
                        </td>
                        <td style={{ color: 'var(--remi-muted)', fontSize: '13px' }}>
                          {new Date(p.createdAt).toLocaleString()}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => approve(p.id)}
                              className="btn-success"
                              style={{ padding: '4px 10px', fontSize: '13px' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => reject(p.id)}
                              className="btn-danger"
                              style={{ padding: '4px 10px', fontSize: '13px' }}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="section-heading">
              Memory Units
              <span className="tab-count">{units.length}</span>
            </h2>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Issue / Scope</th>
                    <th>Scope Type</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {units.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">No memory units yet.</td>
                    </tr>
                  ) : (
                    units.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <code style={{ fontSize: '13px' }}>{u.issue?.jiraIssueKey ?? u.scopeRef}</code>
                        </td>
                        <td style={{ fontSize: '13px', color: 'var(--remi-muted)' }}>{u.scopeType}</td>
                        <td style={{ fontSize: '13px', color: 'var(--remi-muted)' }}>
                          {new Date(u.updatedAt).toLocaleString()}
                        </td>
                        <td>
                          <Link href={`/memory/${u.id}`} style={{ fontSize: '13px' }}>View</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
