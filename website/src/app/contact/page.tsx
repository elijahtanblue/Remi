const formAction = process.env.NEXT_PUBLIC_FORMSPREE_ACTION;

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-remi-cream px-6 pb-20 pt-32 text-remi-ink sm:px-10 lg:px-16">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-remi-blue/58">Request a demo</p>
            <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-hero text-remi-blue sm:text-6xl lg:text-[4.8rem]">
              Start with one workflow where context keeps breaking down.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-remi-slate">
              Remi is strongest when a team already feels the pain of blocked handoffs, hidden blockers, or stale ownership between Slack, Jira, and email.
            </p>

            <div className="mt-10 rounded-[2rem] border border-remi-blue/10 bg-white p-6 shadow-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-remi-blue/54">What to expect</p>
              <ul className="mt-5 space-y-4 text-base leading-8 text-remi-slate">
                <li>A focused walkthrough of one broken workflow.</li>
                <li>A demo grounded in the current product, not speculative features.</li>
                <li>A clear next step if a narrow pilot makes sense.</li>
              </ul>
              <div className="mt-8 rounded-[1.5rem] bg-remi-blue px-5 py-4 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/56">Fallback</p>
                <p className="mt-3 text-lg font-semibold">Prefer email? elijah.tan@memoremi.com</p>
              </div>
            </div>
          </section>

          <section className="rounded-[2.2rem] border border-remi-blue/10 bg-white p-6 shadow-panel sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-remi-blue/54">Qualification form</p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-remi-slate">
              Use this form to point us at the workflow where context gets lost first. If the Formspree endpoint is not configured yet, the email fallback above stays available.
            </p>

            <form action={formAction} method="POST" className="mt-8 grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-remi-ink">
                  Name
                  <input
                    name="name"
                    type="text"
                    required
                    className="rounded-2xl border border-remi-blue/12 bg-remi-cream px-4 py-3 text-remi-ink outline-none transition focus:border-remi-blue focus:bg-white"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-remi-ink">
                  Work email
                  <input
                    name="email"
                    type="email"
                    required
                    className="rounded-2xl border border-remi-blue/12 bg-remi-cream px-4 py-3 text-remi-ink outline-none transition focus:border-remi-blue focus:bg-white"
                  />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-remi-ink">
                  Company
                  <input
                    name="company"
                    type="text"
                    className="rounded-2xl border border-remi-blue/12 bg-remi-cream px-4 py-3 text-remi-ink outline-none transition focus:border-remi-blue focus:bg-white"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-remi-ink">
                  Team size
                  <select
                    name="teamSize"
                    className="rounded-2xl border border-remi-blue/12 bg-remi-cream px-4 py-3 text-remi-ink outline-none transition focus:border-remi-blue focus:bg-white"
                    defaultValue="10-50"
                  >
                    <option value="1-10">1-10</option>
                    <option value="10-50">10-50</option>
                    <option value="50-250">50-250</option>
                    <option value="250+">250+</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-remi-ink">
                What workflow loses context first?
                <select
                  name="workflowPain"
                  className="rounded-2xl border border-remi-blue/12 bg-remi-cream px-4 py-3 text-remi-ink outline-none transition focus:border-remi-blue focus:bg-white"
                  defaultValue="blocked-work"
                >
                  <option value="blocked-work">Blocked work between Slack and Jira</option>
                  <option value="ownership">Ownership changes and broken handoffs</option>
                  <option value="stale-context">Stale Jira context and hidden side-thread detail</option>
                  <option value="email-handoff">Email-driven workflows that never fully make it back into Jira</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-remi-ink">
                Notes
                <textarea
                  name="notes"
                  rows={6}
                  placeholder="Tell us where the blocker, ownership shift, or missing context usually shows up."
                  className="rounded-[1.5rem] border border-remi-blue/12 bg-remi-cream px-4 py-3 text-remi-ink outline-none transition focus:border-remi-blue focus:bg-white"
                />
              </label>

              {!formAction ? (
                <div className="rounded-[1.5rem] border border-remi-blue/10 bg-remi-cream px-5 py-4 text-sm leading-7 text-remi-slate">
                  `NEXT_PUBLIC_FORMSPREE_ACTION` is not configured yet, so this form is presentational for now. The direct fallback remains `elijah.tan@memoremi.com`.
                </div>
              ) : null}

              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-remi-blue px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-remi-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!formAction}
              >
                Request the walkthrough
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
