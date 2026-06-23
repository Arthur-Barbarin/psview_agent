import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
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

Stay true to your personality. Adapt to their energy. If they're excited, match it. If they're skeptical, don't oversell — address the real concern. Never be generic.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1500,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
}
