import { PrismaClient } from '@prisma/client';

export async function createDepartment(
  prisma: PrismaClient,
  workspaceId: string,
  name: string,
  jiraProjectPrefixes: string[],
  slackChannelPatterns: string[],
) {
  return prisma.department.create({
    data: { workspaceId, name, jiraProjectPrefixes, slackChannelPatterns },
  });
}

export async function findDepartmentsByWorkspace(prisma: PrismaClient, workspaceId: string) {
  return prisma.department.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
  });
}

export async function findDepartmentByJiraProjectPrefix(
  prisma: PrismaClient,
  workspaceId: string,
  prefix: string,
) {
  return prisma.department.findFirst({
    where: { workspaceId, jiraProjectPrefixes: { has: prefix } },
  });
}

/**
 * Returns the first department whose slackChannelPatterns contains a pattern
 * matching the given channelName. Patterns ending with '*' are prefix-matched;
 * all others are exact-matched.
 *
 * Matching is done in application code because Postgres array-contains checks
 * equality only — glob semantics require JS evaluation over the fetched rows.
 * For typical workspaces (<20 departments) this is negligible overhead.
 */
export async function findDepartmentBySlackChannel(
  prisma: PrismaClient,
  workspaceId: string,
  channelName: string,
) {
  const departments = await prisma.department.findMany({
    where: { workspaceId },
  });

  for (const dept of departments) {
    for (const pattern of dept.slackChannelPatterns) {
      if (matchesPattern(channelName, pattern)) return dept;
    }
  }

  return null;
}

export async function updateDepartment(
  prisma: PrismaClient,
  id: string,
  data: {
    name?: string;
    jiraProjectPrefixes?: string[];
    slackChannelPatterns?: string[];
  },
) {
  return prisma.department.update({ where: { id }, data });
}

export async function deleteDepartment(prisma: PrismaClient, id: string) {
  return prisma.department.delete({ where: { id } });
}

function matchesPattern(channelName: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return channelName.startsWith(pattern.slice(0, -1));
  }
  return channelName === pattern;
}
