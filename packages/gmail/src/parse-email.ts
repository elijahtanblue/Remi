import type { EmailParticipant } from '@remi/shared';

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
