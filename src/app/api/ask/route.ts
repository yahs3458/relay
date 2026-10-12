import { localAnswer, scoreLead, type Lead } from "@/lib/relay";

// "Ask Relay": answers questions about the pipeline. OpenRouter model when a key is set, rule-based otherwise.
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";

export async function POST(req: Request) {
  let q: string, leads: Lead[];
  try {
    ({ q, leads } = await req.json());
    if (typeof q !== "string" || !Array.isArray(leads)) throw new Error("bad body");
    q = q.slice(0, 300);
    leads = leads.slice(0, 50);
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const local = (why: string) => Response.json({ text: localAnswer(q, leads), source: "rules", why });
  if (!KEY) return local("no-key");

  const table = leads
    .map((l) => `- ${l.name} | ${l.company} | $${l.value} | ${l.status} | ${l.daysSinceContact}d since contact | score ${scoreLead(l)} | note: ${String(l.lastNote).slice(0, 160)}`)
    .join("\n");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://www.yashtechstudio.com", "X-Title": "Relay demo" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        reasoning: { enabled: false }, // reasoning models (e.g. Nemotron) otherwise spend the whole budget thinking
        messages: [
          { role: "system", content: "You are Relay, a CRM assistant. Answer in 1-3 short sentences using ONLY the pipeline data given. If the data doesn't say, say so. No markdown." },
          { role: "user", content: `Pipeline:\n${table}\n\nQuestion: ${q}` },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`openrouter-${res.status}`);
    const text = String((await res.json())?.choices?.[0]?.message?.content ?? "").trim();
    return text ? Response.json({ text, source: "ai" }) : local("empty-reply");
  } catch (err) {
    console.error("ask failed", err);
    return local(err instanceof Error ? err.message.slice(0, 40) : "error");
  }
}
