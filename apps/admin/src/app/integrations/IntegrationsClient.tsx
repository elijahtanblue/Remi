'use client';

import { useState } from 'react';
import EmailSettingsClient from './EmailSettingsClient';

type AppId = 'slack' | 'jira' | 'gmail' | 'outlook';
type AppType = 'messaging' | 'task_planning';

interface AppDef {
  id: AppId;
  name: string;
  type: AppType;
  typeLabel: string;
  connected: boolean;
}

const APPS: AppDef[] = [
  { id: 'slack',   name: 'Slack',   type: 'messaging',     typeLabel: 'Messaging',     connected: true  },
  { id: 'gmail',   name: 'Gmail',   type: 'messaging',     typeLabel: 'Messaging',     connected: false },
  { id: 'outlook', name: 'Outlook', type: 'messaging',     typeLabel: 'Messaging',     connected: false },
  { id: 'jira',    name: 'Jira',    type: 'task_planning', typeLabel: 'Task Planning', connected: true  },
];

const TYPE_COLORS: Record<AppType, { bg: string; text: string }> = {
  messaging:    { bg: 'var(--remi-accent-soft)', text: 'var(--remi-navy)' },
  task_planning: { bg: '#E8F5EE', text: '#1a7a3c' },
};

const DEFAULT_ROLES = ['CEO', 'VP', 'Director', 'Manager', 'Associate', 'Contractor'];

// ── Primitives ───────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '40px', height: '22px', borderRadius: '11px', border: 'none',
        background: checked ? 'var(--remi-navy)' : 'var(--remi-border)', position: 'relative',
        cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: checked ? '21px' : '3px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  );
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: '24px', padding: '16px 0', borderBottom: '1px solid var(--remi-border)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#212529' }}>{label}</div>
        {description && (
          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '3px' }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '20px', padding: '0' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--remi-border)',
        background: 'var(--remi-accent-soft)', borderRadius: '8px 8px 0 0',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#495057', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '0 20px' }}>
        {children}
        <div style={{ height: '1px' }} />
      </div>
    </div>
  );
}

// ── Shared: Role-Based Privacy ───────────────────────────────────────────────

