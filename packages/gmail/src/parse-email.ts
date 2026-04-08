import type { EmailParticipant } from '@remi/shared';
import type { gmail_v1 } from 'googleapis';

/**
 * Parses RFC 2822 address header strings into structured EmailParticipant objects.
 * Handles "Display Name <email@addr>" and bare "email@addr" formats.
 * Normalises all addresses to lowercase.
 */
export function parseParticipants(
  fromHeader: string,
  toHeader: string,
  ccHeader: string,
): EmailParticipant[] {
  const participants: EmailParticipant[] = [];

  const parseHeader = (header: string, role: EmailParticipant['role']) => {
    if (!header) return;
    for (const part of header.split(',')) {
      const angleMatch = part.match(/<([^>]+@[^>]+)>/);
      const plainMatch = part.match(/([^\s,<>"]+@[^\s,<>"]+)/);
      const emailAddr = (angleMatch?.[1] ?? plainMatch?.[1] ?? '').trim();
      if (!emailAddr) continue;

      const nameMatch = part.match(/^([^<@,]+)</);
      participants.push({
        emailAddress: emailAddr.toLowerCase(),
        displayName: nameMatch?.[1].trim() || undefined,
        role,
      });
    }
  };

  parseHeader(fromHeader, 'from');
  parseHeader(toHeader, 'to');
  parseHeader(ccHeader, 'cc');

  return participants;
}

/**
 * Extracts plain-text body from a Gmail full-format message payload.
 * Walks the MIME tree, preferring text/plain parts and decoding base64url.
 * Returns empty string if no text body is found.
 */
export function extractPlainTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  function walk(part: gmail_v1.Schema$MessagePart): string {
    const mimeType = part.mimeType ?? '';

    if (mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }

    // Recurse into multipart/* containers — prefer text/plain over text/html
    if (mimeType.startsWith('multipart/') && Array.isArray(part.parts)) {
      const plainPart = part.parts.find((p) => p.mimeType === 'text/plain');
      if (plainPart) {
        const text = walk(plainPart);
        if (text) return text;
      }
      for (const child of part.parts) {
        const text = walk(child);
        if (text) return text;
      }
    }

    return '';
  }

  return walk(payload).trim();
}
