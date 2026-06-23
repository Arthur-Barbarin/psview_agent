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
- "interested": candidate asks specific questions about the role, team, or process. Any direct question = interested. Examples: "What does the team look like?", "What's the comp range?", "What makes this different from X?" — ALL of these are interested signals. Asking questions means they are engaging, regardless of tone.
- "neutral": candidate hasn't engaged meaningfully. Generic one-liners, no questions, non-committal acknowledgements like "I'll think about it".
- "hesitant": candidate raises a specific concern or blocker while still engaging. "I'm worried about relocation", "I'd need to understand the equity" = hesitant.
- "declined": candidate explicitly says they are not interested or happy where they are, with no question or opening. "I'm happy where I am", "not looking right now", "not for me at the moment" = DECLINED. No question = no opening = declined.

Rule: if the candidate asked ANY question, classify as "interested", not hesitant or neutral.
Rule: if they gave no question and no opening, classify as "declined", not hesitant.

CTA RULES — strictly enforced:
- If signal is "interested" or "hesitant": end with ONE specific CTA with a real timeframe. "Free for 20 min Thursday or Friday?" — not "let's connect", not "I'd love to chat".
- If signal is "declined": NO call to action. Acknowledge respectfully, leave the door open in one sentence, stop. Do not pitch, do not suggest a call, do not ask for anything.

Stay true to your personality at all times. Never be generic.`;

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
