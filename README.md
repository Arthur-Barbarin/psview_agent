# PSVIEW Recruiting Agent

An autonomous AI recruiting agent that configures itself from company context, plans its own outreach, verifies its own messages, and chooses its own actions during the conversation.

**Stack:** Next.js 14 · TypeScript · Tailwind · Groq (Llama 3.3 70B, native tool calling)

---

## What I built

Three connected stages in a single-page flow:

**1. Company context form**
Captures name, description, culture, hiring profiles, and tone. A specific input produces a specific agent — a Mistral AI recruiter sounds nothing like a McKinsey recruiter.

**2. Agent configuration & planning**
The agent derives its own personality model (voice principles, values, things it never does, opening/closing style). Then it runs a fit check on the candidate, generates a complete outreach sequence, and runs a self-critique pass against its own avoids list — auto-fixing any violations before the messages are shown.

**3. Conversation simulator with an agentic loop**
When a candidate replies, the agent doesn't follow a script. It receives a toolbox and decides — turn by turn, via Groq's native tool calling — which tools to invoke and in what order:

- `classify_signal` — interested / neutral / hesitant / declined
- `compose_response` — write the reply in character
- `revise_remaining_plan` — rewrite future messages if the signal changes the strategy
- `close_thread` — graceful shutdown for declined candidates
- `flag_concern` — escalate to a human when needed

The tool trace is rendered live in the UI as proof of autonomous reasoning. The orchestration is the model's, not the code's.

---

## Architecture

```
Company context
      │
      ▼
PersonalityDeriver          → Personality model
      │
      ▼
FitCheck + StrategyPlanner  → Score + outreach sequence
      │
      ▼
Critique pass               → Reads messages, auto-fixes violations
      │
      ▼
─────────── plan time ╶╶╶ run time ───────────
      │
      ▼
Agentic conversation loop  → Model picks tools each turn
   ┌──────────────────────────────────────────┐
   │ classify_signal → compose_response       │
   │                 → revise_remaining_plan  │
   │                 → close_thread           │
   │                 → flag_concern           │
   │ (max 6 iterations, model decides exit)   │
   └──────────────────────────────────────────┘
```

Five capabilities; one model deciding which to use; the trace shown to the user.

---

## Choices

- **Groq + Llama 3.3 70B** — fast enough for a real-time tool loop, capable enough for multi-step reasoning, free tier
- **Native tool calling, not JSON-schema prompting** — the agentic loop genuinely lets the model pick its next action; tools have structured args and the model's choice is the unit of autonomy
- **Self-critique before runtime** — a second model pass reads the planner's output against the personality's `avoids` list and rewrites violations. Catches mistakes before the human ever sees them
- **Tool trace in the UI** — invisible intelligence doesn't count; the trace is rendered as a terminal-style timeline next to the agent's response
- **No database** — state lives in localStorage for demo scope
- **Next.js API routes** — one-command Vercel deploy

---

## What makes it intelligent and not just an LLM call

> Given a candidate reply, the agent decides — turn by turn, via native tool calling — which capabilities to invoke: classify the signal, compose a response, revise the future plan, close the thread, or flag a concern. The orchestration is the model's, not the code's. Before that, a separate critique pass reads the planner's output against the personality's avoids list and auto-fixes violations. The tool trace is shown in the UI as it happens.

---

## Setup

```bash
git clone https://github.com/your-handle/psview-agent
cd psview-app
npm install
cp .env.example .env.local
# add your GROQ_API_KEY (free at console.groq.com)
npm run dev
```

Get a free Groq API key at [console.groq.com](https://console.groq.com).

---

## Deploy

```bash
vercel --prod
# set GROQ_API_KEY in Vercel project settings
```
