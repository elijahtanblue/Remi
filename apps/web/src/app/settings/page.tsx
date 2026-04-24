import { headers } from 'next/headers';
import { getWorkflowConfigs, getScopes } from '@/lib/api-client';
import type { WorkflowConfigItem, ScopeItem } from '@remi/shared';
import CreateConfigForm from './create-config-form';

function ConfigCard({ config, scopes }: { config: WorkflowConfigItem; scopes: ScopeItem[] }) {
  const scope = scopes.find((s) => s.id === config.scopeId);

  return (
    <div className="card" style={styles.configCard}>
      <div style={styles.configHeader}>
        <div>
          <h3 style={styles.configName}>{config.name}</h3>
          <p style={styles.configKey}>{config.workflowKey}</p>
        </div>
        <div style={styles.configBadges}>
          {scope && <span className="badge badge-blue">{scope.name}</span>}
          {config.writebackEnabled
            ? <span className="badge badge-green">Writeback on</span>
            : <span className="badge badge-muted">Writeback off</span>
          }
          {config.approvalRequired
            ? <span className="badge badge-orange">Approval required</span>
            : <span className="badge badge-muted">Auto-apply</span>
          }
        </div>
      </div>

      <div style={styles.configDetails}>
        {config.includedJiraProjects.length > 0 && (
          <ConfigDetail label="Jira projects" value={config.includedJiraProjects.join(', ')} />
        )}
        {config.includedChannelIds.length > 0 && (
          <ConfigDetail label="Slack channels" value={`${config.includedChannelIds.length} channel${config.includedChannelIds.length !== 1 ? 's' : ''}`} />
        )}
        {config.includedMailboxes.length > 0 && (
          <ConfigDetail label="Mailboxes" value={config.includedMailboxes.join(', ')} />
        )}
      </div>
    </div>
  );
}

function ConfigDetail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detail}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={styles.detailValue}>{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const hdrs = await headers();
  const userId      = hdrs.get('x-user-id')      ?? '';
  const workspaceId = hdrs.get('x-workspace-id') ?? '';

  const [{ items: configs }, { items: scopes }] = await Promise.all([
    getWorkflowConfigs(userId, workspaceId),
    getScopes(userId, workspaceId),
  ]);

  return (
    <div>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Settings</h1>
      </div>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Workflow Configs</h2>
          <p style={styles.sectionDesc}>
            Each workflow config defines which Jira projects, Slack channels, and mailboxes
            are included for a scope, and whether Remi can auto-apply Jira updates.
          </p>
        </div>

        <div style={styles.list}>
          {configs.map((config) => (
            <ConfigCard key={config.id} config={config} scopes={scopes} />
          ))}
          <CreateConfigForm scopes={scopes} />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Scopes</h2>
          <p style={styles.sectionDesc}>Teams or functional areas tracked in this workspace.</p>
        </div>

        <div style={styles.scopeList}>
          {scopes.map((scope) => (
            <div key={scope.id} className="card" style={styles.scopeCard}>
              <span style={styles.scopeName}>{scope.name}</span>
              <span className="badge badge-muted">{scope.type}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: { marginBottom: 28 },
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--remi-ink)' },
  section: { marginBottom: 40 },
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: 'var(--remi-ink)', marginBottom: 4 },
  sectionDesc: { fontSize: 13, color: 'var(--remi-muted)', lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { fontSize: 13, color: 'var(--remi-muted)' },
  configCard: { padding: 16 },
  configHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  configName: { fontSize: 14, fontWeight: 600, color: 'var(--remi-ink)', marginBottom: 2 },
  configKey: { fontSize: 11, color: 'var(--remi-muted)', fontFamily: 'monospace' },
  configBadges: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, flexShrink: 0 },
  configDetails: { display: 'flex', flexDirection: 'column', gap: 4 },
  detail: { display: 'flex', gap: 12, alignItems: 'center' },
  detailLabel: { fontSize: 12, color: 'var(--remi-muted)', minWidth: 100 },
  detailValue: { fontSize: 13, color: 'var(--remi-ink)' },
  scopeList: { display: 'flex', flexDirection: 'column', gap: 8 },
  scopeCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' },
  scopeName: { fontSize: 13, fontWeight: 500, color: 'var(--remi-ink)' },
};
