// Relay's data model and the follow-up agent's decision rules (shared by the UI and the API route).

export type Status = "New" | "Waiting" | "Needs follow-up" | "Draft ready" | "Sent" | "Booked" | "Won";

export type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  value: number;
  daysSinceContact: number;
  lastNote: string; // internal, never quoted to the customer
  topic: string; // what the customer wants, safe to mention
  status: Status;
};

export type Rules = {
  followUpAfterDays: number;
  tone: "friendly" | "formal" | "short";
  maxPerRun: number;
};

export const DEFAULT_RULES: Rules = { followUpAfterDays: 4, tone: "friendly", maxPerRun: 5 };

export const SEED: Lead[] = [
  { id: "l1", name: "Maria Lopez", company: "Sunrise Dental", email: "maria@sunrisedental.example", value: 1800, daysSinceContact: 9, lastNote: "Liked the AI receptionist demo. Asked if it can book Saturday appointments.", topic: "booking Saturday appointments with an AI receptionist", status: "Waiting" },
  { id: "l2", name: "Tom Reed", company: "Ridge Roofing", email: "tom@ridgeroofing.example", value: 1200, daysSinceContact: 0, lastNote: "Filled the website form an hour ago: wants faster replies to quote requests.", topic: "getting faster replies to your quote requests", status: "New" },
  { id: "l3", name: "Priya Shah", company: "Bloom Studio", email: "priya@bloomstudio.example", value: 950, daysSinceContact: 14, lastNote: "Asked about pricing for the WhatsApp booking agent. We never replied.", topic: "pricing for a WhatsApp booking agent", status: "Waiting" },
  { id: "l4", name: "Jake Wilson", company: "Harbor Realty", email: "jake@harborrealty.example", value: 2400, daysSinceContact: 5, lastNote: "Wants a demo of lead follow-up for his 6 agents. Prefers Thursday.", topic: "a lead follow-up demo for your team", status: "Waiting" },
  { id: "l5", name: "Aisha Khan", company: "Northline Logistics", email: "aisha@northline.example", value: 3200, daysSinceContact: 2, lastNote: "Reviewing our proposal with her ops lead this week.", topic: "the proposal you are reviewing", status: "Waiting" },
  { id: "l6", name: "Daniel Park", company: "Park & Co. Law", email: "daniel@parkco.example", value: 1500, daysSinceContact: 21, lastNote: "Said 'maybe next quarter' about an intake agent.", topic: "an intake agent for next quarter", status: "Waiting" },
  { id: "l7", name: "Sara Kim", company: "Kim Accounting", email: "sara@kimaccounting.example", value: 2100, daysSinceContact: 1, lastNote: "Booked a call for Friday to scope a document-intake agent.", topic: "your document-intake agent", status: "Booked" },
  { id: "l8", name: "Leo Grant", company: "Grant Fitness", email: "leo@grantfitness.example", value: 1400, daysSinceContact: 3, lastNote: "Signed for the WhatsApp booking agent.", topic: "your WhatsApp booking agent", status: "Won" },
];

/** The agent's first step: which leads need a follow-up right now, most valuable first. */
export function pickLeads(leads: Lead[], rules: Rules): Lead[] {
  return leads
    .filter((l) => l.status === "New" || (l.status === "Waiting" && l.daysSinceContact >= rules.followUpAfterDays))
    .sort((a, b) => b.value - a.value)
    .slice(0, rules.maxPerRun);
}

/** Why the agent picked this lead, shown in the activity log. */
export function reason(l: Lead, rules: Rules): string {
  if (l.status === "New") return "new lead, reply fast while they're hot";
  return `${l.daysSinceContact} days quiet (rule: ${rules.followUpAfterDays}+)`;
}

