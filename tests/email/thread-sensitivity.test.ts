import { describe, it, expect } from 'vitest';
import { deriveThreadSensitivity, canViewSensitivity } from '@remi/email';
import type { ActorProfile } from '@remi/shared';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeProfile(sensitivityLevel: ActorProfile['sensitivityLevel']): ActorProfile {
  return {
    actorType: 'colleague',
    segmentNamespace: 'department',
    segmentValue: 'Engineering',
    sensitivityLevel,
    mappingSource: 'domain',
  };
}

// ─── deriveThreadSensitivity — highest wins ───────────────────────────────────

describe('deriveThreadSensitivity', () => {
  it('returns group default when no participants are provided', () => {
    expect(deriveThreadSensitivity([], 'internal')).toBe('internal');
    expect(deriveThreadSensitivity([], 'confidential')).toBe('confidential');
  });

  it('single participant — inherits that sensitivity', () => {
    const result = deriveThreadSensitivity([makeProfile('confidential')], 'internal');
    expect(result).toBe('confidential');
  });

  it('highest sensitivity participant wins', () => {
    const profiles = [
      makeProfile('public'),
      makeProfile('internal'),
      makeProfile('restricted'),
      makeProfile('confidential'),
    ];
    expect(deriveThreadSensitivity(profiles, 'public')).toBe('restricted');
  });

  it('group default acts as floor when participants are all public', () => {
    const profiles = [makeProfile('public'), makeProfile('public')];
    expect(deriveThreadSensitivity(profiles, 'internal')).toBe('internal');
  });

  it('participant sensitivity above group default overrides the floor', () => {
    const profiles = [makeProfile('restricted')];
    expect(deriveThreadSensitivity(profiles, 'internal')).toBe('restricted');
  });

  it('mixed vendor/client/colleague thread uses strictest participant', () => {
    const colleague = { ...makeProfile('internal'), actorType: 'colleague' as const };
    const vendor = { ...makeProfile('confidential'), actorType: 'vendor' as const };
    const client = { ...makeProfile('restricted'), actorType: 'client' as const };
    expect(deriveThreadSensitivity([colleague, vendor, client], 'internal')).toBe('restricted');
  });
});

// ─── canViewSensitivity ───────────────────────────────────────────────────────

describe('canViewSensitivity', () => {
  it('public content is visible to all roles', () => {
    for (const role of ['Contractor', 'Associate', 'Manager', 'Director', 'VP', 'CEO']) {
      expect(canViewSensitivity(role, 'public')).toBe(true);
    }
  });

  it('internal content requires at least Associate', () => {
    expect(canViewSensitivity('Contractor', 'internal')).toBe(false);
    expect(canViewSensitivity('Associate', 'internal')).toBe(true);
    expect(canViewSensitivity('Manager', 'internal')).toBe(true);
  });

  it('confidential content requires at least Manager', () => {
    expect(canViewSensitivity('Associate', 'confidential')).toBe(false);
    expect(canViewSensitivity('Manager', 'confidential')).toBe(true);
    expect(canViewSensitivity('Director', 'confidential')).toBe(true);
  });

  it('restricted content requires at least Director', () => {
    expect(canViewSensitivity('Manager', 'restricted')).toBe(false);
    expect(canViewSensitivity('Director', 'restricted')).toBe(true);
    expect(canViewSensitivity('VP', 'restricted')).toBe(true);
    expect(canViewSensitivity('CEO', 'restricted')).toBe(true);
  });

  it('unknown role defaults to rank 0 (cannot see internal+)', () => {
    expect(canViewSensitivity('Intern', 'internal')).toBe(false);
    expect(canViewSensitivity('Intern', 'public')).toBe(true);
  });
});
