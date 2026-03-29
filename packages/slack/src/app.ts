import { createRequire } from 'module';
import type { App as SlackApp } from '@slack/bolt';

const require = createRequire(import.meta.url);
const { App: BoltApp, SocketModeReceiver } =
  require('@slack/bolt') as typeof import('@slack/bolt');

export interface SlackAuthorizeResult {
  botToken: string;
  botUserId: string;
}

export interface SlackAppConfig {
  signingSecret: string;
  botToken?: string;
  appToken?: string; // for Socket Mode
  socketMode?: boolean;
  authorize?: (context: { teamId?: string; enterpriseId?: string }) => Promise<SlackAuthorizeResult>;
}

export function createSlackApp(config: SlackAppConfig): SlackApp {
  if (config.socketMode) {
    if (!config.appToken) {
      throw new Error('appToken is required when socketMode is true');
    }
    const receiver = new SocketModeReceiver({
      appToken: config.appToken,
    });
    return new BoltApp({
      token: config.botToken,
      receiver,
    });
  }

  if (config.authorize) {
    return new BoltApp({
      signingSecret: config.signingSecret,
      authorize: config.authorize,
    });
  }

  return new BoltApp({
    signingSecret: config.signingSecret,
    token: config.botToken,
  });
}
