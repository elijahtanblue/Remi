import Link from 'next/link';
import RatIntoRemiSequence from '@/components/RatIntoRemiSequence';

const proofHighlights = [
  {
    label: 'Ticket reality',
    title: 'The issue status looks fine.',
    body: 'The real blocker is buried in a side thread where ownership quietly shifted and nobody updated Jira.',
  },
  {
    label: 'Remi reconstruction',
    title: 'One operational view.',
    body: 'Remi pulls the missing context back together and surfaces the real owner, blocker, and next step.',
  },
  {
    label: 'Outcome',
    title: 'Less digging, faster action.',
    body: 'Teams move without restarting the investigation every time work crosses tools.',
  },
];

const flowSteps = [
  {
    step: '01',
    title: 'Link the thread',
    body: 'Connect the Slack thread to the Jira issue so Remi can backfill the chain of context.',
  },
  {
    step: '02',
    title: 'Track what changed',
    body: 'Remi watches the thread, the issue, and supporting signals as work moves between people and systems.',
  },
  {
    step: '03',
    title: 'Recover the next move',
    body: 'The product reconstructs the blocker, current owner, and best next step instead of another pile of activity.',
  },
];

const trustPillars = [
  'Designed for explicit boundaries and operator oversight.',
  'Focused on the missing context, not generic AI theater.',
  'Built for Slack, Jira, and email handoffs where teams actually lose the plot.',
];

