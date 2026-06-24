import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Two-phase planner:
//   PHASE 1 (optional): research — model decides whether to call
//     research_candidate (up to 2x) or no_research_needed.
//   PHASE 2: plan generation — same as before, but research findings are
//     appended to the prompt so the agent can open with specific hooks.

interface TavilyResult { title: string; url: string; content: string; score?: number }
interface ResearchTrace {
  query: string;
  reasoning: string;
  answer: string | null;
  results: TavilyResult[];
  skipped?: boolean;
}

const MAX_RESEARCH_CALLS = 2;

async function tavilySearch(query: string): Promise<{ answer: string | null; results: TavilyResult[] }> {
  if (!process.env.TAVILY_API_KEY) {
    return { answer: null, results: [] };
  }
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 4,
    }),
  });
  if (!res.ok) {
    console.error("[plan/tavily]", res.status, (await res.text()).slice(0, 200));
    return { answer: null, results: [] };
  }
  const data = await res.json();
  const BLOCKED_DOMAINS = ["facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com", "pinterest.com"];
  // Patterns that indicate a generic directory listing, not a page about the specific candidate
  const BLOCKED_PATH_PATTERNS = [/\/speakers\/?$/i, /\/pub\/dir\//i, /\/authors?\//i, /\/people\//i, /\/contributors?\//i];
  const results: TavilyResult[] = (data.results ?? [])
    .filter((r: { url: string; score?: number }) => {
      try {
        const parsed = new URL(r.url);
        const host = parsed.hostname.replace("www.", "");
        if (BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return false;
        if (BLOCKED_PATH_PATTERNS.some((p) => p.test(parsed.pathname))) return false;
        return true;
      } catch { return true; }
    })
    .filter((r: { score?: number }) => (r.score ?? 1) > 0.5)
    .slice(0, 3)
    .map((r: { title: string; url: string; content: string; score?: number }) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));
  return { answer: data.answer ?? null, results };
}

