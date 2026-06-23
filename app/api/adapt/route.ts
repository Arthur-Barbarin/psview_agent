import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { company, personality, candidate, intent, conversation, signal, remainingMessages } = await req.json();

  const prompt = `You are an autonomous recruiting agent mid-conversation. You just read a candidate's reply and detected a signal.

YOUR PERSONALITY:
${JSON.stringify(personality, null, 2)}

COMPANY: ${company.name} — ${company.description}
CANDIDATE: ${candidate.name}, ${candidate.role}
INTENT: ${intent}

CONVERSATION SO FAR:
${conversation.map((m: { role: string; content: string }) => `[${m.role === "agent" ? "YOU" : "CANDIDATE"}]: ${m.content}`).join("\n\n")}

SIGNAL DETECTED: ${signal}

REMAINING PLANNED MESSAGES (before this reply):
${JSON.stringify(remainingMessages, null, 2)}

Based on the signal, decide autonomously whether to revise the remaining messages.
- "interested": compress or accelerate — skip soft nurture, move toward a concrete next step
- "hesitant": pivot the angle, address the real concern, don't just repeat the same pitch
- "declined": one final graceful message, then stop. Don't push.
- "neutral": minor adjustments only if needed

Return a JSON object:
{
  "reasoning": "Why you're changing (or keeping) the plan given this signal and what you're optimizing for",
  "revised": true or false,
  "messages": [ updated array of remaining messages with same structure as before ]
}

If the signal is strong enough to change the plan, rewrite the remaining messages entirely. Be decisive.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 2000,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
}