function RolePrivacySection() {
  const [enabled, setEnabled] = useState(true);
  const [rules, setRules] = useState<Record<string, string[]>>({
    Associate: ['CEO', 'VP', 'Director'],
    Contractor: ['CEO', 'VP', 'Director', 'Manager'],
  });

  function toggleRule(fromRole: string, toRole: string) {
    setRules((prev) => {
      const current = prev[fromRole] ?? [];
      const updated = current.includes(toRole)
        ? current.filter((r) => r !== toRole)
        : [...current, toRole];
      return { ...prev, [fromRole]: updated };
    });
  }

  return (
    <SectionCard title="Role-Based Privacy">
      <SettingRow
        label="Enable role hierarchy enforcement"
        description="Prevent lower-level roles from querying information about higher-level employees."
      >
        <Toggle checked={enabled} onChange={setEnabled} />
      </SettingRow>
      {enabled && (
        <div style={{ padding: '16px 0' }}>
          <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '12px' }}>
            Select which roles are restricted from viewing information about other roles:
          </div>
          {['Associate', 'Contractor', 'Manager'].map((fromRole) => (
            <div key={fromRole} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#212529' }}>
                {fromRole} cannot query:
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {DEFAULT_ROLES.filter((r) => r !== fromRole).map((toRole) => {
                  const blocked = (rules[fromRole] ?? []).includes(toRole);
                  return (
                    <button key={toRole} onClick={() => toggleRule(fromRole, toRole)} style={{
                      padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
                      border: '1px solid', borderColor: blocked ? '#dc3545' : '#dee2e6',
                      background: blocked ? '#fff0f0' : '#fff',
                      color: blocked ? '#dc3545' : '#6c757d', cursor: 'pointer',
                    }}>
                      {toRole}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Shared: Information Gathering ────────────────────────────────────────────

function InfoGatheringSection({ appType }: { appType: AppType }) {
  const [captureEnabled, setCaptureEnabled] = useState(true);
  const [captureDMs, setCaptureDMs] = useState(false);
  const [anonymize, setAnonymize] = useState(false);
  const [retention, setRetention] = useState('90');

  return (
    <SectionCard title="Information Gathering">
      <SettingRow
        label="Enable data capture"
        description={appType === 'messaging'
          ? 'Capture thread messages for summary generation.'
          : 'Capture issue updates and comments for summaries.'}
      >
        <Toggle checked={captureEnabled} onChange={setCaptureEnabled} />
      </SettingRow>
      {appType === 'messaging' && (
        <SettingRow label="Capture direct message threads" description="Allow Remi to process DM threads when explicitly linked. Off by default.">
          <Toggle checked={captureDMs} onChange={setCaptureDMs} />
        </SettingRow>
      )}
      {appType === 'task_planning' && (
        <SettingRow label="Capture issue changelog" description="Include field changes (status, assignee, priority) in context data.">
          <Toggle checked={captureEnabled} onChange={setCaptureEnabled} />
        </SettingRow>
      )}
      <SettingRow label="Anonymize user mentions in summaries" description="Replace real names with role labels in generated summaries.">
        <Toggle checked={anonymize} onChange={setAnonymize} />
      </SettingRow>
      <SettingRow label="Data retention period" description="How long raw captured data is stored.">
        <select value={retention} onChange={(e) => setRetention(e.target.value)} style={{
          padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)',
          borderRadius: '6px', background: '#fff', color: '#212529', cursor: 'pointer',
        }}>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">1 year</option>
        </select>
      </SettingRow>
    </SectionCard>
  );
}

// ── Slack settings ───────────────────────────────────────────────────────────

function SlackSettings() {
  const [maxReminders, setMaxReminders] = useState('3');
  const [cooldown, setCooldown] = useState('60');
  const [briefRole, setBriefRole] = useState('Manager');
  const [linkRole, setLinkRole] = useState('Associate');
  const [summaryDelivery, setSummaryDelivery] = useState<'thread' | 'dm'>('thread');
  const [notifyAssignee, setNotifyAssignee] = useState(true);
  const [socketMode, setSocketMode] = useState(true);

  return (
    <>
      <SectionCard title="Rate Limiting">
        <SettingRow label="Max reminders per hour" description="Maximum number of Remi summary notifications sent per channel per hour.">
          <input type="number" min={1} max={20} value={maxReminders} onChange={(e) => setMaxReminders(e.target.value)}
            style={{ width: '72px', padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)', borderRadius: '6px', textAlign: 'center' }} />
        </SettingRow>
        <SettingRow label="Cooldown between summaries (minutes)" description="Minimum time between consecutive summaries for the same issue.">
          <input type="number" min={5} max={1440} value={cooldown} onChange={(e) => setCooldown(e.target.value)}
            style={{ width: '72px', padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)', borderRadius: '6px', textAlign: 'center' }} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Access Control">
        <SettingRow label="Minimum role to use /brief" description="Users below this role level cannot request summaries.">
          <select value={briefRole} onChange={(e) => setBriefRole(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)', borderRadius: '6px', background: '#fff' }}>
            {DEFAULT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Minimum role to use /link-ticket" description="Who can link Slack threads to Jira issues.">
          <select value={linkRole} onChange={(e) => setLinkRole(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)', borderRadius: '6px', background: '#fff' }}>
            {DEFAULT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </SettingRow>
      </SectionCard>

      <RolePrivacySection />
      <InfoGatheringSection appType="messaging" />

      <SectionCard title="Notifications">
        <SettingRow label="Summary delivery method" description="Where Remi posts generated summaries.">
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['thread', 'dm'] as const).map((v) => (
              <button key={v} onClick={() => setSummaryDelivery(v)} style={{
                padding: '6px 14px', fontSize: '13px', borderRadius: '6px', border: '1px solid',
                borderColor: summaryDelivery === v ? 'var(--remi-navy)' : 'var(--remi-border)',
                background: summaryDelivery === v ? 'var(--remi-accent-soft)' : 'var(--remi-surface)',
                color: summaryDelivery === v ? 'var(--remi-navy)' : 'var(--remi-muted)',
                fontWeight: summaryDelivery === v ? 600 : 400, cursor: 'pointer',
              }}>
                {v === 'thread' ? 'In-thread' : 'Direct message'}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Notify assignee on handoff gaps" description="Send a DM when an issue has no clear owner or a handoff is incomplete.">
          <Toggle checked={notifyAssignee} onChange={setNotifyAssignee} />
        </SettingRow>
        <SettingRow label="Socket Mode" description="Use WebSocket connection instead of HTTP endpoints. Required for local development.">
          <Toggle checked={socketMode} onChange={setSocketMode} />
        </SettingRow>
      </SectionCard>
    </>
  );
}

// ── Jira settings ────────────────────────────────────────────────────────────

function JiraSettings() {
  const [syncFrequency, setSyncFrequency] = useState('realtime');
  const [triggerStatus, setTriggerStatus] = useState(true);
  const [triggerAssignee, setTriggerAssignee] = useState(true);
  const [triggerPriority, setTriggerPriority] = useState(true);
  const [manualOnly, setManualOnly] = useState(false);
  const [includeLinked, setIncludeLinked] = useState(true);
  const [issueTypes, setIssueTypes] = useState<string[]>(['Bug', 'Story', 'Task']);
  const [adminProjects, setAdminProjects] = useState<string[]>([]);

  const allIssueTypes = ['Bug', 'Story', 'Task', 'Epic', 'Sub-task'];

  function toggleIssueType(t: string) {
    setIssueTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  return (
    <>
      <SectionCard title="Sync Configuration">
        <SettingRow label="Sync frequency" description="How often Remi polls Jira for updates. Realtime uses webhooks.">
          <select value={syncFrequency} onChange={(e) => setSyncFrequency(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)', borderRadius: '6px', background: '#fff' }}>
            <option value="realtime">Realtime (webhooks)</option>
            <option value="5">Every 5 minutes</option>
            <option value="15">Every 15 minutes</option>
            <option value="60">Hourly</option>
          </select>
        </SettingRow>
        <SettingRow label="Issue types to track" description="Only these types will be captured and summarised.">
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {allIssueTypes.map((t) => {
              const active = issueTypes.includes(t);
              return (
                <button key={t} onClick={() => toggleIssueType(t)} style={{
                  padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
                  border: '1px solid', borderColor: active ? 'var(--remi-navy)' : 'var(--remi-border)',
                  background: active ? 'var(--remi-accent-soft)' : 'var(--remi-surface)', color: active ? 'var(--remi-navy)' : 'var(--remi-muted)', cursor: 'pointer',
                }}>
                  {t}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow label="Include linked issues in summaries" description="Pull context from blocked-by and relates-to links.">
          <Toggle checked={includeLinked} onChange={setIncludeLinked} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Summary Triggers">
        <SettingRow label="Manual trigger only" description="Disable all automatic triggers. Summaries only run via /brief or admin rerun.">
          <Toggle checked={manualOnly} onChange={setManualOnly} />
        </SettingRow>
        {!manualOnly && (
          <>
            <SettingRow label="Trigger on status change" description="Generate a summary when an issue moves to a new status.">
              <Toggle checked={triggerStatus} onChange={setTriggerStatus} />
            </SettingRow>
            <SettingRow label="Trigger on assignee change" description="Generate a summary when the issue is reassigned.">
              <Toggle checked={triggerAssignee} onChange={setTriggerAssignee} />
            </SettingRow>
            <SettingRow label="Trigger on priority change" description="Generate a summary when priority is escalated or de-escalated.">
              <Toggle checked={triggerPriority} onChange={setTriggerPriority} />
            </SettingRow>
          </>
        )}
      </SectionCard>

      <RolePrivacySection />
      <InfoGatheringSection appType="task_planning" />

      <SectionCard title="Access Control">
        <SettingRow label="Admin-only projects" description="Projects whose summaries are only visible to Manager level and above.">
          <input
            placeholder="e.g. INFRA, SEC"
            value={adminProjects.join(', ')}
            onChange={(e) => setAdminProjects(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            style={{ width: '200px', padding: '6px 10px', fontSize: '13px', border: '1px solid var(--remi-border)', borderRadius: '6px' }}
          />
        </SettingRow>
      </SectionCard>
    </>
  );
}

// ── Not-connected placeholder ─────────────────────────────────────────────────

function NotConnectedBanner({ appName, onConnect }: { appName: string; onConnect: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 32px', background: 'var(--remi-accent-soft)' }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔌</div>
      <div style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px', color: 'var(--remi-ink)' }}>
        {appName} is not connected
      </div>
      <div style={{ fontSize: '14px', color: 'var(--remi-muted)', marginBottom: '24px', maxWidth: '380px', margin: '0 auto 24px' }}>
        Connect your {appName} account to start scanning emails for blockers, stalled threads, and cross-team dependencies.
      </div>
      <button
        onClick={onConnect}
        className="btn-primary"
        style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '6px', cursor: 'pointer' }}
      >
        Connect {appName}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IntegrationsClient() {
  const [activeApp, setActiveApp] = useState<AppId>('slack');
  const [appStates, setAppStates] = useState<Record<AppId, boolean>>({
    slack: true, jira: true, gmail: false, outlook: false,
  });
  const [saved, setSaved] = useState(false);

  const apps = APPS.map((a) => ({ ...a, connected: appStates[a.id] }));
  const app = apps.find((a) => a.id === activeApp)!;
  const typeColor = TYPE_COLORS[app.type];

  function handleConnect(id: AppId) {
    setAppStates((prev) => ({ ...prev, [id]: true }));
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function renderSettings() {
    if (!app.connected) {
      return <NotConnectedBanner appName={app.name} onConnect={() => handleConnect(app.id)} />;
    }
    if (activeApp === 'slack') return <SlackSettings />;
    if (activeApp === 'jira') return <JiraSettings />;
    if (activeApp === 'gmail') return <EmailSettingsClient provider="gmail" />;
    if (activeApp === 'outlook') return <EmailSettingsClient provider="outlook" />;
    return null;
  }

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Integration Settings</h1>
        <p style={{ fontSize: '14px', color: '#6c757d' }}>
          Configure controls, permissions, and data policies for each connected application.
        </p>
      </div>

      {/* Type legend */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(['messaging', 'task_planning'] as AppType[]).map((type) => {
          const c = TYPE_COLORS[type];
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '6px', background: c.bg, fontSize: '12px', fontWeight: 500, color: c.text }}>
              {type === 'messaging' ? 'Messaging' : 'Task Planning'}
            </div>
          );
        })}
        <div style={{ fontSize: '12px', color: '#6c757d', display: 'flex', alignItems: 'center' }}>
          Information gathering is enabled for all integrations
        </div>
      </div>

      {/* App tabs */}
      <div className="tab-strip" style={{ marginBottom: '28px' }}>
        {apps.map((a) => {
          const isActive = a.id === activeApp;
          const c = TYPE_COLORS[a.type];
          return (
            <button
              key={a.id}
              onClick={() => setActiveApp(a.id)}
              className={`tab-btn${isActive ? ' active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {a.name}
              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px', background: c.bg, color: c.text }}>
                {a.typeLabel}
              </span>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
                background: a.connected ? '#059669' : '#adb5bd',
              }} />
            </button>
          );
        })}
      </div>

      {renderSettings()}

      {/* Save bar — only show when connected */}
      {app.connected && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px' }}>
          {saved && <span style={{ fontSize: '13px', color: '#059669', fontWeight: 500 }}>Settings saved</span>}
          <button onClick={handleSave} className="btn-primary" style={{ padding: '9px 24px', fontSize: '14px', borderRadius: '6px', cursor: 'pointer' }}>
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
