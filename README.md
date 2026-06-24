# PSVIEW Recruiting Agent

An autonomous AI recruiting agent: drop in a company's context and a candidate, and the agent configures itself, plans its outreach, and conducts the candidate conversation — with the model picking its own tools at each step.

**Live:** https://psview-agent-demo.vercel.app
**Stack:** Next.js 14 · TypeScript · Tailwind · Groq (Llama 3.3 70B, native tool calling) · Tavily

---

## What makes it intelligent, not just an LLM call

Two agentic loops, both real: the model — not the code — decides which tools to invoke and in what order. Before writing, it picks its own web-search queries to ground the opener. During the conversation, it picks each turn's action autonomously. Every tool call is rendered live in the UI as proof of the reasoning trail.

---

## Try it

1. Open the live URL, hit *Fill example* for Mistral AI, click *Configure agent*. The agent derives its own personality model from the context — different inputs produce visibly different agents (measured Jaccard similarity between Mistral and a formal law-firm opener: 0.09).
2. Enter a candidate with a public footprint (e.g. *Tri Dao, Princeton + Together AI, FlashAttention author*) and leave research on. The planner's research trace shows the search queries the agent picked itself; the opener cites real findings.
3. Click *Simulate reply* on message 1. Try a question, a decline, or an injection attempt. The tool trace below the response shows which tools the agent invoked and why.

---

## Architecture

```
Company context
      │
      ▼
PersonalityDeriver                  → derives personality model
      │
      ▼
Agentic research loop (opt-in)      → model picks search tools
   ┌──────────────────────────────────────────┐
   │ research_candidate (up to 2x)  ─→ Tavily │
   │ no_research_needed                       │
   └──────────────────────────────────────────┘
      │
      ▼
FitCheck + StrategyPlanner          → fit score + grounded sequence
      │
      ▼
Critique pass                       → reads messages, auto-fixes violations
      │
      ▼
─────────── plan time ╶╶╶ run time ───────────
      │
      ▼
Agentic conversation loop           → model picks tools each turn
   ┌──────────────────────────────────────────┐
   │ classify_signal → compose_response       │
   │                 → revise_remaining_plan  │
   │                 → close_thread           │
   │                 → flag_concern           │
   │ (max 6 iterations, model decides exit)   │
   └──────────────────────────────────────────┘
```

Two agentic loops; one model deciding which tool fires; both traces visible in the UI.

---

## Design choices

- **Native Groq tool calling, not JSON-mode prompting.** The model's choice of which tool to invoke is the unit of autonomy. Without real tool calling, "agent" is marketing.
- **Two loops, not one.** Research and conversation are different problem shapes — one is a small information-gathering loop, the other is a runtime OODA cycle. Collapsing them into one chain loses both.
- **Self-critique gates the planner's output.** Trusting the model to enforce its own rules in one prompt is fragile; a second pass that compares output against the `avoids` list is reliable and shows up as a green check in the UI.
- **Fit check can refuse.** Scoring isn't decoration — if the candidate clearly doesn't match, the agent says so and gates the plan behind a *Plan anyway* confirmation.
- **Grounding rules are strict.** Hallucinated specs ("custom A100 clusters", "team of 12") and fabricated actions ("I've sent the calendar invite") are explicitly forbidden; the agent defers to a human instead. This is the difference between a recruiter agent you'd actually ship and a confident-sounding bullshitter.
- **Trace, not narration.** "Reasoning" generated inside the same call as the output is narration; reasoning that picks the next tool is intelligence. The UI shows the latter as a terminal-style timeline.

---

## Roadmap

- **`research_company` tool** — extend autonomous research to the company side, so thin context inputs still produce grounded openers.
- **Critic loop on every conversation turn** — symmetric to the plan-time critique; tightens runtime self-correction.
- **Cross-session personality reuse** — persist derived personalities so a hiring intent reuses one agent across many candidates.
- **Streaming tool traces** — render each tool call as it lands rather than after the loop completes; makes autonomy feel live.

---

## Tests

Three Node harnesses in the repo (`test-agentic.mjs`, `test-research.mjs`, `test-adversarial.mjs`) cover happy-path, research, and adversarial cases — including prompt extraction attempts, multi-turn consistency, cross-personality leak, wrong-fit detection, and foreign-language adaptation. All passing on the live deployment.

---

## Setup

Requires Node 18+. Runs on macOS (Intel and Apple Silicon), Linux, and Windows. No native dependencies.

```bash
git clone <your-fork>
cd psview-app
npm install
cp .env.example .env.local
# Required:  GROQ_API_KEY    (free at console.groq.com)
# Optional:  TAVILY_API_KEY  (free at tavily.com — enables candidate research)
npm run dev
```

## Deploy

```bash
vercel --prod
# Add GROQ_API_KEY and (optionally) TAVILY_API_KEY in Vercel project settings.
```
