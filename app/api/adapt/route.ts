import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
  const { company, personality, candidate, intent, conversation, signal, remainingMessages } = await req.json();

  const prompt = `You are an autonomous recruiting agent mid-conversation. You just read a candidate's reply and detected a signal.

YOUR PERSONALITY:
${JSON.stringify(personality)}

COMPANY: ${company.name} — ${company.description}
CANDIDATE: ${candidate.name}, ${candidate.role}
INTENT: ${intent}

CONVERSATION SO FAR:
${conversation.map((m: { role: string; content: string }) => `[${m.role === "agent" ? "YOU" : "CANDIDATE"}]: ${m.content}`).join("\n\n")}

SIGNAL DETECTED: ${signal}

REMAINING PLANNED MESSAGES (before this reply):
${JSON.stringify(remainingMessages)}

Based on the signal, decide autonomously whether to revise the remaining messages.
- "interested": compress or accelerate — cut soft nurture messages, move straight to a concrete next step (schedule a call, intro to the team). Max 1-2 messages.
- "hesitant": pivot the angle entirely. Address the specific concern raised. Do not repeat the original pitch. If they raised relocation, address relocation. If they raised compensation, address that.
- "declined": produce exactly ONE graceful closing message. Do not pitch again. Respect their decision, leave the door open briefly, stop. Never send 2+ messages after a declined signal.
- "neutral": minor adjustments only — sharpen the next message angle based on what you now know.

STRICT RULES for revised messages:
1. BANNED OPENERS — never start any message with: "following up", "I wanted to follow up", "I hope you've had a chance", "just checking in". Open each message on a fresh, specific angle that references the actual conversation that just happened.
2. CTA RULE: If signal is "interested" or "hesitant" — every message ends with ONE concrete CTA with a specific timeframe. If signal is "declined" — NO CTA, no pitch, one graceful close only.
3. PERSONALITY CHECK: Every message must pass the agent's "avoids" list. Rewrite any that don't.
4. SPECIFICITY: Reference actual details from this conversation. Nothing generic.

Return a JSON object:
{
  "reasoning": "Why you're changing (or keeping) the plan given this signal and what you're optimizing for",
  "revised": true or false,
  "messages": [ updated array of remaining messages with same structure as before ]
}

Be decisive. When in doubt, fewer messages is better than more.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1000,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/adapt]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
