import { describe, it, expect } from 'vitest';
import { classifyActor, classifyThreadParticipants } from '@remi/email';
import type { ActorClassificationConfig } from '@remi/shared';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ActorClassificationConfig>): ActorClassificationConfig {
  return {
    workspaceId: 'ws-1',
    contactMappings: [
      {
        emailAddress: 'ceo@internal.com',
        profile: {
          actorType: 'colleague',
          segmentNamespace: 'department',
          segmentValue: 'Executive',
          roleLevel: 'CEO',
          sensitivityLevel: 'restricted',
        },
      },
    ],
    domainMappings: [
      {
        domain: 'vendor.io',
        profile: {
          actorType: 'vendor',
          segmentNamespace: 'company',
          segmentValue: 'Vendor Corp',
          sensitivityLevel: 'confidential',
        },
      },
      {
        domain: 'client.com',
        profile: {
          actorType: 'client',
          segmentNamespace: 'tier',
          segmentValue: 'enterprise',
          sensitivityLevel: 'confidential',
        },
      },
    ],
    defaultRule: {
      actorType: 'colleague',
      segmentNamespace: 'department',
      segmentValue: 'Unknown',
      sensitivityLevel: 'internal',
    },
    ...overrides,
  };
}

// ─── Mapping precedence ───────────────────────────────────────────────────────

describe('classifyActor — mapping precedence', () => {
  it('resolves by exact contact mapping (highest precedence)', () => {
    const result = classifyActor('ceo@internal.com', makeConfig());
    expect(result.mappingSource).toBe('contact');
    expect(result.roleLevel).toBe('CEO');
    expect(result.sensitivityLevel).toBe('restricted');
    expect(result.actorType).toBe('colleague');
  });

  it('contact match is case-insensitive', () => {
    const result = classifyActor('CEO@INTERNAL.COM', makeConfig());
    expect(result.mappingSource).toBe('contact');
    expect(result.roleLevel).toBe('CEO');
  });

  it('resolves by domain mapping when no contact matches', () => {
    const result = classifyActor('sales@vendor.io', makeConfig());
    expect(result.mappingSource).toBe('domain');
    expect(result.actorType).toBe('vendor');
    expect(result.segmentValue).toBe('Vendor Corp');
  });

  it('domain match is case-insensitive', () => {
    const result = classifyActor('SALES@VENDOR.IO', makeConfig());
    expect(result.mappingSource).toBe('domain');
    expect(result.actorType).toBe('vendor');
  });

  it('resolves client domain correctly', () => {
    const result = classifyActor('contact@client.com', makeConfig());
    expect(result.mappingSource).toBe('domain');
    expect(result.actorType).toBe('client');
    expect(result.sensitivityLevel).toBe('confidential');
  });

  it('falls back to default rule when no contact or domain matches', () => {
    const result = classifyActor('unknown@randomdomain.xyz', makeConfig());
    expect(result.mappingSource).toBe('default');
    expect(result.actorType).toBe('colleague');
    expect(result.sensitivityLevel).toBe('internal');
  });

  it('contact mapping takes priority over a matching domain mapping', () => {
    const config = makeConfig({
      contactMappings: [
        {
          emailAddress: 'special@vendor.io',
          profile: {
            actorType: 'colleague',
            segmentNamespace: 'department',
            segmentValue: 'Partner',
            sensitivityLevel: 'internal',
          },
        },
      ],
    });
    // 'special@vendor.io' has both a contact rule and a domain rule
    const result = classifyActor('special@vendor.io', config);
    expect(result.mappingSource).toBe('contact');
    expect(result.actorType).toBe('colleague'); // contact wins over domain's 'vendor'
  });

  it('handles address with no @ sign — falls back to default', () => {
    const result = classifyActor('notavalidemail', makeConfig());
    expect(result.mappingSource).toBe('default');
  });
});

// ─── classifyThreadParticipants ───────────────────────────────────────────────

describe('classifyThreadParticipants', () => {
  it('returns a profile for every address', () => {
    const config = makeConfig();
    const addresses = ['ceo@internal.com', 'sales@vendor.io', 'unknown@elsewhere.net'];
    const result = classifyThreadParticipants(addresses, config);

    expect(result.size).toBe(3);
    expect(result.get('ceo@internal.com')?.mappingSource).toBe('contact');
    expect(result.get('sales@vendor.io')?.mappingSource).toBe('domain');
    expect(result.get('unknown@elsewhere.net')?.mappingSource).toBe('default');
  });

  it('returns an empty map for an empty address list', () => {
    const result = classifyThreadParticipants([], makeConfig());
    expect(result.size).toBe(0);
  });

  it('deduplicates duplicate addresses', () => {
    // Map keys are unique, so duplicate input produces one entry
    const result = classifyThreadParticipants(
      ['sales@vendor.io', 'sales@vendor.io'],
      makeConfig(),
    );
    expect(result.size).toBe(1);
  });
});
