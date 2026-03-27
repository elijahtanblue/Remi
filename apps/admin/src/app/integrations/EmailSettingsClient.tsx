'use client';

import { useState } from 'react';
import type {
  MailboxGroupPolicy,
  AlertPolicy,
  EmailRetentionMode,
  ThreadSensitivity,
  ActorType,
  ContactMapping,
  DomainMapping,
  AccessPolicyRule,
} from '@remi/shared';

type Provider = 'gmail' | 'outlook';

// ─── Shared primitives ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: '40px', height: '22px', borderRadius: '11px', border: 'none',
      background: checked ? '#0066cc' : '#dee2e6', position: 'relative',
      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, padding: 0,
    }}>
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
      gap: '24px', padding: '16px 0', borderBottom: '1px solid #f1f3f5',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#212529' }}>{label}</div>
        {description && <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '3px' }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '20px', padding: 0 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f3f5', background: '#fafbfc', borderRadius: '8px 8px 0 0' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#495057', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '0 20px' }}>{children}<div style={{ height: '1px' }} /></div>
    </div>
  );
}

function selectStyle(): React.CSSProperties {
  return { padding: '6px 10px', fontSize: '13px', border: '1px solid #dee2e6', borderRadius: '6px', background: '#fff', cursor: 'pointer' };
}

function inputStyle(width = '200px'): React.CSSProperties {
  return { width, padding: '6px 10px', fontSize: '13px', border: '1px solid #dee2e6', borderRadius: '6px' };
}

const SENSITIVITY_OPTIONS: ThreadSensitivity[] = ['public', 'internal', 'confidential', 'restricted'];
const ACTOR_TYPES: ActorType[] = ['colleague', 'vendor', 'client'];
const ROLE_LEVELS = ['CEO', 'VP', 'Director', 'Manager', 'Associate', 'Contractor'];

// ─── Mailbox Group Editor ─────────────────────────────────────────────────────

interface GroupEditorProps {
  group: MailboxGroupPolicy;
  onChange: (g: MailboxGroupPolicy) => void;
  onRemove: () => void;
}

