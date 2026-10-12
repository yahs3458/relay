import { templateDraft, type Lead, type Rules } from "@/lib/relay";

// Drafts one follow-up email via OpenRouter (any model, e.g. a free ":free" one) when OPENROUTER_API_KEY is set.
// Without a key — or if the model fails — it falls back to the offline template, so the demo always works.
const KEY = process.env.OPENROUTER_API_KEY;
// Free models change over time; pick a current ":free" model on openrouter.ai/models and set OPENROUTER_MODEL.
const MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

// ponytail: in-memory per-IP limit, resets on cold start; use Upstash/Vercel KV if abuse becomes real.
const hits = new Map<string, { n: number; at: number }>();
const LIMIT = 20; // AI drafts per IP per hour

function allowed(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 3_600_000) {
    hits.set(ip, { n: 1, at: now });
    return true;
  }
  h.n += 1;
  return h.n <= LIMIT;
}

const SYSTEM = `You write short sales follow-up emails for a small business using a CRM.
Rules:
- 50-90 words, plain text, no subject line, no markdown.
- Use ONLY facts from the lead's note. Never invent prices, dates, discounts or promises.
- One clear next step (usually a short call). Sign off as "Alex".
- Match the requested tone. Output only the email.`;

export async function POST(req: Request) {
  let lead: Lead, rules: Rules;
  try {
    ({ lead, rules } = await req.json());
    if (!lead?.name || !lead?.lastNote || !rules?.tone) throw new Error("missing fields");
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const fallback = (why: string) => Response.json({ text: templateDraft(lead, rules), source: "template", why });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!KEY) return fallback("no-key");
  if (!allowed(ip)) return fallback("rate-limited");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.yashtechstudio.com",
        "X-Title": "Relay demo",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        reasoning: { enabled: false }, // reasoning models (e.g. Nemotron) otherwise spend the whole budget thinking
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Tone: ${rules.tone}\nLead: ${lead.name}, ${lead.company}\nStatus: ${lead.status}, ${lead.daysSinceContact} days since last contact\nCustomer wants: ${String(lead.topic ?? "").slice(0, 200)}
Internal note (context only, never quote it): ${String(lead.lastNote).slice(0, 600)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`openrouter-${res.status}`);
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").replace(/^subject:.*\n+/i, "").trim();
    return text ? Response.json({ text, source: "ai", model: MODEL }) : fallback("empty-reply");
  } catch (err) {
    console.error("draft failed", err);
    return fallback(err instanceof Error ? err.message.slice(0, 40) : "error");
  }
}
