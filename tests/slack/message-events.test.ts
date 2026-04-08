import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerMessageEvents } from '../../packages/slack/src/events/message.js';
import type { IQueueProducer } from '../../packages/queue/src/index.js';

// ── Mock @remi/db ────────────────────────────────────────────────────────────
const mockGetMemoryConfig = vi.fn();
const mockFindIssueByKey = vi.fn();
const mockUpsertSlackThread = vi.fn();
const mockUpsertIssueThreadLink = vi.fn();
const mockFindSlackThreadByTs = vi.fn();
const mockFindLinksByThreadId = vi.fn();

vi.mock('@remi/db', () => ({
  prisma: {},
  getMemoryConfig: (...args: unknown[]) => mockGetMemoryConfig(...args),
  findIssueByKey: (...args: unknown[]) => mockFindIssueByKey(...args),
  upsertSlackThread: (...args: unknown[]) => mockUpsertSlackThread(...args),
  upsertIssueThreadLink: (...args: unknown[]) => mockUpsertIssueThreadLink(...args),
  findSlackThreadByTs: (...args: unknown[]) => mockFindSlackThreadByTs(...args),
  findLinksByThreadId: (...args: unknown[]) => mockFindLinksByThreadId(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQueue(): IQueueProducer & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as IQueueProducer & { send: ReturnType<typeof vi.fn> };
}

function makeApp() {
  const handlers: Record<string, (payload: unknown) => Promise<void>> = {};
  return {
    event: (eventName: string, handler: (payload: unknown) => Promise<void>) => {
      handlers[eventName] = handler;
    },
    trigger: async (eventName: string, payload: unknown) => {
      await handlers[eventName]?.(payload);
    },
  };
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return { teamId: 'T1', workspaceId: 'ws1', ...overrides };
}

function makeLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Top-level message (channel tracking) ────────────────────────────────────

describe('channel tracking — top-level messages', () => {
  it('does nothing when memory config is disabled', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: false, trackedChannelIds: ['C1'] });
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'KAN-1 is done', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does nothing when channel is not tracked', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C999'] });
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'KAN-1 is done', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does nothing when no ticket keys are mentioned', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'no tickets here', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does nothing when ticket key mentioned but issue not in DB', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    mockUpsertSlackThread.mockResolvedValue({ id: 'thread1' });
    mockFindIssueByKey.mockResolvedValue(null);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'KAN-1 is done', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('upserts thread+link and queues SLACK_EVENTS when tracked channel mentions known ticket', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    mockUpsertSlackThread.mockResolvedValue({ id: 'thread1' });
    mockFindIssueByKey.mockResolvedValue({ id: 'issue1' });
    mockUpsertIssueThreadLink.mockResolvedValue({});
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '222.0', text: 'KAN-2 marketing is ready', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(mockUpsertSlackThread).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'ws1',
      slackTeamId: 'T1',
      channelId: 'C1',
      threadTs: '__channel__',
      isChannelLevel: true,
    });
    expect(mockUpsertIssueThreadLink).toHaveBeenCalledWith(expect.anything(), {
      issueId: 'issue1',
      threadId: 'thread1',
    });
    expect(queue.send).toHaveBeenCalledOnce();
    const [queueName, msg] = queue.send.mock.calls[0] as [string, any];
    expect(queueName).toBe('slack-events');
    expect(msg.payload.threadTs).toBe('__channel__');
    expect(msg.payload.messageTs).toBe('222.0');
    expect(msg.idempotencyKey).toBe('slack:T1:C1:222.0');
  });

  it('deduplicates ticket keys and links each found issue once', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    mockUpsertSlackThread.mockResolvedValue({ id: 'thread1' });
    mockFindIssueByKey
      .mockResolvedValueOnce({ id: 'issue-kan1' })  // KAN-1
      .mockResolvedValueOnce({ id: 'issue-kan2' });  // KAN-2
    mockUpsertIssueThreadLink.mockResolvedValue({});
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '333.0', text: 'KAN-1 and KAN-2 and KAN-1 again', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    // KAN-1 deduplicated: findIssueByKey called twice (KAN-1 once, KAN-2 once)
    expect(mockFindIssueByKey).toHaveBeenCalledTimes(2);
    expect(mockUpsertIssueThreadLink).toHaveBeenCalledTimes(2);
    expect(queue.send).toHaveBeenCalledOnce();
  });

  it('ignores message_changed subtype', async () => {
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', subtype: 'message_changed', channel: 'C1', ts: '111.0', text: 'KAN-1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(mockGetMemoryConfig).not.toHaveBeenCalled();
    expect(queue.send).not.toHaveBeenCalled();
  });
});

// ── Thread reply (existing behaviour, regression) ────────────────────────────

describe('thread reply — existing behaviour', () => {
  it('queues SLACK_EVENTS for reply in a linked thread', async () => {
    mockFindSlackThreadByTs.mockResolvedValue({ id: 'thread2' });
    mockFindLinksByThreadId.mockResolvedValue([{ id: 'link1', unlinkedAt: null }]);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '444.0', thread_ts: '100.0', text: 'a reply', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).toHaveBeenCalledOnce();
    const [, msg] = queue.send.mock.calls[0] as [string, any];
    expect(msg.payload.threadTs).toBe('100.0');
    expect(msg.payload.messageTs).toBe('444.0');
  });

  it('does not queue if thread not found in DB', async () => {
    mockFindSlackThreadByTs.mockResolvedValue(null);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '555.0', thread_ts: '100.0', text: 'a reply', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does not queue if thread has no active links', async () => {
    mockFindSlackThreadByTs.mockResolvedValue({ id: 'thread2' });
    mockFindLinksByThreadId.mockResolvedValue([{ id: 'link1', unlinkedAt: new Date() }]);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '666.0', thread_ts: '100.0', text: 'a reply', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });
});
