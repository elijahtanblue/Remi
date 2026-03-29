import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export function createGmailClient(
  serviceAccountJson: string,
  impersonateEmail: string,
): gmail_v1.Gmail {
  const key = JSON.parse(serviceAccountJson) as ServiceAccountKey;
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: impersonateEmail,
  });
  return google.gmail({ version: 'v1', auth });
}
