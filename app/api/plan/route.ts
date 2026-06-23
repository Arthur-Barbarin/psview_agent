import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
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

Write messages in the agent's authentic voice — specific to this candidate, not generic copy. Reference real details from their background and the company context.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 3000,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
}
