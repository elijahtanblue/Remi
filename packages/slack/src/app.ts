import { createRequire } from 'module';
import type { App as SlackApp } from '@slack/bolt';

const require = createRequire(import.meta.url);
const { App: BoltApp, SocketModeReceiver } =
  require('@slack/bolt') as typeof import('@slack/bolt');

export interface SlackAppConfig {
  signingSecret: string;
  botToken?: string;
  appToken?: string; // for Socket Mode
  socketMode?: boolean;
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

  return new BoltApp({
    signingSecret: config.signingSecret,
    token: config.botToken,
  });
}
