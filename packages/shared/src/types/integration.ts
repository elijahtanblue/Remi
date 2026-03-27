export type AppType = 'messaging' | 'task_planning';

export interface IntegrationCapabilities {
  blockerDetection: boolean;
  summaryGeneration: boolean;
  threadCapture: boolean;
  issueSync: boolean;
  emailIngestion: boolean;
}

export interface IntegrationDefinition {
  integrationKey: string;
  name: string;
  appType: AppType;
  capabilities: IntegrationCapabilities;
}

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    integrationKey: 'slack',
    name: 'Slack',
    appType: 'messaging',
    capabilities: {
      blockerDetection: true,
      summaryGeneration: true,
      threadCapture: true,
      issueSync: false,
      emailIngestion: false,
    },
  },
  {
    integrationKey: 'gmail',
    name: 'Gmail',
    appType: 'messaging',
    capabilities: {
      blockerDetection: true,
      summaryGeneration: false,
      threadCapture: true,
      issueSync: false,
      emailIngestion: true,
    },
  },
  {
    integrationKey: 'outlook',
    name: 'Outlook',
    appType: 'messaging',
    capabilities: {
      blockerDetection: true,
      summaryGeneration: false,
      threadCapture: true,
      issueSync: false,
      emailIngestion: true,
    },
  },
  {
    integrationKey: 'jira',
    name: 'Jira',
    appType: 'task_planning',
    capabilities: {
      blockerDetection: false,
      summaryGeneration: true,
      threadCapture: false,
      issueSync: true,
      emailIngestion: false,
    },
  },
];
