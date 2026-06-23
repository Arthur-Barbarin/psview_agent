import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
  const { company, personality, candidate, intent } = await req.json();

  const prompt = `You are an autonomous recruiting agent with the following personality:

AGENT PERSONALITY:
${JSON.stringify(personality, null, 2)}

COMPANY CONTEXT:
${company.name} — ${company.description}
Culture: ${company.culture}
Hires: ${company.profiles}

CANDIDATE:
Name: ${candidate.name}
Current Role: ${candidate.role}
Background: ${candidate.background}

OUTREACH INTENT:
${intent}

Your task: Autonomously plan and generate a complete outreach sequence for this candidate. Do NOT generate message by message — first reason about the full strategy, then produce all messages.

Return a JSON object with this exact structure:
{
  "reasoning": "Your full strategic thinking: why this candidate, what angle to take, how many messages and why, what progression makes sense, what to emphasize given their background, what objections to anticipate",
  "strategy": {
    "touchpoints": 3,
    "arc": "One sentence describing the narrative arc across all messages",
    "angle": "The specific hook or angle for this candidate given their background"
  },
  "messages": [
    {
      "step": 1,
      "channel": "LinkedIn" or "Email",
      "subject": "Subject line if email, null if LinkedIn",
      "body": "The full message text, written in the agent's voice",
      "intent": "What this message is trying to accomplish"
    }
  ]
}

STRICT RULES — every message must follow all of these without exception:

1. PERSONALITY CHECK: After writing each message, check it against the agent's "avoids" list word by word. If it violates any item, rewrite the entire message. Do this before returning.

2. BANNED OPENERS — the following phrases are completely forbidden as message openers. If any message starts with one of these, rewrite it:
   - "I wanted to follow up"
   - "Following up on my previous message"
   - "I hope you've had a chance"
   - "Just checking in"
   - "I wanted to reach out"
   - "I hope this message finds you"
   Instead: open each follow-up with a new specific angle — share a new data point, ask a pointed question, reference something specific about their work, or open with a concrete observation. Make it feel like message 1 of a new thread, not a reminder.

3. CONCRETE CTA: Every message ends with ONE specific CTA. Forbidden: "let's connect", "I'd love to chat", "feel free to reach out". Required: a concrete timeframe. Examples: "Free for 20 min Thursday or Friday?", "Would next week work for a quick call?", "I can do Monday or Wednesday afternoon if that works."

4. SPECIFICITY: Every sentence that could apply to any other candidate must be rewritten. Reference actual details: their specific company, their specific work, their specific background. Nothing generic.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 3000,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/plan]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