export default function HomePage() {
  return (
    <main className="bg-remi-cream text-remi-ink">
      <RatIntoRemiSequence />

      <section
        id="proof"
        className="relative overflow-hidden bg-remi-cream px-6 py-20 sm:px-10 lg:px-16 lg:py-28"
      >
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-remi-dark to-transparent opacity-[0.08]" />
        <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-remi-blue/58">Proof</p>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[0.94] tracking-hero text-remi-blue sm:text-6xl lg:text-[4.9rem]">
              The real problem is not missing data. It is missing continuity.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-remi-slate">
              Remi is built for the moment when a ticket, thread, or inbox tells only part of the story. It reconnects the reasoning that got lost between systems.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="rounded-full bg-remi-blue px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-remi-dark"
              >
                Request a demo
              </Link>
              <Link
                href="/#how-it-works"
                className="rounded-full border border-remi-blue/12 px-5 py-3 text-sm font-semibold text-remi-blue transition hover:-translate-y-0.5 hover:bg-remi-blue/5"
              >
                See how it works
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-remi-blue/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-remi-blue/10 bg-white shadow-panel">
              <div className="flex items-center justify-between border-b border-remi-blue/10 bg-remi-dark px-6 py-4 text-white">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">Remi operational view</p>
                  <p className="mt-2 text-xl font-semibold">Blocked rollout handoff</p>
                </div>
                <div className="rounded-full border border-white/14 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/58">
                  Slack + Jira + Email
                </div>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {proofHighlights.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-[1.4rem] border border-remi-blue/8 bg-remi-cream p-5"
                  >
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-remi-blue/52">
                      {item.label}
                    </p>
                    <h3 className="mt-4 text-xl font-semibold leading-7 text-remi-ink">{item.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-remi-slate">{item.body}</p>
                  </article>
                ))}
              </div>
              <div className="grid gap-4 border-t border-remi-blue/10 bg-remi-cream/65 p-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[1.4rem] border border-remi-blue/8 bg-white p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-remi-blue/52">Recovered signal</p>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-remi-blue/8 bg-remi-cream px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-remi-blue/46">Owner</p>
                      <p className="mt-2 text-base font-semibold text-remi-ink">Platform Engineering, not Support</p>
                    </div>
                    <div className="rounded-2xl border border-remi-blue/8 bg-remi-cream px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-remi-blue/46">Blocker</p>
                      <p className="mt-2 text-base font-semibold text-remi-ink">Approval stalled in a private Slack thread after the Jira status stayed unchanged.</p>
                    </div>
                    <div className="rounded-2xl border border-remi-blue/8 bg-remi-cream px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-remi-blue/46">Next step</p>
                      <p className="mt-2 text-base font-semibold text-remi-ink">Reassign rollout ownership and prompt the approver with the hidden context attached.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-remi-blue/8 bg-white p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-remi-blue/52">What buyers care about</p>
                  <ul className="mt-5 space-y-4 text-sm leading-7 text-remi-slate">
                    <li>Fewer blind handoffs between Slack conversations and Jira tickets.</li>
                    <li>Less time spent reconstructing status from side channels.</li>
                    <li>One clear operational view before teams escalate the wrong thing.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="bg-[linear-gradient(180deg,#F4F1EF_0%,#FAF7F6_100%)] px-6 py-20 sm:px-10 lg:px-16 lg:py-28"
      >
        <div className="mx-auto max-w-[1280px]">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-remi-blue/58">How it works</p>
            <h2 className="mt-5 font-display text-5xl leading-[0.95] tracking-hero text-remi-blue sm:text-6xl lg:text-[4.7rem]">
              Sell the pain first. Then prove the reconstructed context.
            </h2>
            <p className="mt-6 text-lg leading-8 text-remi-slate">
              Remi follows the actual workflow teams already use. It links the work, watches the changes, and returns a clear operational answer instead of another pile of activity.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {flowSteps.map((item) => (
              <article
                key={item.step}
                className="group relative overflow-hidden rounded-[2rem] border border-remi-blue/10 bg-white p-7 shadow-panel transition duration-300 hover:-translate-y-1"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-remi-blue via-remi-dark to-remi-blue/20" />
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-remi-blue/52">{item.step}</p>
                <h3 className="mt-5 text-2xl font-semibold leading-8 text-remi-ink">{item.title}</h3>
                <p className="mt-4 text-base leading-8 text-remi-slate">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="trust"
        className="bg-remi-dark px-6 py-20 text-white sm:px-10 lg:px-16 lg:py-28"
      >
        <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/46">Trust and control</p>
            <h2 className="mt-5 max-w-xl font-display text-5xl leading-[0.94] tracking-hero text-white sm:text-6xl lg:text-[4.8rem]">
              Built for operational clarity with boundaries.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/68">
              The product message stays grounded: recover the missing context, then make the next move obvious. Nothing here depends on vague automation claims.
            </p>
          </div>

          <div className="grid gap-4">
            {trustPillars.map((pillar) => (
              <div
                key={pillar}
                className="rounded-[1.8rem] border border-white/10 bg-white/6 p-6 shadow-glow backdrop-blur-md"
              >
                <p className="text-sm uppercase tracking-[0.26em] text-white/42">Remi principle</p>
                <p className="mt-4 text-xl leading-8 text-white/80">{pillar}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="final-cta"
        className="bg-remi-cream px-6 py-20 sm:px-10 lg:px-16 lg:py-28"
      >
        <div className="mx-auto max-w-[1120px] overflow-hidden rounded-[2.5rem] bg-remi-blue px-6 py-12 text-white shadow-panel sm:px-10 lg:px-14 lg:py-14">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/52">Operational memory</p>
              <h2 className="mt-5 max-w-2xl font-display text-5xl leading-[0.95] tracking-hero text-white sm:text-6xl lg:text-[4.6rem]">
                Remi keeps the story intact when work crosses tools.
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/74">
                If context loss is slowing down one workflow, start with a narrow pilot and prove the difference in one team before you scale it further.
              </p>
            </div>

            <div className="flex flex-col gap-4 lg:items-end">
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-remi-blue transition hover:-translate-y-0.5 sm:w-auto"
              >
                Request a demo
              </Link>
              <Link
                href="/#proof"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/18 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10 sm:w-auto"
              >
                Review the proof
              </Link>
              <p className="text-sm text-white/62">Prefer email? elijah.tan@memoremi.com</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