function MailboxGroupEditor({ group, onChange, onRemove }: GroupEditorProps) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof MailboxGroupPolicy>(k: K, v: MailboxGroupPolicy[K]) =>
    onChange({ ...group, [k]: v });
  const setAlert = <K extends keyof AlertPolicy>(k: K, v: AlertPolicy[K]) =>
    onChange({ ...group, alertPolicy: { ...group.alertPolicy, [k]: v } });

  return (
    <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', marginBottom: '12px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px', cursor: 'pointer', background: '#fafbfc', borderRadius: open ? '8px 8px 0 0' : '8px' }}
        onClick={() => setOpen(!open)}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: '#212529' }}>{group.name || 'Unnamed group'}</span>
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 500,
          background: group.retentionMode === 'full_body_allowed' ? '#fff3cd' : '#e8f4ff',
          color: group.retentionMode === 'full_body_allowed' ? '#856404' : '#0066cc',
        }}>
          {group.retentionMode === 'full_body_allowed' ? 'Full body' : 'Signals only'}
        </span>
        <span style={{ fontSize: '12px', color: '#6c757d' }}>{open ? '▲' : '▼'}</span>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{
          padding: '3px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dee2e6',
          background: '#fff', color: '#dc3545', cursor: 'pointer',
        }}>Remove</button>
      </div>

      {open && (
        <div style={{ padding: '0 16px', borderTop: '1px solid #f1f3f5' }}>
          <SettingRow label="Group name">
            <input value={group.name} onChange={(e) => set('name', e.target.value)} style={inputStyle('180px')} />
          </SettingRow>
          <SettingRow label="Monitored mailboxes / shared inboxes"
            description="Comma-separated email addresses opted in to monitoring. Org-wide ingestion is not supported.">
            <input
              value={group.monitoredSources.join(', ')}
              onChange={(e) => set('monitoredSources', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="team@example.com, shared@example.com"
              style={inputStyle('280px')}
            />
          </SettingRow>
          <SettingRow label="Retention mode"
            description="Full body retention stores email content. Signals-only stores metadata and blocker signals only.">
            <select value={group.retentionMode} onChange={(e) => set('retentionMode', e.target.value as EmailRetentionMode)} style={selectStyle()}>
              <option value="signals_only">Signals only</option>
              <option value="full_body_allowed">Full body allowed</option>
            </select>
          </SettingRow>
          <SettingRow label="Thread visibility for non-admin users">
            <select value={group.visibilityMode} onChange={(e) => set('visibilityMode', e.target.value as MailboxGroupPolicy['visibilityMode'])} style={selectStyle()}>
              <option value="blockers_only">Blocker cards only</option>
              <option value="full">Full summaries</option>
            </select>
          </SettingRow>
          <SettingRow label="Sensitivity default"
            description="Threads from this group inherit this sensitivity level unless a participant classification overrides it.">
            <select value={group.sensitivityDefault} onChange={(e) => set('sensitivityDefault', e.target.value as ThreadSensitivity)} style={selectStyle()}>
              {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </SettingRow>
          <SettingRow label="Thread age limit (days)"
            description="Threads with no activity older than this are excluded from ingestion.">
            <input type="number" min={1} max={365} value={group.threadAgeLimitDays}
              onChange={(e) => set('threadAgeLimitDays', Number(e.target.value))}
              style={{ ...inputStyle('72px'), textAlign: 'center' }} />
          </SettingRow>
          <SettingRow label="Notify on new blocker">
            <Toggle checked={group.alertPolicy.notifyOnNewBlocker} onChange={(v) => setAlert('notifyOnNewBlocker', v)} />
          </SettingRow>
          <SettingRow label="Digest frequency">
            <select value={group.alertPolicy.digestFrequency} onChange={(e) => setAlert('digestFrequency', e.target.value as AlertPolicy['digestFrequency'])} style={selectStyle()}>
              <option value="realtime">Real-time only</option>
              <option value="daily">Daily digest</option>
              <option value="twice_daily">Twice daily</option>
              <option value="weekly">Weekly digest</option>
              <option value="never">Never</option>
            </select>
          </SettingRow>
          <SettingRow label="Slack alert channel" description="Where Remi posts blocker notifications for this group.">
            <input value={group.alertPolicy.slackChannel ?? ''} placeholder="#blockers" onChange={(e) => setAlert('slackChannel', e.target.value)} style={inputStyle('160px')} />
          </SettingRow>
        </div>
      )}
    </div>
  );
}

// ─── Actor Classification ─────────────────────────────────────────────────────

function ActorClassificationSection() {
  const [contacts, setContacts] = useState<ContactMapping[]>([]);
  const [domains, setDomains] = useState<DomainMapping[]>([]);
  const [defaultActorType, setDefaultActorType] = useState<ActorType>('colleague');
  const [defaultSensitivity, setDefaultSensitivity] = useState<ThreadSensitivity>('internal');

  function addContact() {
    setContacts(prev => [...prev, {
      emailAddress: '',
      profile: { actorType: 'colleague', segmentNamespace: 'department', segmentValue: '', sensitivityLevel: 'internal' },
    }]);
  }

  function addDomain() {
    setDomains(prev => [...prev, {
      domain: '',
      profile: { actorType: 'vendor', segmentNamespace: 'company', segmentValue: '', sensitivityLevel: 'confidential' },
    }]);
  }

  const mappingRowStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px',
    alignItems: 'center', marginBottom: '8px',
  };

  return (
    <SectionCard title="Actor Classification">
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '16px' }}>
          Map email addresses and domains to actor types (colleague / vendor / client) and sensitivity levels.
          Precedence: <strong>specific contact</strong> {'>'} <strong>domain</strong> {'>'} <strong>default rule</strong>.
        </div>

        {/* Contact mappings */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#212529' }}>Contact mappings (exact email)</span>
            <button onClick={addContact} style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid #0066cc', background: '#e8f4ff', color: '#0066cc', cursor: 'pointer' }}>
              + Add contact
            </button>
          </div>
          {contacts.length === 0 && (
            <div style={{ fontSize: '12px', color: '#adb5bd', fontStyle: 'italic' }}>No contact mappings configured.</div>
          )}
          {contacts.map((c, i) => (
            <div key={i} style={mappingRowStyle}>
              <input placeholder="user@domain.com" value={c.emailAddress}
                onChange={(e) => setContacts(prev => prev.map((x, j) => j === i ? { ...x, emailAddress: e.target.value } : x))}
                style={inputStyle('100%')} />
              <select value={c.profile.actorType}
                onChange={(e) => setContacts(prev => prev.map((x, j) => j === i ? { ...x, profile: { ...x.profile, actorType: e.target.value as ActorType } } : x))}
                style={selectStyle()}>
                {ACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input placeholder="Segment value (e.g. Engineering)" value={c.profile.segmentValue}
                onChange={(e) => setContacts(prev => prev.map((x, j) => j === i ? { ...x, profile: { ...x.profile, segmentValue: e.target.value } } : x))}
                style={inputStyle('100%')} />
              <select value={c.profile.sensitivityLevel}
                onChange={(e) => setContacts(prev => prev.map((x, j) => j === i ? { ...x, profile: { ...x.profile, sensitivityLevel: e.target.value as ThreadSensitivity } } : x))}
                style={selectStyle()}>
                {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => setContacts(prev => prev.filter((_, j) => j !== i))}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dee2e6', background: '#fff', color: '#dc3545', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Domain mappings */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#212529' }}>Domain mappings</span>
            <button onClick={addDomain} style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid #0066cc', background: '#e8f4ff', color: '#0066cc', cursor: 'pointer' }}>
              + Add domain
            </button>
          </div>
          {domains.length === 0 && (
            <div style={{ fontSize: '12px', color: '#adb5bd', fontStyle: 'italic' }}>No domain mappings configured.</div>
          )}
          {domains.map((d, i) => (
            <div key={i} style={mappingRowStyle}>
              <input placeholder="vendor.com" value={d.domain}
                onChange={(e) => setDomains(prev => prev.map((x, j) => j === i ? { ...x, domain: e.target.value } : x))}
                style={inputStyle('100%')} />
              <select value={d.profile.actorType}
                onChange={(e) => setDomains(prev => prev.map((x, j) => j === i ? { ...x, profile: { ...x.profile, actorType: e.target.value as ActorType } } : x))}
                style={selectStyle()}>
                {ACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input placeholder="Segment value (e.g. Acme Corp)" value={d.profile.segmentValue}
                onChange={(e) => setDomains(prev => prev.map((x, j) => j === i ? { ...x, profile: { ...x.profile, segmentValue: e.target.value } } : x))}
                style={inputStyle('100%')} />
              <select value={d.profile.sensitivityLevel}
                onChange={(e) => setDomains(prev => prev.map((x, j) => j === i ? { ...x, profile: { ...x.profile, sensitivityLevel: e.target.value as ThreadSensitivity } } : x))}
                style={selectStyle()}>
                {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => setDomains(prev => prev.filter((_, j) => j !== i))}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dee2e6', background: '#fff', color: '#dc3545', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Default rule */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#212529', marginBottom: '8px' }}>
            Default rule (fallback for unmatched addresses)
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={defaultActorType} onChange={(e) => setDefaultActorType(e.target.value as ActorType)} style={selectStyle()}>
              {ACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={defaultSensitivity} onChange={(e) => setDefaultSensitivity(e.target.value as ThreadSensitivity)} style={selectStyle()}>
              {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: '#6c757d' }}>Unmatched addresses will be classified as {defaultActorType} / {defaultSensitivity}</span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Access Policies ──────────────────────────────────────────────────────────

function AccessPoliciesSection() {
  const [rules, setRules] = useState<AccessPolicyRule[]>([
    { viewerRoleLevel: 'Director', allowedActorTypes: ['colleague', 'vendor', 'client'], bodyRetentionEligible: true, threadVisibilityMode: 'full' },
    { viewerRoleLevel: 'Manager', allowedActorTypes: ['colleague', 'vendor'], bodyRetentionEligible: false, threadVisibilityMode: 'blockers_only' },
  ]);

  function addRule() {
    setRules(prev => [...prev, {
      viewerRoleLevel: 'Associate',
      allowedActorTypes: ['colleague'],
      bodyRetentionEligible: false,
      threadVisibilityMode: 'blockers_only',
    }]);
  }

  function toggleActorType(i: number, type: ActorType) {
    setRules(prev => prev.map((r, j) => {
      if (j !== i) return r;
      const has = r.allowedActorTypes.includes(type);
      return {
        ...r,
        allowedActorTypes: has
          ? r.allowedActorTypes.filter(t => t !== type)
          : [...r.allowedActorTypes, type],
      };
    }));
  }

  return (
    <SectionCard title="Access Policies">
      <div style={{ padding: '12px 0 4px' }}>
        <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '16px' }}>
          Define which viewer roles can access which actor types. Default deny: unmatched roles receive no access.
        </div>
        {rules.map((rule, i) => (
          <div key={i} style={{ border: '1px solid #f1f3f5', borderRadius: '6px', padding: '12px 14px', marginBottom: '10px', background: '#fafbfc' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '4px' }}>VIEWER ROLE</div>
                <select value={rule.viewerRoleLevel}
                  onChange={(e) => setRules(prev => prev.map((r, j) => j === i ? { ...r, viewerRoleLevel: e.target.value } : r))}
                  style={selectStyle()}>
                  {ROLE_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '4px' }}>CAN SEE ACTOR TYPES</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {ACTOR_TYPES.map(type => {
                    const active = rule.allowedActorTypes.includes(type);
                    return (
                      <button key={type} onClick={() => toggleActorType(i, type)} style={{
                        padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
                        border: '1px solid', borderColor: active ? '#0066cc' : '#dee2e6',
                        background: active ? '#e8f4ff' : '#fff', color: active ? '#0066cc' : '#6c757d', cursor: 'pointer',
                      }}>
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '4px' }}>THREAD VIEW</div>
                <select value={rule.threadVisibilityMode}
                  onChange={(e) => setRules(prev => prev.map((r, j) => j === i ? { ...r, threadVisibilityMode: e.target.value as AccessPolicyRule['threadVisibilityMode'] } : r))}
                  style={selectStyle()}>
                  <option value="blockers_only">Blocker cards only</option>
                  <option value="full">Full summaries</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '4px' }}>BODY ACCESS</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '6px' }}>
                  <Toggle checked={rule.bodyRetentionEligible}
                    onChange={(v) => setRules(prev => prev.map((r, j) => j === i ? { ...r, bodyRetentionEligible: v } : r))} />
                  <span style={{ fontSize: '12px', color: '#6c757d' }}>Allowed</span>
                </div>
              </div>
              <button onClick={() => setRules(prev => prev.filter((_, j) => j !== i))}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dee2e6', background: '#fff', color: '#dc3545', cursor: 'pointer', marginTop: '18px' }}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button onClick={addRule} style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '6px', border: '1px solid #0066cc', background: '#e8f4ff', color: '#0066cc', cursor: 'pointer' }}>
          + Add policy rule
        </button>
      </div>
    </SectionCard>
  );
}

// ─── Blocker Detection ────────────────────────────────────────────────────────

const DEFAULT_KEYWORDS = [
  'blocked', 'waiting on', 'pending approval', 'delayed', 'stuck',
  'need sign-off', 'no response', 'overdue', 'at risk', 'following up',
];

function BlockerDetectionSection() {
  const [enabled, setEnabled] = useState(true);
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [newKw, setNewKw] = useState('');
  const [escalation, setEscalation] = useState(true);
  const [crossTeam, setCrossTeam] = useState(true);
  const [staleThreshold, setStaleThreshold] = useState('3');
  const [watchedDomains, setWatchedDomains] = useState('');

  function addKw() {
    const kw = newKw.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) setKeywords(prev => [...prev, kw]);
    setNewKw('');
  }

  return (
    <SectionCard title="Blocker Detection">
      <SettingRow label="Enable blocker scanning"
        description="Remi analyses email threads to surface blockers, stalled vendor responses, and cross-team dependencies.">
        <Toggle checked={enabled} onChange={setEnabled} />
      </SettingRow>

      {enabled && (<>
        <SettingRow label="Escalation detection"
          description="Flag threads where executives (VP / CEO) are CC'd mid-conversation — a strong signal of an unresolved blocker.">
          <Toggle checked={escalation} onChange={setEscalation} />
        </SettingRow>
        <SettingRow label="Cross-team thread detection"
          description="Flag threads spanning multiple internal teams as potential dependency blockers.">
          <Toggle checked={crossTeam} onChange={setCrossTeam} />
        </SettingRow>
        <SettingRow label="Stale thread threshold (days)"
          description="Threads with no reply after this many days are flagged as stale.">
          <input type="number" min={1} max={30} value={staleThreshold}
            onChange={(e) => setStaleThreshold(e.target.value)}
            style={{ ...inputStyle('72px'), textAlign: 'center' }} />
        </SettingRow>
        <SettingRow label="Vendor / client watchlist domains"
          description="Threads involving these external domains are treated as high-priority for blocker detection.">
          <input placeholder="e.g. acme.com, partner.io" value={watchedDomains}
            onChange={(e) => setWatchedDomains(e.target.value)} style={inputStyle('220px')} />
        </SettingRow>
        <SettingRow label="Custom blocker keywords"
          description="Additional phrases that trigger a soft-risk blocker. Click a keyword to remove it.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '360px' }}>
              {keywords.map(kw => (
                <span key={kw} onClick={() => setKeywords(prev => prev.filter(k => k !== kw))}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '14px', fontSize: '12px', fontWeight: 500, background: '#e8f4ff', color: '#0066cc', border: '1px solid #b6d4fe', cursor: 'pointer' }}>
                  {kw} <span style={{ opacity: 0.6, fontSize: '11px' }}>✕</span>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input value={newKw} onChange={(e) => setNewKw(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKw()}
                placeholder="Add keyword…"
                style={{ width: '140px', padding: '5px 8px', fontSize: '12px', border: '1px solid #dee2e6', borderRadius: '6px' }} />
              <button onClick={addKw} style={{ padding: '5px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer' }}>
                Add
              </button>
            </div>
          </div>
        </SettingRow>
      </>)}
    </SectionCard>
  );
}

// ─── Storage & Retention ──────────────────────────────────────────────────────

function StorageRetentionSection() {
  const [defaultRetention, setDefaultRetention] = useState<EmailRetentionMode>('signals_only');
  const [retentionDays, setRetentionDays] = useState('90');
  const [attachmentMeta, setAttachmentMeta] = useState(true);
  const [anonymize, setAnonymize] = useState(false);

  return (
    <SectionCard title="Storage & Retention">
      <SettingRow label="Default retention mode"
        description="Applies to mailbox groups without an explicit override. Full body retention must be approved per group.">
        <select value={defaultRetention} onChange={(e) => setDefaultRetention(e.target.value as EmailRetentionMode)} style={selectStyle()}>
          <option value="signals_only">Signals only (recommended)</option>
          <option value="full_body_allowed">Full body allowed</option>
        </select>
      </SettingRow>
      <SettingRow label="Retention period" description="How long captured email data is stored.">
        <select value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} style={selectStyle()}>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
          <option value="180">180 days</option>
          <option value="365">1 year</option>
        </select>
      </SettingRow>
      <SettingRow label="Capture attachment metadata"
        description="Record attachment filenames and MIME types. File contents are never stored in v1.">
        <Toggle checked={attachmentMeta} onChange={setAttachmentMeta} />
      </SettingRow>
      <SettingRow label="Anonymize names in summaries"
        description="Replace sender / recipient names with role labels in all generated output.">
        <Toggle checked={anonymize} onChange={setAnonymize} />
      </SettingRow>
    </SectionCard>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

function newGroup(name: string): MailboxGroupPolicy {
  return {
    id: crypto.randomUUID(),
    name,
    monitoredSources: [],
    retentionMode: 'signals_only',
    visibilityMode: 'blockers_only',
    alertPolicy: { notifyOnNewBlocker: true, digestFrequency: 'daily' },
    sensitivityDefault: 'internal',
    threadAgeLimitDays: 30,
  };
}

export default function EmailSettingsClient({ provider }: { provider: Provider }) {
  const [connectedAccount, setConnectedAccount] = useState('');
  const [groups, setGroups] = useState<MailboxGroupPolicy[]>([newGroup('Primary inbox')]);

  const providerName = provider === 'gmail' ? 'Gmail' : 'Outlook';

  return (
    <>
      {/* Connection */}
      <SectionCard title="Connection">
        <SettingRow
          label="Connected account"
          description={`Read-only OAuth access. Remi never sends email on your behalf.`}>
          {connectedAccount ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: '#212529' }}>{connectedAccount}</span>
              <button onClick={() => setConnectedAccount('')} style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid #dee2e6', background: '#fff', color: '#dc3545', cursor: 'pointer' }}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConnectedAccount('admin@example.com')}
              style={{ padding: '7px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: '1px solid #0066cc', background: '#0066cc', color: '#fff', cursor: 'pointer' }}>
              Connect {providerName} account
            </button>
          )}
        </SettingRow>
      </SectionCard>

      {/* Mailbox Groups */}
      <SectionCard title="Mailbox Groups">
        <div style={{ padding: '12px 0 4px' }}>
          <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '16px' }}>
            Create groups of opted-in mailboxes with separate retention, visibility, and alert policies.
            Only listed mailboxes are monitored — org-wide ingestion is not available in v1.
          </div>
          {groups.map((g, i) => (
            <MailboxGroupEditor
              key={g.id}
              group={g}
              onChange={(updated) => setGroups(prev => prev.map((x, j) => j === i ? updated : x))}
              onRemove={() => setGroups(prev => prev.filter((_, j) => j !== i))}
            />
          ))}
          <button
            onClick={() => setGroups(prev => [...prev, newGroup(`Group ${prev.length + 1}`)])}
            style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '6px', border: '1px solid #0066cc', background: '#e8f4ff', color: '#0066cc', cursor: 'pointer' }}>
            + Add mailbox group
          </button>
        </div>
      </SectionCard>

      <ActorClassificationSection />
      <AccessPoliciesSection />
      <BlockerDetectionSection />
      <StorageRetentionSection />
    </>
  );
}
