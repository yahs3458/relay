import Link from "next/link";

const FEATURES = [
  { icon: "↻", title: "Follow-up agent", body: "Finds every lead that went quiet and drafts the right next message in your tone — before deals go cold." },
  { icon: "◎", title: "Lead-scoring agent", body: "Scores each lead 0–100 from deal size, buying signals and recency, so you always know who to call first." },
  { icon: "▦", title: "Meeting-booker agent", body: "Spots “can we talk?” in your notes and drafts a reply with two concrete time slots." },
  { icon: "?", title: "Ask Relay", body: "Ask your pipeline anything in plain English: who to focus on, who went quiet, what it's all worth." },
];

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[32rem] bg-[radial-gradient(50%_60%_at_50%_0%,color-mix(in_oklch,var(--color-brand)_35%,transparent),transparent)]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <p className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-ink" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 12h9M13 6l6 6-6 6" /></svg>
          </span>
          Relay
        </p>
        <Link href="/app" className="rounded-lg border border-line px-4 py-2 text-sm hover:border-brand">Open demo</Link>
      </header>

      <main className="relative mx-auto max-w-6xl px-5">
        <section className="py-16 text-center sm:py-24">
          <p className="mx-auto w-fit rounded-full border border-line bg-panel px-3 py-1 text-xs text-dim">AI agents inside your CRM · concept product</p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            The CRM where <span className="text-brand">AI agents</span> do the follow-ups.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-dim">
            Three agents work your pipeline every day — scoring leads, chasing the quiet ones and booking calls. You just approve.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/app" className="rounded-xl bg-brand px-6 py-3 font-semibold text-ink transition hover:brightness-110">Try the live demo ▸</Link>
            <a href="https://www.yashtechstudio.com/#contact" className="rounded-xl border border-line px-6 py-3 font-semibold hover:border-brand">Build one for my business</a>
          </div>
          <p className="mt-4 text-xs text-dim">No signup. Demo data only — nothing is ever emailed.</p>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-2xl border border-line bg-panel p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-brand/15 font-mono text-brand" aria-hidden>{f.icon}</span>
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-dim">{f.body}</p>
            </article>
          ))}
        </section>

        <section className="mb-20 rounded-2xl border border-line bg-panel p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Guardrails, built in.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-dim">
            Agents only draft. Every message waits in Approvals for a human. Every action is logged. AI models write the
            drafts when configured; safe templates take over when they&rsquo;re not.
          </p>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-dim">
        Relay is a concept product designed and built by{" "}
        <a href="https://www.yashtechstudio.com" className="text-text hover:text-brand">Yash Techstudio</a> — we build AI agents and SaaS like this for real businesses.
      </footer>
    </div>
  );
}
