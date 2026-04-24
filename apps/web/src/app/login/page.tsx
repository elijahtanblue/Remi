import { redirect } from 'next/navigation';
import { getSessionToken } from '@/lib/session';

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed:       'Sign-in was cancelled or failed. Please try again.',
  state_mismatch:     'Security check failed. Please try signing in again.',
  slack_auth_failed:  'Could not authenticate with Slack. Please try again.',
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  if (await getSessionToken()) redirect('/queue');

  const { error } = await searchParams;
  const raw = error;
  const errorMsg = raw
    ? (ERROR_MESSAGES[raw] ?? decodeURIComponent(raw))
    : null;

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoText}>Remi</span>
          <p style={styles.tagline}>Operational coordination platform</p>
        </div>

        {errorMsg && (
          <div style={styles.error}>{errorMsg}</div>
        )}

        <a href="/auth/slack" style={styles.slackBtn}>
          <SlackMark />
          Sign in with Slack
        </a>
      </div>
    </main>
  );
}

function SlackMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 122.8 122.8" xmlns="http://www.w3.org/2000/svg">
      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#e01e5a"/>
      <path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#e01e5a"/>
      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36c5f0"/>
      <path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36c5f0"/>
      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2eb67d"/>
      <path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2eb67d"/>
      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ecb22e"/>
      <path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ecb22e"/>
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--remi-canvas)',
  },
  card: {
    width: 360,
    padding: '40px 32px',
    background: 'var(--remi-surface)',
    borderRadius: 12,
    border: '1px solid var(--remi-border)',
    boxShadow: '0 4px 16px rgba(0,0,0,.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  logo: { textAlign: 'center' },
  logoText: { fontSize: 28, fontWeight: 700, color: 'var(--remi-navy)' },
  tagline: { marginTop: 6, color: 'var(--remi-muted)', fontSize: 13 },
  error: {
    background: '#FEE2E2',
    border: '1px solid #FECACA',
    color: 'var(--remi-red)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
  },
  slackBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: '#4A154B',
    color: '#fff',
    fontWeight: 600,
    fontSize: 15,
    padding: '12px 20px',
    borderRadius: 8,
    textDecoration: 'none',
    transition: 'background 0.15s',
  },
};
