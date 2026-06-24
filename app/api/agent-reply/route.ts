import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Agentic conversation handler. Unlike /api/reply + /api/adapt (which the
// frontend orchestrates), this endpoint hands the model a toolbox and lets it
// decide which tools to call in which order. The loop exits when the model
// stops returning tool calls or after MAX_ITERATIONS — whichever comes first.

const MAX_ITERATIONS = 6;

const tools = [
  {
    type: "function" as const,
    function: {
      name: "classify_signal",
      description:
        "Classify the candidate's last reply. Call this first, exactly once. " +
        "Rules: any direct question = interested; explicit 'not looking'/'happy where I am' with no question = declined; " +
        "specific concern (relocation, comp, timing) while still engaging = hesitant; non-committal one-liner = neutral.",
      parameters: {
        type: "object",
        properties: {
          signal: { type: "string", enum: ["interested", "neutral", "hesitant", "declined"] },
          reasoning: { type: "string", description: "Why you read this signal — cite specific phrases from their reply." },
        },
        required: ["signal", "reasoning"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compose_response",
      description:
        "Write the message you will send back to the candidate. Use for interested / neutral / hesitant signals. " +
        "Must follow your personality, end with ONE concrete CTA with a real timeframe.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The full message body, in your voice." },
          reasoning: { type: "string", description: "Why this response, in one sentence." },
        },
        required: ["message", "reasoning"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "revise_remaining_plan",
      description:
        "Rewrite the remaining planned messages based on what you've learned. " +
        "Only call this if the signal materially changes what should come next. " +
        "For 'interested': compress to 1–2 messages, accelerate to a concrete next step. " +
        "For 'hesitant': pivot the angle to address the specific concern. " +
        "For 'declined': do NOT call this — call close_thread instead. " +
        "For 'neutral': only if you have a sharper angle.",
      parameters: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "Why you're revising and what you're optimizing for." },
          messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "number" },
                channel: { type: "string", enum: ["LinkedIn", "Email"] },
                subject: { type: ["string", "null"] },
                body: { type: "string" },
                intent: { type: "string" },
              },
              required: ["step", "channel", "subject", "body", "intent"],
            },
          },
        },
        required: ["reasoning", "messages"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "close_thread",
      description:
        "Send a graceful closing message. Use ONLY for 'declined' signals. No CTA, no pitch, leave the door open in one sentence, stop.",
      parameters: {
        type: "object",
        properties: {
          finalMessage: { type: "string", description: "The closing message — short, respectful, no ask." },
          reasoning: { type: "string", description: "Why you're closing and not pushing." },
        },
        required: ["finalMessage", "reasoning"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "flag_concern",
      description:
        "Flag something a human recruiter should know — a sensitive concern, an unusual situation, a question outside your authority (specific comp numbers, visa, equity details). Optional. Does not replace compose_response.",
      parameters: {
        type: "object",
        properties: {
          concern: { type: "string", description: "What to flag and why a human should see it." },
        },
        required: ["concern"],
      },
    },
  },
];

interface ToolTraceEntry {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  summary: string;
}

