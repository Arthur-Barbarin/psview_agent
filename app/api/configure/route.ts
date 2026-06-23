import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
  const { company } = await req.json();

  const prompt = `You are an AI agent that configures itself to represent a company in recruiting conversations.

Given this company context, derive a complete personality model for an AI recruiter agent.

COMPANY CONTEXT:
Name: ${company.name}
Description: ${company.description}
Culture & Values: ${company.culture}
Profiles They Hire: ${company.profiles}
Desired Tone: ${company.tone}

Return a JSON object with this exact structure:
{
  "reasoning": "Your step-by-step thinking about what personality fits this company, what to avoid, what signals matter for candidates they want",
  "personality": {
    "name": "A name for this agent persona (e.g. 'Alex from Stripe')",
    "voicePrinciples": ["3-5 specific rules about HOW this agent writes and speaks"],
    "valueSignals": ["3-4 values the agent naturally embodies in every message"],
    "avoids": ["2-3 things this agent never does or says"],
    "openingStyle": "How this agent typically opens a first message",
    "closingStyle": "How this agent typically closes messages"
  }
}

Think carefully. The personality must be specific to this company, not generic. A startup recruiter sounds different from a consulting firm recruiter.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 800,
  });

  const result = JSON.parse(completion.choices[0].message.content || "{}");
  return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/configure]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
