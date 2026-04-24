'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  scopes: { id: string; name: string }[];
}

type FormState = {
  name: string;
  workflowKey: string;
  scopeId: string;
  includedJiraProjects: string;
  includedChannelIds: string;
  includedMailboxes: string;
  writebackEnabled: boolean;
  approvalRequired: boolean;
};

const TEMPLATES: { label: string; fill: Omit<FormState, 'scopeId' | 'includedChannelIds'> }[] = [
  {
    label: 'Vendor Escalation',
    fill: { name: 'Vendor Escalation', workflowKey: 'vendor-escalation', includedJiraProjects: 'SUP, ESC', includedMailboxes: 'support@example.com', writebackEnabled: true, approvalRequired: true },
  },
  {
    label: 'Support Escalation',
    fill: { name: 'Support Escalation', workflowKey: 'support-escalation', includedJiraProjects: 'CS, SUP', includedMailboxes: 'support@example.com', writebackEnabled: true, approvalRequired: true },
  },
  {
    label: 'Implementation Handoff',
    fill: { name: 'Implementation Handoff', workflowKey: 'implementation-handoff', includedJiraProjects: 'IMP', includedMailboxes: 'impl@example.com', writebackEnabled: false, approvalRequired: true },
  },
  {
    label: 'Cross-functional Delivery',
    fill: { name: 'Cross-functional Delivery', workflowKey: 'delivery-blocker', includedJiraProjects: 'ENG, PM, PROJ', includedMailboxes: '', writebackEnabled: true, approvalRequired: true },
  },
];

export default function CreateConfigForm({ scopes }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    workflowKey: '',
    scopeId: scopes[0]?.id ?? '',
    includedJiraProjects: '',
    includedChannelIds: '',
    includedMailboxes: '',
    writebackEnabled: false,
    approvalRequired: true,
  });

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    setForm((f) => ({ ...f, ...tpl.fill }));
  }

  function split(s: string) {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workflow-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          workflowKey: form.workflowKey,
          scopeId: form.scopeId,
          includedJiraProjects: split(form.includedJiraProjects),
          includedChannelIds: split(form.includedChannelIds),
          includedMailboxes: split(form.includedMailboxes),
          writebackEnabled: form.writebackEnabled,
          approvalRequired: form.approvalRequired,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create config');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={styles.addBtn}>
        + Add workflow config
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.formTitleRow}>
        <h3 style={styles.formTitle}>New workflow config</h3>
        <div style={styles.templateRow}>
          <span style={styles.templateLabel}>Template:</span>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => applyTemplate(tpl)}
              style={styles.templateBtn}
            >
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.fieldRow}>
        <FormField label="Name">
          <input
            style={styles.input}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Vendor Escalation"
            required
          />
        </FormField>
        <FormField label="Workflow key">
          <input
            style={styles.input}
            value={form.workflowKey}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                workflowKey: e.target.value.toLowerCase().replace(/\s+/g, '-'),
              }))
            }
            placeholder="vendor-escalation"
            required
          />
        </FormField>
      </div>

      <FormField label="Scope">
        <select
          style={styles.input}
          value={form.scopeId}
          onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
        >
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Jira projects" hint="Comma-separated project keys, e.g. SUP, ESC">
        <input
          style={styles.input}
          value={form.includedJiraProjects}
          onChange={(e) => setForm((f) => ({ ...f, includedJiraProjects: e.target.value }))}
          placeholder="SUP, ESC"
        />
      </FormField>

      <FormField label="Slack channels" hint="Channel IDs, comma-separated">
        <input
          style={styles.input}
          value={form.includedChannelIds}
          onChange={(e) => setForm((f) => ({ ...f, includedChannelIds: e.target.value }))}
          placeholder="C01ABC123, C02XYZ456"
        />
      </FormField>

      <FormField label="Mailboxes" hint="Email addresses, comma-separated">
        <input
          style={styles.input}
          value={form.includedMailboxes}
          onChange={(e) => setForm((f) => ({ ...f, includedMailboxes: e.target.value }))}
          placeholder="support@example.com"
        />
      </FormField>

      <div style={styles.toggleRow}>
        <ToggleField
          label="Writeback enabled"
          checked={form.writebackEnabled}
          onChange={(v) => setForm((f) => ({ ...f, writebackEnabled: v }))}
        />
        <ToggleField
          label="Approval required"
          checked={form.approvalRequired}
          onChange={(v) => setForm((f) => ({ ...f, approvalRequired: v }))}
        />
      </div>

      <div style={styles.actions}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={styles.cancelBtn}
          disabled={loading}
        >
          Cancel
        </button>
        <button type="submit" style={styles.submitBtn} disabled={loading}>
          {loading ? 'Creating…' : 'Create config'}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--remi-muted)' }}>{label}</label>
      {hint && <span style={{ fontSize: 11, color: 'var(--remi-muted)' }}>{hint}</span>}
      {children}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  addBtn: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--remi-blue)',
    background: 'none',
    border: '1px dashed var(--remi-border)',
    borderRadius: 8,
    padding: '10px 20px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  form: {
    background: 'var(--remi-surface)',
    border: '1px solid var(--remi-border)',
    borderRadius: 8,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formTitleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const },
  formTitle: { fontSize: 14, fontWeight: 600, color: 'var(--remi-ink)' },
  templateRow: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const },
  templateLabel: { fontSize: 11, color: 'var(--remi-muted)', fontWeight: 600, marginRight: 2 },
  templateBtn: { fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--remi-border)', background: '#F9FAFB', color: 'var(--remi-ink)', cursor: 'pointer' },
  fieldRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  input: {
    fontSize: 13,
    padding: '7px 10px',
    border: '1px solid var(--remi-border)',
    borderRadius: 6,
    color: 'var(--remi-ink)',
    background: 'var(--remi-canvas)',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  toggleRow: { display: 'flex', gap: 24 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  cancelBtn: {
    fontSize: 13,
    fontWeight: 500,
    padding: '7px 16px',
    borderRadius: 6,
    border: '1px solid var(--remi-border)',
    background: 'none',
    cursor: 'pointer',
    color: 'var(--remi-ink)',
  },
  submitBtn: {
    fontSize: 13,
    fontWeight: 600,
    padding: '7px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--remi-navy)',
    color: '#fff',
    cursor: 'pointer',
  },
  error: {
    background: '#FEE2E2',
    border: '1px solid #FECACA',
    color: 'var(--remi-red)',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  },
};