export async function POST(req: NextRequest) {
  try {
    const { company, personality, candidate, intent, conversation, candidateReply, remainingMessages } = await req.json();

    const systemPrompt = `You are an autonomous recruiting agent representing ${company.name}.

YOUR PERSONALITY:
${JSON.stringify(personality)}

COMPANY: ${company.name} — ${company.description}
CULTURE: ${company.culture}
HIRES: ${company.profiles}

CANDIDATE: ${candidate.name}, ${candidate.role}
BACKGROUND: ${candidate.background}
OUTREACH INTENT: ${intent}

YOU HAVE A TOOLBOX. You decide which tools to call and in what order.

Always:
1. classify_signal FIRST (exactly once).
2. Then either compose_response (for interested/neutral/hesitant) OR close_thread (for declined). Never both.
3. revise_remaining_plan only when the signal materially changes the strategy.
4. flag_concern is optional — only if a human should know.

When you've taken all the actions you need, stop calling tools and produce a brief one-sentence summary.

PERSONALITY RULES — always enforce:
- Never violate any item in your "avoids" list.
- Banned openers: "I wanted to follow up", "Following up", "I hope you've had a chance", "Just checking in", "I wanted to reach out", "I hope this finds you".
- Every response (except close_thread) ends with ONE concrete CTA with a real timeframe.
- Reference details from the actual conversation. Nothing generic.

Be decisive. Fewer messages > more messages.`;

    const userPrompt = `CONVERSATION SO FAR:
${conversation.map((m: { role: string; content: string }) => `[${m.role === "agent" ? "YOU" : "CANDIDATE"}]: ${m.content}`).join("\n\n")}

CANDIDATE JUST REPLIED:
"${candidateReply}"

REMAINING PLANNED MESSAGES (you may revise these via revise_remaining_plan):
${JSON.stringify(remainingMessages ?? [])}

Decide what to do. Call your tools.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const trace: ToolTraceEntry[] = [];
    let signal: "interested" | "neutral" | "hesitant" | "declined" | null = null;
    let response: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let revisedMessages: any[] | undefined = undefined;
    let closed = false;
    let flaggedConcern: string | undefined = undefined;
    let iterations = 0;
    const usedTools = new Set<string>();

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.6,
        max_tokens: 1500,
      });

      const msg = completion.choices[0].message;
      messages.push(msg);

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // model finished
        break;
      }

      for (const call of toolCalls) {
        const name = call.function.name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let toolResult: any = { ok: true };
        let summary = "";

        if (name === "classify_signal") {
          if (usedTools.has("classify_signal")) {
            toolResult = { ok: false, error: "classify_signal already called this turn." };
            summary = `Tried to re-classify (rejected)`;
          } else {
            signal = args.signal;
            summary = `Signal: ${args.signal} — ${args.reasoning ?? ""}`;
          }
        } else if (name === "compose_response") {
          response = args.message ?? "";
          summary = `Composed reply (${(args.message ?? "").length} chars)`;
        } else if (name === "revise_remaining_plan") {
          revisedMessages = args.messages ?? [];
          summary = `Revised plan: ${revisedMessages?.length ?? 0} message(s) — ${args.reasoning ?? ""}`;
        } else if (name === "close_thread") {
          response = args.finalMessage ?? "";
          closed = true;
          summary = `Closed thread gracefully — ${args.reasoning ?? ""}`;
        } else if (name === "flag_concern") {
          flaggedConcern = args.concern;
          summary = `Flagged: ${args.concern}`;
        } else {
          toolResult = { ok: false, error: `Unknown tool: ${name}` };
          summary = `Unknown tool call: ${name}`;
        }

        usedTools.add(name);
        trace.push({ name, args, summary });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Soft exit: if we have a signal AND a response (or close), we have the minimum.
      // We still let the model finalize itself unless it loops needlessly.
      if (signal && response && iterations >= 3 && !revisedMessages) {
        // Give the model one more turn to decide whether to revise plan; if it doesn't, we exit on the next pass.
        // But if it already passed turn 4 with no revision, break to save latency.
        if (iterations >= 4) break;
      }
    }

    // Fallbacks if model misbehaved
    let fallback: string | undefined;
    if (!signal) {
      signal = "neutral";
      fallback = "Model did not call classify_signal — defaulted to neutral.";
    }
    if (!response) {
      response = closed
        ? "Thanks for getting back to me — appreciate the honesty. Door's open if anything changes."
        : "Thanks for the reply — let me come back with more on this shortly.";
      fallback = (fallback ? fallback + " " : "") + "Model did not produce a response — used safe fallback.";
    }

    return NextResponse.json({
      trace,
      signal,
      response,
      revisedMessages,
      closed,
      flaggedConcern,
      iterations,
      fallback,
    });
  } catch (e) {
    console.error("[/api/agent-reply]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
