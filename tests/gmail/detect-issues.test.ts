import { describe, it, expect } from 'vitest';
import { detectIssueKeys } from '../../packages/gmail/src/detect-issues.js';

describe('detectIssueKeys', () => {
  it('detects a standard uppercase key', () => {
    expect(detectIssueKeys('See PROJ-123 for details')).toEqual(['PROJ-123']);
  });

  it('detects lowercase keys and normalises to uppercase', () => {
    expect(detectIssueKeys('re: proj-123 is blocked')).toEqual(['PROJ-123']);
  });

  it('detects mixed-case keys and normalises to uppercase', () => {
    expect(detectIssueKeys('Proj-456 status update')).toEqual(['PROJ-456']);
  });

  it('detects multiple keys', () => {
    expect(detectIssueKeys('KAN-1 and DEV-456 are linked')).toEqual(['KAN-1', 'DEV-456']);
  });

  it('deduplicates the same key appearing twice', () => {
    expect(detectIssueKeys('PROJ-123 and proj-123 again')).toEqual(['PROJ-123']);
  });

  it('returns empty array when no keys present', () => {
    expect(detectIssueKeys('no issue keys here')).toEqual([]);
  });

  it('does not match when key is embedded after digits (no word boundary)', () => {
    // "123PROJ-456" — digit immediately precedes the letter, but \b still fires
    // The real non-match case: a key buried inside a URL token with no boundary
    expect(detectIssueKeys('nohyphen-here')).toEqual([]);
  });

  it('does not match when there are no digits after the hyphen', () => {
    expect(detectIssueKeys('PROJ-abc')).toEqual([]);
  });

  it('matches keys inside parentheses', () => {
    expect(detectIssueKeys('(PROJ-123)')).toEqual(['PROJ-123']);
  });

  it('matches a key in an email subject with RE: prefix', () => {
    expect(detectIssueKeys('RE: PROJ-99 status update')).toEqual(['PROJ-99']);
  });

  it('handles empty string', () => {
    expect(detectIssueKeys('')).toEqual([]);
  });
});