/** Offline drafting, used when no AI key is configured. Grounded only in the lead's own note. */
export function templateDraft(l: Lead, rules: Rules): string {
  const first = l.name.split(" ")[0];
  const hi = rules.tone === "formal" ? `Dear ${first},` : `Hi ${first},`;
  const sign = rules.tone === "formal" ? "Kind regards,\nAlex" : "Thanks,\nAlex";
  const body =
    l.status === "New"
      ? `Thanks for reaching out about ${l.topic}. That is exactly what we help with, and I would love to hear more about what you need.`
      : `Just following up on ${l.topic}. Happy to answer any questions or walk you through how it would work for ${l.company}.`;
  const ask =
    rules.tone === "short"
      ? "Worth a 15-minute call this week?"
      : "Would a quick 15-minute call this week help? Happy to work around your schedule.";
  return `${hi}\n\n${body}\n\n${ask}\n\n${sign}`;
}

// ---- Lead-scoring agent: 0-100 from deal size, buying signals in the note and recency. ----
const HOT = /demo|pricing|proposal|book|asap|this week|budget|ready|faster/i;
const COLD = /maybe|next quarter|not now|later|no budget/i;

export function scoreLead(l: Lead): number {
  let s = Math.min(40, l.value / 80);
  if (HOT.test(l.lastNote)) s += 30;
  if (COLD.test(l.lastNote)) s -= 20;
  s += l.daysSinceContact <= 3 ? 20 : l.daysSinceContact <= 10 ? 10 : 0;
  if (l.status === "Booked" || l.status === "Won") s += 10;
  return Math.max(5, Math.min(99, Math.round(s)));
}

// ---- Meeting-booker agent: leads asking for a demo/call get two concrete slots. ----
export const wantsMeeting = (l: Lead) => /demo|call|meet|thursday|saturday/i.test(l.lastNote) && l.status !== "Booked" && l.status !== "Won";

export function proposeSlots(l: Lead): string[] {
  const day = /thursday/i.test(l.lastNote) ? "Thu" : /saturday/i.test(l.lastNote) ? "Sat" : "Tue";
  return [`${day} 10:30 AM`, `${day} 3:00 PM`];
}

// ---- Pipeline stages for the dashboard chart. ----
export const STAGES: { name: string; match: Status[] }[] = [
  { name: "New", match: ["New"] },
  { name: "Waiting", match: ["Waiting", "Needs follow-up"] },
  { name: "Contacted", match: ["Draft ready", "Sent"] },
  { name: "Meeting", match: ["Booked"] },
  { name: "Won", match: ["Won"] },
];

// ---- "Ask Relay" offline answers (used when no AI key is set). ----
export function localAnswer(q: string, leads: Lead[]): string {
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (!leads.length) return "Your pipeline is empty. Add a lead in the Leads tab, then ask me again.";
  const ranked = [...leads].sort((a, b) => scoreLead(b) - scoreLead(a));
  const quiet = leads.filter((l) => l.status === "Waiting" && l.daysSinceContact >= 4);
  if (/hot|best|priorit|focus|top/i.test(q))
    return `Focus on ${ranked.slice(0, 3).map((l) => `${l.name} (${l.company}, score ${scoreLead(l)})`).join(", ")}.`;
  if (/follow|quiet|stale|ignored/i.test(q))
    return quiet.length ? `${quiet.length} leads went quiet: ${quiet.map((l) => `${l.name} (${l.daysSinceContact}d)`).join(", ")}. Run the follow-up agent to draft messages.` : "No one has gone quiet. Nice work.";
  if (/pipeline|value|worth|revenue|total/i.test(q))
    return `Open pipeline is ${money(leads.filter((l) => l.status !== "Won").reduce((s, l) => s + l.value, 0))} across ${leads.length} leads. Biggest deal: ${ranked.sort((a, b) => b.value - a.value)[0]?.name ?? "—"}.`;
  if (/meeting|demo|call|book/i.test(q)) {
    const m = leads.filter(wantsMeeting);
    return m.length ? `${m.map((l) => l.name).join(", ")} asked for a call. The meeting-booker agent can propose slots.` : "No pending meeting requests.";
  }
  return "Try asking: “Who should I focus on?”, “Who went quiet?”, “What's my pipeline worth?” or “Who wants a demo?”";
}