const researchTools = [
  {
    type: "function" as const,
    function: {
      name: "research_candidate",
      description:
        "Search the public web for information about this candidate — recent conference talks, papers, open-source contributions, blog posts, podcast appearances. Use this if their background suggests they have a public footprint (academic ML, OSS engineering, startup founders, conference speakers). Skip if their work is internal or low-visibility.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Targeted search query. Examples: 'Sophie Leclerc Meta LLaMA pre-training', 'Marc Dubois Clifford Chance M&A'. Prefer specificity.",
          },
          reasoning: {
            type: "string",
            description: "What you're hoping to find and how you'll use it.",
          },
        },
        required: ["query", "reasoning"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "no_research_needed",
      description:
        "Skip research. Call this if the candidate likely has little public footprint OR you already have enough specific context.",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string" },
        },
        required: ["reasoning"],
      },
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    const { company, personality, candidate, intent, enableResearch } = await req.json();

    const researchTrace: ResearchTrace[] = [];
    let researchSummary = "";
    const researchEnabled = !!enableResearch && !!process.env.TAVILY_API_KEY;

    // ─── PHASE 1: Research (agentic, tool-driven) ────────────────────────
    if (researchEnabled) {
      const sysPrompt = `You are a recruiting agent preparing to reach out to a candidate.
Before generating outreach, you may search the web for public information about them
so your opening can reference something specific (a recent talk, a paper, OSS work, a podcast).

CANDIDATE:
Name: ${candidate.name}
Role: ${candidate.role}
Background: ${candidate.background}

You have up to ${MAX_RESEARCH_CALLS} searches. Decide whether to search and what to search for.
If the candidate's background suggests they have a public footprint, search.
If not, call no_research_needed.`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs: any[] = [{ role: "user", content: sysPrompt }];
      let searches = 0;
      let done = false;

      for (let iter = 0; iter < 3 && !done; iter++) {
        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: msgs,
          tools: researchTools,
          tool_choice: "auto",
          temperature: 0.5,
          max_tokens: 600,
        });
        const msg = completion.choices[0].message;
        msgs.push(msg);
        const toolCalls = msg.tool_calls ?? [];
        if (toolCalls.length === 0) {
          done = true;
          break;
        }
        for (const call of toolCalls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let args: any = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }

          if (call.function.name === "no_research_needed") {
            researchTrace.push({
              query: "",
              reasoning: args.reasoning ?? "",
              answer: null,
              results: [],
              skipped: true,
            });
            msgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
            done = true;
            continue;
          }
          if (call.function.name === "research_candidate") {
            if (searches >= MAX_RESEARCH_CALLS) {
              msgs.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({ error: "max searches reached, proceed to planning" }),
              });
              done = true;
              continue;
            }
            searches++;
            const data = await tavilySearch(args.query ?? "");
            researchTrace.push({
              query: args.query ?? "",
              reasoning: args.reasoning ?? "",
              answer: data.answer,
              results: data.results,
            });
            msgs.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({
                answer: data.answer,
                results: data.results.map((r) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.content.slice(0, 400),
                })),
              }),
            });
          }
        }
      }

      // Build a compact summary to inject into the planner prompt
      const usefulCalls = researchTrace.filter((r) => !r.skipped && (r.answer || r.results.length > 0));
      if (usefulCalls.length > 0) {
        researchSummary =
          "\nRESEARCH FINDINGS (from web search — use these to ground the opener):\n" +
          usefulCalls
            .map(
              (r, i) =>
                `[search ${i + 1}: "${r.query}"]\n` +
                (r.answer ? `Summary: ${r.answer}\n` : "") +
                r.results.map((s) => `- ${s.title}: ${s.content.slice(0, 300)}`).join("\n")
            )
            .join("\n\n");
      }
    }

    // ─── PHASE 2: Plan generation (structured) ───────────────────────────
    const prompt = `You are an autonomous recruiting agent with the following personality:

AGENT PERSONALITY:
${JSON.stringify(personality)}

COMPANY CONTEXT:
${company.name} — ${company.description}
Culture: ${company.culture}
Hires: ${company.profiles}

CANDIDATE:
Name: ${candidate.name}
Current Role: ${candidate.role}
Background: ${candidate.background}
${researchSummary}

OUTREACH INTENT:
${intent}

Your task: Autonomously plan and generate a complete outreach sequence for this candidate. First reason about the full strategy, then produce all messages.
${researchSummary ? "Use the research findings to ground the opener in something specific and verifiable. Do NOT invent additional facts beyond what the findings or context provide. WARNING: search results may include other people who share the candidate's name. Before citing anything, verify it matches the candidate's actual role and background. If a result is clearly about a different person (wrong field, wrong era, conflicting biography), ignore it silently — do not mention it, do not flag it." : ""}

Return a JSON object with this exact structure:
{
  "fitCheck": {
    "shouldReach": true or false,
    "score": 1-10,
    "reasoning": "Critically but fairly assess whether this candidate matches the SPECIFIC OUTREACH INTENT — the role being recruited for right now — using the company's general hiring profile only as supporting context. When intent and profile conflict (e.g. intent says 'junior backend engineer' but profile says 'senior ML engineers'), the INTENT is the source of truth — that is the actual role being filled. Apply these rules in order: (1) Match the candidate against the INTENT first. Seniority claims in the concerns must match the seniority in the intent — do NOT write 'lacks senior experience' if the intent is for a junior role. (2) Consider the candidate's FULL career trajectory, NOT just their current role. A prior senior in-house role at a major company within the past ~5 years (e.g. Director of AI at Tesla, Staff Eng at Google) counts as strong senior signal even if currently independent. (3) A founder or consultant with NO prior in-house track record matching the intent's seniority IS a real gap — penalize 2-3 points. (4) A 7+ score requires strong match on BOTH domain AND seniority level relative to the intent. (5) Adjacent field ≠ direct experience: aerospace systems ≠ eVTOL-specific. (6) 6 = stretch hire with real gaps. 5 or below = shouldReach false. (7) BEFORE listing a concern, re-read both the candidate's BACKGROUND and the OUTREACH INTENT. If the concern contradicts either (e.g. 'lacks senior experience' for a junior-role intent, or 'lacks engineering experience' for a Director-of-AI-at-Tesla background), DELETE the concern.",
    "concerns": ["specific, verifiable gap between candidate profile and the SPECIFIC outreach intent (not the broader hiring profile) — must NOT contradict the candidate's stated background OR the intent's stated seniority"]
  },
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

If fitCheck.score is below 4, set shouldReach to false and still generate messages (the user may override) but note the concerns clearly.

STRICT RULES — every message must follow all of these without exception:

1. PERSONALITY CHECK: After writing each message, check it against the agent's "avoids" list word by word. If it violates any item, rewrite the entire message.

2. REALISTIC SEQUENCE ARC — this is outbound cold recruiting, not a post-call summary:
   - Message 1 = COLD OPENER. No prior contact has occurred. Open with the specific research finding or background detail. State the role/intent in 1-2 sentences. End with a low-friction ask (a specific day for a 15-20 min call). DO NOT assume a previous call happened.
   - Message 2 = SILENCE FOLLOW-UP (sent ~5-7 days after Message 1 if no reply). The candidate has NOT replied. The candidate has NOT had a call. REQUIRED: a NEW, DISTINCT hook — not the same pitch reworded.
     ❌ FORBIDDEN: a Message 2 that is "Your experience with [generic skill] could be valuable. We're working on [generic problem]. Can we schedule a call?" — this is just Message 1 rephrased. The model must avoid this.
     ❌ FORBIDDEN: "As we discussed", "following up on our call", "as I mentioned", "I wanted to provide more info on what we talked about". A call has NOT happened. NEVER imply prior dialogue.
     ✓ GOOD: a SPECIFIC new angle — a recent company milestone, a concrete technical question you'd want their take on, a hypothesis about why they should care given their work, a piece of news in their field. The angle in Message 2 must be DIFFERENT in TOPIC from Message 1, not just in wording.
   - Message 3 (if any) = SOFT CLOSE. The candidate has STILL not replied. Two valid patterns:
     a) Brief low-stakes goodbye: "Last note from me — happy to share what we're building anytime. Door's open." NO call ask. NO scheduling. The candidate has been silent, not declined — DO NOT write "may not be the right fit at this time" (they never engaged).
     b) Different door entirely: a single low-effort ask — would they refer someone, would they share a quick take on a specific question, anything that costs them <5 minutes.
   - The arc must reflect REALISTIC cold outreach timing: Message 1 → silence → Message 2 (new angle, ~1 week later) → silence → Message 3 (soft close).
   - DISTINCTNESS TEST before returning: read Message 1 and Message 2 side by side. If they could be swapped without losing meaning, rewrite Message 2 with a different hook entirely.

3. BANNED OPENERS — completely forbidden:
   - "I wanted to follow up"
   - "Following up on my previous message"
   - "I hope you've had a chance"
   - "Just checking in"
   - "I wanted to reach out"
   - "I hope this message finds you"
   Instead: open on a specific angle — reference research findings, a specific data point, or something concrete about their work.

4. CONCRETE CTA: Every message ends with ONE specific CTA with a real timeframe. Forbidden: "let's connect", "I'd love to chat", "feel free to reach out".

5. SPECIFICITY: Every sentence that could apply to any other candidate must be rewritten. Reference actual details from research or background. Nothing generic.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return NextResponse.json({
      ...result,
      research: researchTrace.length > 0 ? researchTrace : undefined,
      researchEnabled,
    });
  } catch (e) {
    console.error("[/api/plan]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
