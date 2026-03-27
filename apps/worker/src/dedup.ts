import {
  prisma,
  findIssueEventByIdempotencyKey,
  findSlackMessageByIdempotencyKey,
} from '@remi/db';

export async function isSlackMessageProcessed(idempotencyKey: string): Promise<boolean> {
  const existing = await findSlackMessageByIdempotencyKey(prisma, idempotencyKey);
  return existing !== null;
}

export async function isIssueEventProcessed(idempotencyKey: string): Promise<boolean> {
  const existing = await findIssueEventByIdempotencyKey(prisma, idempotencyKey);
  return existing !== null;
}
