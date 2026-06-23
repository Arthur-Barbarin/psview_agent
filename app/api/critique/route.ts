import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { personality, messages } = await req.json();

    const prompt = `You are a quality control agent reviewing outreach messages written by a recruiting agent.

THE AGENT'S PERSONALITY — specifically its AVOIDS list (rules it must never break):
${JSON.stringify(personality.avoids)}

THE AGENT'S VOICE PRINCIPLES:
${JSON.stringify(personality.voicePrinciples)}

MESSAGES TO REVIEW:
${JSON.stringify(messages)}

Your job: read each message and check it against the avoids list and voice principles. Find every violation.

Common violations to look for:
- Generic openers: "I wanted to follow up", "Following up on", "I hope you've had a chance", "Just checking in", "I wanted to reach out"
- Corporate or bureaucratic language the avoids list prohibits
- Generic sentences that could apply to any candidate
- Missing or vague CTA (should have a specific timeframe)
- Any item from the avoids list

For each violation found, rewrite the offending message to fix it — keeping everything else the same.

Return a JSON object:
{
  "reasoning": "What you checked and what you found",
  "passed": true or false,
  "violations": [
    {
      "messageStep": 1,
      "rule": "The specific rule that was violated",
      "originalOpener": "The exact phrase that violated it (if opener issue)"
    }
  ],
  "messages": [ the full messages array, with violations fixed — same structure as input ]
}

If no violations, return passed: true, violations: [], and messages unchanged.
Be strict. A message that almost follows a rule but not quite is still a violation.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/critique]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
