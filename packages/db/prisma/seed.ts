import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create demo workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Corp', slug: 'acme' },
  });
  console.log(`Workspace: ${workspace.id} (${workspace.slug})`);

  // 2 & 3. Slack + Jira installs, demo user, issue, thread, link, summary in one transaction
  const result = await prisma.$transaction(async (tx) => {
    // 2. SlackWorkspaceInstall
    const slackInstall = await tx.slackWorkspaceInstall.upsert({
      where: { slackTeamId: 'T_DEMO' },
      update: {},
      create: {
        workspaceId: workspace.id,
        slackTeamId: 'T_DEMO',
        slackTeamName: 'Acme Slack',
        botToken: 'xoxb-demo',
        botUserId: 'U_BOT_DEMO',
        scopes: ['channels:history', 'chat:write', 'users:read'],
      },
    });
    console.log(`SlackInstall: ${slackInstall.id}`);

    // 3. JiraWorkspaceInstall
    const jiraInstall = await tx.jiraWorkspaceInstall.upsert({
      where: { jiraClientKey: 'jira-client-demo' },
      update: {},
      create: {
        workspaceId: workspace.id,
        jiraClientKey: 'jira-client-demo',
        jiraSiteUrl: 'https://acme.atlassian.net',
        sharedSecret: 'demo-shared-secret',
      },
    });
    console.log(`JiraInstall: ${jiraInstall.id}`);

    // 4. Demo User
    const user = await tx.user.create({
      data: {
        workspaceId: workspace.id,
        displayName: 'Demo User',
        email: 'demo@acme.example.com',
      },
    });
    console.log(`User: ${user.id}`);

    // 5. Demo Issue
    const issue = await tx.issue.upsert({
      where: {
        jiraIssueId_jiraSiteUrl: {
          jiraIssueId: 'jira-issue-demo-1',
          jiraSiteUrl: 'https://acme.atlassian.net',
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        jiraIssueId: 'jira-issue-demo-1',
        jiraIssueKey: 'PROJ-1',
        jiraSiteUrl: 'https://acme.atlassian.net',
        title: 'Demo Issue for Testing',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        issueType: 'Story',
        priority: 'Medium',
      },
    });
    console.log(`Issue: ${issue.id} (${issue.jiraIssueKey})`);

    // 6. Demo SlackThread
    const thread = await tx.slackThread.upsert({
      where: {
        slackTeamId_channelId_threadTs: {
          slackTeamId: 'T_DEMO',
          channelId: 'C_DEMO',
          threadTs: '1234567890.000001',
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        slackTeamId: 'T_DEMO',
        channelId: 'C_DEMO',
        threadTs: '1234567890.000001',
        channelName: 'proj-general',
        permalink: 'https://acme.slack.com/archives/C_DEMO/p1234567890000001',
      },
    });
    console.log(`SlackThread: ${thread.id}`);

    // 7. IssueThreadLink
    const link = await tx.issueThreadLink.upsert({
      where: { issueId_threadId: { issueId: issue.id, threadId: thread.id } },
      update: {},
      create: {
        issueId: issue.id,
        threadId: thread.id,
        linkedByUserId: user.id,
      },
    });
    console.log(`IssueThreadLink: ${link.id}`);

    // 8. SummaryRun + Summary
    const summaryRun = await tx.summaryRun.create({
      data: {
        workspaceId: workspace.id,
        triggeredBy: 'seed',
        issueCount: 1,
        completedCount: 1,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    const summary = await tx.summary.create({
      data: {
        issueId: issue.id,
        version: 1,
        status: 'current',
        content: {
          headline: 'Demo issue is currently in progress.',
          keyPoints: [
            'Issue was created for testing purposes.',
            'No blockers identified.',
            'Work is ongoing.',
          ],
          sentiment: 'neutral',
          lastUpdated: new Date().toISOString(),
        },
        triggerReason: 'seed',
        inputHash: 'seed-hash-00000000',
        summaryRunId: summaryRun.id,
      },
    });
    console.log(`Summary: ${summary.id} (v${summary.version})`);

    return { slackInstall, jiraInstall, user, issue, thread, link, summaryRun, summary };
  });

  console.log('Seed complete.', { workspaceId: workspace.id, issueId: result.issue.id });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
