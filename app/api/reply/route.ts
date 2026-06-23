import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
  const { company, personality, candidate, intent, conversation, candidateReply } = await req.json();

  const prompt = `You are an autonomous recruiting agent. Stay in character at all times.

YOUR PERSONALITY:
${JSON.stringify(personality, null, 2)}

COMPANY: ${company.name} — ${company.description}
CANDIDATE: ${candidate.name}, ${candidate.role}
OUTREACH INTENT: ${intent}

CONVERSATION SO FAR:
${conversation.map((m: { role: string; content: string }) => `[${m.role === "agent" ? "YOU" : "CANDIDATE"}]: ${m.content}`).join("\n\n")}

CANDIDATE JUST REPLIED:
"${candidateReply}"

Analyze their reply and respond. Return a JSON object:
{
  "reasoning": "What signals you're reading from their reply (interest level, tone, objections, questions), and how you're choosing to respond given your personality and the outreach intent",
  "signal": "interested" | "neutral" | "hesitant" | "declined",
  "response": "Your full reply message, written in your authentic voice"
}

SIGNAL CLASSIFICATION — be precise, do not default to optimistic:
- "interested": candidate asks specific questions about the role, team, or process. They are engaging substantively. Asking "what does the team look like?" = interested.
- "neutral": candidate hasn't engaged meaningfully yet. Generic replies, no questions asked, non-committal acknowledgements.
- "hesitant": candidate has a specific concern or objection but is still engaging. "I'm worried about relocation" or "I'm not sure about the compensation" = hesitant.
- "declined": candidate says they are happy where they are, not looking, or otherwise not interested. "I'm happy where I am", "not looking right now", "not interested at the moment" = DECLINED, not hesitant. Do not over-interpret softness as openness.

When in doubt between hesitant and declined: if they gave no opening, no question, no sign of curiosity — classify as declined.

Stay true to your personality. Adapt to their energy. End every response with ONE concrete, specific call to action — a specific day/timeframe ("free for 20 min Thursday or Friday?"), not a vague "let's connect". Never be generic.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1500,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/reply]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
