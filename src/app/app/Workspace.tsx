"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_RULES, SEED, STAGES, pickLeads, proposeSlots, reason, scoreLead, wantsMeeting,
  type Lead, type Rules, type Status,
} from "@/lib/relay";

type View = "dashboard" | "leads" | "approvals" | "agents" | "ask";
type Draft = { leadId: string; text: string; source: string; kind: "follow-up" | "meeting" };
type Log = { t: string; msg: string; agent: string; kind?: "ok" | "warn" | "ai" };
type Chat = { who: "you" | "relay"; text: string };
type AgentId = "followup" | "scoring" | "booker";
type Saved = { leads: Lead[]; rules: Rules; drafts: Draft[]; log: Log[]; enabled: Record<AgentId, boolean> };

const STORE = "relay-workspace-v2";
const PILL: Record<Status, string> = {
  New: "bg-sky/15 text-sky",
  Waiting: "bg-white/8 text-dim",
  "Needs follow-up": "bg-warn/15 text-warn",
  "Draft ready": "bg-brand/20 text-brand",
  Sent: "bg-ok/15 text-ok",
  Booked: "bg-ok/25 text-ok",
  Won: "bg-ok/35 text-ok",
};
const AGENTS: { id: AgentId; name: string; does: string; icon: string }[] = [
  { id: "followup", name: "Follow-up agent", does: "Finds leads that went quiet and drafts the right next message in your tone.", icon: "↻" },
  { id: "scoring", name: "Lead-scoring agent", does: "Scores every lead 0–100 from deal size, buying signals and recency.", icon: "◎" },
  { id: "booker", name: "Meeting-booker agent", does: "Spots leads asking for a call and drafts a reply with two time slots.", icon: "▦" },
];
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Workspace() {
  const [view, setView] = useState<View>("dashboard");
  const [leads, setLeads] = useState<Lead[]>(SEED);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [log, setLog] = useState<Log[]>([]);
  const [enabled, setEnabled] = useState<Record<AgentId, boolean>>({ followup: true, scoring: true, booker: true });
  const [busy, setBusy] = useState<AgentId | "all" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [chat, setChat] = useState<Chat[]>([{ who: "relay", text: "Hi! Ask me anything about your pipeline — who to focus on, who went quiet, what it's worth." }]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", need: "", value: "1000", days: "0" });

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const s: Saved | null = JSON.parse(localStorage.getItem(STORE) || "null");
        if (s) {
          setLeads(s.leads);
          setRules(s.rules);
          setDrafts(s.drafts);
          setLog(s.log);
          setEnabled(s.enabled);
        }
      } catch {}
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ leads, rules, drafts, log, enabled } satisfies Saved));
    } catch {}
  }, [leads, rules, drafts, log, enabled, loaded]);

  const add = (agent: string, msg: string, kind?: Log["kind"]) => setLog((l) => [{ t: now(), agent, msg, kind }, ...l].slice(0, 60));
  const patch = (id: string, p: Partial<Lead>) => setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  async function runFollowup() {
    const picks = pickLeads(leads, rules);
    add("Follow-up", `checking ${leads.length} leads (rule: quiet ${rules.followUpAfterDays}+ days, max ${rules.maxPerRun})`);
    if (!picks.length) return add("Follow-up", "nothing to do — everyone is fresh ✓", "ok");
    for (const l of picks) {
      add("Follow-up", `${l.name} — ${reason(l, rules)}`, "warn");
      patch(l.id, { status: "Needs follow-up" });
      try {
        const res = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead: l, rules }) });
        const d = await res.json();
        if (!res.ok || !d.text) throw new Error("no draft");
        setDrafts((ds) => [{ leadId: l.id, text: d.text, source: d.source, kind: "follow-up" as const }, ...ds.filter((x) => x.leadId !== l.id)]);
        patch(l.id, { status: "Draft ready" });
        add("Follow-up", `drafted for ${l.name.split(" ")[0]} · ${d.source === "ai" ? "AI model" : "template"}`, "ai");
      } catch {
        patch(l.id, { status: l.status });
        add("Follow-up", `couldn't draft for ${l.name} — left for a human`, "warn");
      }
    }
    add("Follow-up", `${picks.length} draft(s) waiting in Approvals`, "ok");
  }

  function runScoring() {
    const ranked = [...leads].sort((a, b) => scoreLead(b) - scoreLead(a));
    add("Scoring", `scored ${leads.length} leads · top: ${ranked[0]?.name} (${scoreLead(ranked[0])})`, "ok");
  }

  function runBooker() {
    const m = leads.filter(wantsMeeting);
    if (!m.length) return add("Booker", "no meeting requests found ✓", "ok");
    for (const l of m) {
      const [a, b] = proposeSlots(l);
      const text = `Hi ${l.name.split(" ")[0]},\n\nGreat to hear you'd like to talk about ${l.topic}. Would either of these work?\n\n• ${a}\n• ${b}\n\nIf neither suits, just send a time that does.\n\nThanks,\nAlex`;
      setDrafts((ds) => [{ leadId: l.id, text, source: "agent", kind: "meeting" as const }, ...ds.filter((x) => x.leadId !== l.id)]);
      patch(l.id, { status: "Draft ready" });
      add("Booker", `${l.name} asked for a call → proposed ${a} / ${b}`, "ai");
    }
  }

  async function run(id: AgentId | "all") {
    setBusy(id);
    if ((id === "all" || id === "scoring") && enabled.scoring) runScoring();
    if ((id === "all" || id === "booker") && enabled.booker) runBooker();
    if ((id === "all" || id === "followup") && enabled.followup) await runFollowup();
    setBusy(null);
  }

  function approve(d: Draft) {
    const l = leads.find((x) => x.id === d.leadId);
    setDrafts((ds) => ds.filter((x) => x.leadId !== d.leadId));
    patch(d.leadId, { status: d.kind === "meeting" ? "Booked" : "Sent", daysSinceContact: 0 });
    add("You", `approved ${d.kind} to ${l?.name ?? "lead"} (simulated send)`, "ok");
  }

  function skip(d: Draft) {
    setDrafts((ds) => ds.filter((x) => x.leadId !== d.leadId));
    patch(d.leadId, { status: "Waiting" });
    add("You", `skipped draft for ${leads.find((x) => x.id === d.leadId)?.name ?? "lead"}`);
  }

  async function ask(e?: React.FormEvent, preset?: string) {
    e?.preventDefault();
    const question = (preset ?? q).trim();
    if (!question || asking) return;
    setChat((c) => [...c, { who: "you", text: question }]);
    setQ("");
    setAsking(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: question, leads }) });
      const d = await res.json();
      setChat((c) => [...c, { who: "relay", text: d.text || "Sorry, I couldn't answer that." }]);
    } catch {
      setChat((c) => [...c, { who: "relay", text: "I'm offline right now — try again in a moment." }]);
    }
    setAsking(false);
  }

  function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.need.trim()) return;
    const days = Math.max(0, Math.min(90, Number(form.days) || 0));
    const l: Lead = {
      id: `l${Date.now()}`,
      name: form.name.trim().slice(0, 60),
      company: form.company.trim().slice(0, 60) || "—",
      email: "",
      value: Math.max(0, Math.min(1_000_000, Number(form.value) || 0)),
      daysSinceContact: days,
      lastNote: form.need.trim().slice(0, 400),
      topic: form.need.trim().slice(0, 120),
      status: days > 0 ? "Waiting" : "New",
    };
    setLeads((ls) => [l, ...ls]);
    setForm({ name: "", company: "", need: "", value: "1000", days: "0" });
    add("You", `added lead ${l.name}`);
  }

  function reset() {
    setLeads(SEED);
    setRules(DEFAULT_RULES);
    setDrafts([]);
    setLog([]);
    setEnabled({ followup: true, scoring: true, booker: true });
  }

  const open = leads.filter((l) => l.status !== "Won");
  const pipeline = open.reduce((s, l) => s + l.value, 0);
  const quiet = leads.filter((l) => l.status === "Waiting" && l.daysSinceContact >= rules.followUpAfterDays).length;
  const avgScore = Math.round(leads.reduce((s, l) => s + scoreLead(l), 0) / Math.max(1, leads.length));
  const touched = leads.filter((l) => ["Sent", "Booked", "Won"].includes(l.status)).length;
  const field = "w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-text placeholder:text-dim focus:border-brand focus:outline-none";
  const card = "rounded-2xl border border-line bg-panel";

  const NAV: { id: View; label: string; icon: string; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: "▤" },
    { id: "leads", label: "Leads", icon: "☰", badge: leads.length },
    { id: "approvals", label: "Approvals", icon: "✓", badge: drafts.length },
    { id: "agents", label: "Agents", icon: "✦" },
    { id: "ask", label: "Ask Relay", icon: "?" },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* sidebar */}
      <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-ink" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 12h9M13 6l6 6-6 6" /></svg>
            </span>
            Relay
          </Link>
          <span className="rounded-full border border-line px-2 py-0.5 text-[0.7rem] text-dim lg:hidden">demo</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3" aria-label="Workspace">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${view === n.id ? "bg-brand/15 text-text" : "text-dim hover:bg-white/5 hover:text-text"}`}
            >
              <span className="w-4 text-center font-mono text-brand" aria-hidden>{n.icon}</span>
              {n.label}
              {!!n.badge && <span className="ml-auto rounded-full bg-white/10 px-2 text-xs">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="hidden px-5 pt-6 text-xs text-dim lg:block">
          <p className="rounded-lg border border-line p-3 leading-relaxed">
            Demo workspace — your changes stay in this browser.{" "}
            <button type="button" onClick={reset} className="text-brand hover:underline">Reset</button>
          </p>
          <a href="https://www.yashtechstudio.com" target="_blank" rel="noopener noreferrer" className="mt-4 block hover:text-text">
            Built by <span className="font-semibold text-text">Yashh Techstudio</span> ↗
          </a>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-dim">Acme Sales · demo workspace</p>
            <h1 className="text-2xl font-semibold tracking-tight">{NAV.find((n) => n.id === view)?.label}</h1>
          </div>
          <button
            type="button"
            onClick={() => run("all")}
            disabled={!!busy}
            className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Agents working…" : "Run all agents ▸"}
          </button>
        </div>

        {view === "dashboard" && (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Open pipeline", money(pipeline), `${open.length} open deals`],
                ["Need follow-up", String(quiet), `quiet ${rules.followUpAfterDays}+ days`],
                ["Avg lead score", String(avgScore), "lead-scoring agent"],
                ["Awaiting approval", String(drafts.length), drafts.length ? "review in Approvals" : "all clear"],
              ].map(([k, v, sub]) => (
                <div key={k} className={`${card} p-4 sm:p-5`}>
                  <p className="text-xs text-dim">{k}</p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{v}</p>
                  <p className="mt-1 text-xs text-dim">{sub}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <PipelineChart leads={leads} />
              <section className={`${card} p-5`}>
                <h2 className="font-semibold">Agents</h2>
                <ul className="mt-3 grid gap-2">
                  {AGENTS.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-ink px-3 py-2.5">
                      <span className="grid size-8 place-items-center rounded-lg bg-brand/15 font-mono text-brand" aria-hidden>{a.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        <span className="text-xs text-dim">{enabled[a.id] ? (busy === a.id || busy === "all" ? "working…" : "ready") : "paused"}</span>
                      </span>
                      <button type="button" disabled={!!busy || !enabled[a.id]} onClick={() => run(a.id)} className="rounded-lg bg-white/8 px-3 py-1.5 text-xs hover:bg-white/12 disabled:opacity-40">
                        Run
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-dim">{touched} lead(s) contacted this session · nothing is sent without approval</p>
              </section>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className={`${card} p-5`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Hottest leads</h2>
                  <button type="button" onClick={() => setView("leads")} className="text-xs text-brand hover:underline">All leads →</button>
                </div>
                <ul className="mt-3 divide-y divide-line">
                  {[...leads].sort((a, b) => scoreLead(b) - scoreLead(a)).slice(0, 4).map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <Score n={scoreLead(l)} />
                      <span className="min-w-0 flex-1 truncate">{l.name} <span className="text-dim">· {l.company}</span></span>
                      <span className="text-dim">{money(l.value)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <ActivityLog log={log} card={card} />
            </div>
          </div>
        )}

        {view === "leads" && (
          <section className={card}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs text-dim">
                  <tr>
                    <th className="px-5 py-3 font-medium">Lead</th>
                    <th className="px-3 py-3 font-medium">Score</th>
                    <th className="px-3 py-3 font-medium">Value</th>
                    <th className="px-3 py-3 font-medium">Last contact</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="max-w-80 px-5 py-3">
                        <p className="font-medium">{l.name} <span className="text-dim">· {l.company}</span></p>
                        <p className="truncate text-xs text-dim">{l.lastNote}</p>
                      </td>
                      <td className="px-3 py-3"><Score n={scoreLead(l)} /></td>
                      <td className="px-3 py-3 text-dim">{money(l.value)}</td>
                      <td className="px-3 py-3 text-dim">{l.daysSinceContact === 0 ? "today" : `${l.daysSinceContact}d ago`}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${PILL[l.status]}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={addLead} className="grid gap-2 border-t border-line p-5 sm:grid-cols-[1fr_1fr_7rem_6rem]">
              <p className="text-sm font-medium sm:col-span-4">Add a lead — then run the agents on it</p>
              <label className="sr-only" htmlFor="ln">Name</label>
              <input id="ln" className={field} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label className="sr-only" htmlFor="lc">Company</label>
              <input id="lc" className={field} placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              <label className="sr-only" htmlFor="lv">Deal value</label>
              <input id="lv" className={field} type="number" min={0} title="Deal value ($)" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              <label className="sr-only" htmlFor="ld">Days since contact</label>
              <input id="ld" className={field} type="number" min={0} max={90} title="Days since last contact" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
              <label className="sr-only" htmlFor="lneed">What they need</label>
              <input id="lneed" className={`${field} sm:col-span-3`} placeholder="What do they need? * (e.g. wants a demo of AI booking)" value={form.need} onChange={(e) => setForm({ ...form, need: e.target.value })} />
              <button className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15">Add</button>
            </form>
          </section>
        )}

        {view === "approvals" && (
          <section className="grid gap-4">
            {drafts.length === 0 && (
              <div className={`${card} p-10 text-center text-dim`}>
                Nothing to approve. <button type="button" onClick={() => run("all")} className="text-brand hover:underline">Run the agents</button> to get drafts.
              </div>
            )}
            {drafts.map((d) => {
              const l = leads.find((x) => x.id === d.leadId);
              return (
                <article key={d.leadId} className={`${card} p-5`}>
                  <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>To <strong>{l?.name ?? "lead"}</strong> <span className="text-dim">· {l?.company}</span></span>
                    <span className="rounded bg-white/8 px-2 py-0.5 text-xs text-dim">{d.kind} · {d.source === "ai" ? "AI" : d.source === "agent" ? "agent" : "template"}</span>
                  </p>
                  <label className="sr-only" htmlFor={`d-${d.leadId}`}>Draft to {l?.name}</label>
                  <textarea
                    id={`d-${d.leadId}`}
                    className="mt-3 h-40 w-full resize-y rounded-lg border border-line bg-ink p-3 text-sm leading-relaxed focus:border-brand focus:outline-none"
                    value={d.text}
                    onChange={(e) => setDrafts((ds) => ds.map((x) => (x.leadId === d.leadId ? { ...x, text: e.target.value } : x)))}
                  />
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => approve(d)} className="rounded-lg bg-ok/90 px-5 py-2 text-sm font-semibold text-ink hover:bg-ok">Approve &amp; send</button>
                    <button type="button" onClick={() => skip(d)} className="rounded-lg bg-white/8 px-4 py-2 text-sm hover:bg-white/12">Skip</button>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {view === "agents" && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="grid gap-4">
              {AGENTS.map((a) => (
                <article key={a.id} className={`${card} p-5`}>
                  <div className="flex items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/15 font-mono text-lg text-brand" aria-hidden>{a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold">{a.name}</h2>
                      <p className="mt-1 text-sm text-dim">{a.does}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-dim">
                      {enabled[a.id] ? "On" : "Paused"}
                      <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={enabled[a.id]} onChange={(e) => setEnabled({ ...enabled, [a.id]: e.target.checked })} />
                    </label>
                  </div>
                  {a.id === "followup" && (
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <label className="grid gap-1 text-dim">Quiet for
                        <select className={field} value={rules.followUpAfterDays} onChange={(e) => setRules({ ...rules, followUpAfterDays: Number(e.target.value) })}>
                          {[2, 4, 7, 14].map((d) => <option key={d} value={d}>{d}+ days</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-dim">Tone
                        <select className={field} value={rules.tone} onChange={(e) => setRules({ ...rules, tone: e.target.value as Rules["tone"] })}>
                          <option value="friendly">Friendly</option><option value="formal">Formal</option><option value="short">Short</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-dim">Max / run
                        <select className={field} value={rules.maxPerRun} onChange={(e) => setRules({ ...rules, maxPerRun: Number(e.target.value) })}>
                          {[1, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                  <button type="button" disabled={!!busy || !enabled[a.id]} onClick={() => run(a.id)} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50">
                    {busy === a.id ? "Working…" : "Run now"}
                  </button>
                </article>
              ))}
              <p className="text-xs text-dim">Guardrails: agents only draft; every message waits for a human in Approvals. Drafts use an AI model when one is configured, otherwise safe templates.</p>
            </section>
            <ActivityLog log={log} card={card} />
          </div>
        )}

        {view === "ask" && (
          <section className={`${card} flex h-[70vh] flex-col`}>
            <ol className="flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
              {chat.map((m, i) => (
                <li key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.who === "you" ? "ml-auto bg-brand text-ink" : "bg-ink"}`}>{m.text}</li>
              ))}
              {asking && <li className="w-fit animate-pulse rounded-2xl bg-ink px-4 py-2.5 text-sm text-dim">thinking…</li>}
            </ol>
            <div className="flex flex-wrap gap-2 border-t border-line px-5 pt-3">
              {["Who should I focus on?", "Who went quiet?", "What's my pipeline worth?", "Who wants a demo?"].map((s) => (
                <button key={s} type="button" onClick={() => ask(undefined, s)} className="rounded-full border border-line px-3 py-1 text-xs text-dim hover:border-brand hover:text-text">{s}</button>
              ))}
            </div>
            <form onSubmit={ask} className="flex gap-2 p-5">
              <label className="sr-only" htmlFor="ask">Ask Relay</label>
              <input id="ask" className={field} placeholder="Ask about your pipeline…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="rounded-lg bg-brand px-5 text-sm font-semibold text-ink disabled:opacity-60" disabled={asking}>Ask</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

function Score({ n }: { n: number }) {
  const tone = n >= 70 ? "text-ok" : n >= 45 ? "text-warn" : "text-dim";
  return <span className={`inline-block w-9 rounded-md bg-white/5 py-0.5 text-center font-mono text-xs font-semibold ${tone}`}>{n}</span>;
}

function ActivityLog({ log, card }: { log: Log[]; card: string }) {
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-semibold">Agent activity</h2>
      <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto font-mono text-xs leading-relaxed" aria-live="polite">
        {log.length === 0 && <li className="text-dim">Press &ldquo;Run all agents&rdquo; to watch them work.</li>}
        {log.map((e, i) => (
          <li key={i} className={e.kind === "ok" ? "text-ok" : e.kind === "warn" ? "text-warn" : e.kind === "ai" ? "text-brand" : "text-dim"}>
            <span className="text-dim">{e.t} {e.agent} ›</span> {e.msg}
          </li>
        ))}
      </ol>
    </section>
  );
}

// Single-series bar chart: pipeline value by stage. One hue (brand), hover tooltip, table fallback for screen readers.
function PipelineChart({ leads }: { leads: Lead[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = STAGES.map((s) => {
    const ls = leads.filter((l) => s.match.includes(l.status));
    return { name: s.name, value: ls.reduce((t, l) => t + l.value, 0), count: ls.length };
  });
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 520, H = 220, pad = { l: 8, r: 8, t: 16, b: 28 };
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);

  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="font-semibold">Pipeline value by stage</h2>
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart of pipeline value by stage">
          {[0.5, 1].map((f) => (
            <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line)" strokeDasharray="2 4" />
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--color-line)" />
          {data.map((d, i) => {
            const x = pad.l + i * bw + bw * 0.22;
            const w = bw * 0.56;
            const top = y(d.value);
            const h = H - pad.b - top;
            return (
              <g key={d.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${H - pad.b} V${top + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - pad.b} Z`}
                    fill="var(--color-brand)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
                <text x={x + w / 2} y={H - 8} textAnchor="middle" className="fill-[var(--color-dim)] text-[11px]">{d.name}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-ink px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, top: 0 }}
          >
            <p className="font-medium">{data[hover].name}</p>
            <p className="text-dim">${data[hover].value.toLocaleString("en-US")} · {data[hover].count} lead(s)</p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Pipeline value by stage</caption>
        <tbody>{data.map((d) => <tr key={d.name}><th>{d.name}</th><td>${d.value}</td><td>{d.count} leads</td></tr>)}</tbody>
      </table>
    </section>
  );
}
