'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface OpenAction {
  description: string;
  assignee?: string;
}

interface Snapshot {
  id: string;
  version: number;
  headline: string;
  currentState: string;
  keyDecisions: string[];
  openActions: OpenAction[];
  blockers: string[];
  openQuestions: string[];
  confidence: number;
  freshness: string;
  createdAt: string;
}

interface MemoryUnitDetail {
  unit: {
    scopeType: string;
    scopeRef: string;
    issueId: string | null;
    workspaceId: string;
  };
  snapshots: Snapshot[];
}

export default function MemoryUnitPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [data, setData] = useState<MemoryUnitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/memory/units/by-id/${unitId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load unit: ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [unitId]);

  if (error) {
    return (
      <div>
        <div
          className="badge-red"
          style={{ padding: '10px 14px', borderRadius: '4px', fontSize: '14px' }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ color: '#6c757d', fontSize: '14px', padding: '20px 0' }}>Loading…</div>
    );
  }

  const latest = data.snapshots[0];

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '6px' }}>
        <Link href="/memory">Memory</Link> /
      </div>

      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>Memory Unit</h1>
      <p style={{ fontSize: '13px', color: '#6c757d', marginBottom: '24px' }}>
        {data.unit.scopeType} · <code style={{ fontSize: '12px' }}>{data.unit.scopeRef}</code>
        {data.unit.issueId && (
          <span style={{ marginLeft: '8px', color: '#6c757d' }}>· issue {data.unit.issueId}</span>
        )}
      </p>

      {latest && (
        <section style={{ marginBottom: '32px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Latest Snapshot</h2>
            <span style={{ fontSize: '12px', color: '#6c757d' }}>
              v{latest.version} · {Math.round(latest.confidence * 100)}% confidence
            </span>
          </div>
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>{latest.headline}</h3>
            <p style={{ fontSize: '14px', color: '#495057', marginBottom: '16px' }}>{latest.currentState}</p>

            {latest.keyDecisions.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ fontSize: '13px' }}>Key Decisions</strong>
                <ul style={{ marginTop: '4px', paddingLeft: '20px', fontSize: '13px' }}>
                  {latest.keyDecisions.map((d, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {latest.openActions.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ fontSize: '13px' }}>Open Actions</strong>
                <ul style={{ marginTop: '4px', paddingLeft: '20px', fontSize: '13px' }}>
                  {latest.openActions.map((a, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>
                      {a.description}
                      {a.assignee && (
                        <span style={{ color: '#6c757d', marginLeft: '6px' }}>({a.assignee})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {latest.blockers.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ fontSize: '13px', color: '#721c24' }}>Blockers</strong>
                <ul style={{ marginTop: '4px', paddingLeft: '20px', fontSize: '13px', color: '#721c24' }}>
                  {latest.blockers.map((b, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {latest.openQuestions.length > 0 && (
              <div>
                <strong style={{ fontSize: '13px' }}>Open Questions</strong>
                <ul style={{ marginTop: '4px', paddingLeft: '20px', fontSize: '13px' }}>
                  {latest.openQuestions.map((q, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
        Snapshot History{' '}
        <span
          style={{
            fontSize: '12px',
            background: '#e9ecef',
            borderRadius: '10px',
            padding: '1px 7px',
            marginLeft: '4px',
          }}
        >
          {data.snapshots.length}
        </span>
      </h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Headline</th>
              <th>Confidence</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.snapshots.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#6c757d', padding: '24px' }}>
                  No snapshots yet.
                </td>
              </tr>
            ) : (
              data.snapshots.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontSize: '13px', fontWeight: 600 }}>v{s.version}</td>
                  <td style={{ fontSize: '13px' }}>{s.headline}</td>
                  <td>
                    <span
                      className={`badge ${s.confidence >= 0.8 ? 'badge-green' : s.confidence >= 0.5 ? 'badge-yellow' : 'badge-red'}`}
                    >
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </td>
                  <td style={{ color: '#6c757d', fontSize: '13px' }}>
                    {new Date(s.createdAt).toLocaleString()}
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
