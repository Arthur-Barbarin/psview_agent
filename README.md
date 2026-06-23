# PSVIEW Recruiting Agent

A mini web app that deploys an autonomous AI recruiting agent — configured from company context, not from a prompt template.

**Stack:** Next.js 14 · TypeScript · Tailwind · Groq (Llama 3.3 70B)

---

## What I built

Three connected stages in a single-page flow:

**1. Company context form**
Captures name, description, culture, hiring profiles, and desired tone. Specific inputs produce a specific agent — a Mistral AI recruiter sounds nothing like a McKinsey recruiter.

**2. Agent configuration**
The agent reads the company context and derives its own personality model: voice principles, values to embody, things it never does, how it opens and closes. It then takes a candidate profile and outreach intent and autonomously plans a full message sequence — deciding the number of touchpoints, the narrative arc, and the specific angle for this candidate — before generating a single word.

**3. Conversation simulator**
Shows the planned message sequence. You type a candidate reply; the agent reads the signal (interested / neutral / hesitant / declined), reasons about how to respond given its personality, and replies in character. No emails sent. No LinkedIn messages. Full simulation.

---

## Architecture

```
Company context
      │
      ▼
PersonalityDeriver  ──→  Personality model (persisted across all steps)
      │
      ▼
StrategyPlanner     ──→  Engagement strategy + message sequence
      │
      ▼
ConversationAgent   ──→  In-character replies (uses personality + history)
```

Each stage is a separate API call with its own prompt. The personality model is derived once and threaded through every subsequent call — not regenerated per message. The agent's reasoning is surfaced at each step via a collapsible "Agent reasoning" panel.

---

## Choices

- **Groq + Llama 3.3 70B** — free tier, fast enough to feel real-time, capable enough for multi-step reasoning
- **JSON-mode responses throughout** — every API call returns structured output with a `reasoning` field alongside the actual content, making the intelligence visible rather than opaque
- **No database** — state lives in React for demo scope; adding Supabase would be a one-step extension
- **Next.js API routes** — no separate backend needed, deploys to Vercel in one command

---

## What makes it intelligent and not just an LLM call

> The agent derives its own persistent personality model from company context, then plans a complete engagement strategy before generating a single message — rather than receiving a pre-written prompt and filling in the blanks.

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
