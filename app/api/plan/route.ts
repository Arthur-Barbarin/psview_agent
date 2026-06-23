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

STRICT RULES — every message must follow these or it fails:
1. PERSONALITY CHECK: Before finalising each message, verify it against the agent's "avoids" list. If any message violates even one item in "avoids", rewrite it until it doesn't. The personality is non-negotiable.
2. NO GENERIC OPENERS: Never start a follow-up with "following up on my previous message", "I wanted to follow up", or any variant. Each message must open on a new, specific angle — a new piece of information, a question, a relevant observation.
3. CONCRETE CTA: Every message must end with ONE specific call to action. Not "let's connect" or "I'd love to chat". Give a concrete timeframe: "Free for a 20-min call Thursday or Friday?", "Would next week work for a quick call?", or similar. Make it easy to say yes.
4. SPECIFICITY: Every message must reference at least one real detail from the candidate's background or the company context. No sentence should be copy-pasteable to a different candidate.`;

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
