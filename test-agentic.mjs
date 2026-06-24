/**
 * PSVIEW Agentic Loop Test Harness
 *
 * Usage:
 *   node test-agentic.mjs                                  # localhost:3000
 *   PSVIEW_URL=https://psview-agent-demo.vercel.app node test-agentic.mjs
 *
 * What it does:
 *   - For each scenario: configure → plan → critique → agent-reply
 *   - Runs assertions on signal, tool selection, banned phrases, CTAs, grounding
 *   - Prints PASS/FAIL with the tool trace so you can debug at a glance
 *
 * What it surfaces:
 *   - Tool selection regressions (e.g. close_thread missing on declined)
 *   - Grounding regressions (model inventing comp, team size, GPU model)
 *   - Personality consistency (formal company → no casual phrases)
 *   - Hard-decline still produces a CTA (the worst recruiter bug)
 */

const BASE = process.env.PSVIEW_URL?.replace(/\/$/, "") || "http://localhost:3000";
// Groq free tier is ~6k TPM. Each scenario uses ~12k tokens. Wait ~75s between
// scenarios to stay under the limit. Override with DELAY_MS=10000 if you're on
// a paid tier.
const DELAY_MS = Number(process.env.DELAY_MS ?? 1_500);

// ─── Reusable company contexts ───────────────────────────────────────────

const MISTRAL = {
  name: "Mistral AI",
  description:
    "European AI lab building frontier open-weight models. Fast-moving, deeply technical, Paris-based.",
  culture:
    "Radical transparency, high ownership, no bureaucracy. Engineers ship fast and have real impact.",
  profiles:
    "Senior ML engineers, research scientists, infra engineers who've scaled distributed systems.",
  tone: "Direct and smart. No corporate speak. Peer-to-peer, like one engineer talking to another.",
};

const LATHAM = {
  name: "Latham & Watkins",
  description:
    "Global elite law firm. Top-tier M&A, capital markets, and litigation practices. London/Paris/NYC.",
  culture:
    "Excellence, partnership, intellectual rigor. Long-tenure partners. Discretion and gravitas.",
  profiles:
    "Top-tier associates from magic circle or white shoe firms. JDs from elite schools. 3–6 years PQE.",
  tone:
    "Formal, measured, gravitas. Professional restraint. Never casual. Respect for the institution.",
};

const SOPHIE = {
  name: "Sophie Leclerc",
  role: "Staff ML Engineer at Meta AI",
  background:
    "5 years on LLaMA pre-training, published at NeurIPS, open-source contributor.",
};

const MARC = {
  name: "Marc Dubois",
  role: "Senior Associate at Clifford Chance, Paris",
  background:
    "5 years in cross-border M&A. Bar admitted in Paris and NY. Princeton + Sciences Po.",
};

// ─── Scenarios ────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "interested-with-tech-q",
    label: "INTERESTED — asks specific technical question (grounding test)",
    company: MISTRAL,
    candidate: SOPHIE,
    intent: "Recruit for a senior ML engineer role focused on model pre-training",
    reply:
      "Interesting. I've been following Mixtral closely. What does the pre-training infra look like — custom clusters or cloud? And how large is the training team?",
    expect: {
      signal: "interested",
      toolsRequired: ["classify_signal"],
      // Either compose_response, or flag_concern+compose_response (acceptable both ways)
      toolsForbidden: ["close_thread"],
      // Grounding: must NOT volunteer a specific GPU SKU or headcount number
      responseMustNotMatch: [
        /\bA100\b|\bH100\b|\bMI8\b|\bMI300\b|\bV100\b|TPU/i,
        /\bteam (?:is|of) \d+\b|\babout \d+ people\b|\b\d+\s*engineers?\b/i,
      ],
      responseMustContain: [
        /(Monday|Tuesday|Wednesday|Thursday|Friday|next week|tomorrow|this week)/i,
      ],
    },
  },
  {
    id: "declined",
    label: "DECLINED — explicit, no question",
    company: MISTRAL,
    candidate: SOPHIE,
    intent: "Recruit for a senior ML engineer role",
    reply: "Thanks but I'm happy where I am and not looking at the moment.",
    expect: {
      signal: "declined",
      toolsRequired: ["classify_signal", "close_thread"],
      toolsForbidden: ["compose_response", "revise_remaining_plan"],
      // No CTA on a decline — the worst recruiter bug
      responseMustNotMatch: [
        /free for|next week|call|chat|meeting|grab \d+|catch up|let's connect/i,
      ],
    },
  },
  {
    id: "hesitant-relocation",
    label: "HESITANT — specific concern (relocation)",
    company: MISTRAL,
    candidate: SOPHIE,
    intent: "Recruit for a senior ML engineer role",
    reply:
      "The work sounds interesting, but I'd need to relocate to Paris and I'm not sure I'm ready for that with my family situation.",
    expect: {
      signal: "hesitant",
      toolsRequired: ["classify_signal", "compose_response"],
      toolsForbidden: ["close_thread"],
      responseMustContain: [
        /(Monday|Tuesday|Wednesday|Thursday|Friday|next week|tomorrow|this week)/i,
      ],
      // Should address relocation, not pivot to something irrelevant
      responseShould: /relocat|family|move|Paris/i,
    },
  },
  {
    id: "asks-comp",
    label: "GROUNDING — candidate asks for salary range",
    company: MISTRAL,
    candidate: SOPHIE,
    intent: "Recruit for a senior ML engineer role",
    reply:
      "Before we go further — what's the base salary range for this role? I don't want to waste either of our time if it's not in the right zone.",
    expect: {
      // Both "interested" (direct question) and "hesitant" (comp as potential
      // blocker) are defensible reads of this reply. Either is acceptable.
      signalOneOf: ["interested", "hesitant"],
      toolsRequired: ["classify_signal"],
      toolsForbidden: ["close_thread"],
      // CRITICAL: must NOT invent a number
      responseMustNotMatch: [
        /\$\d{2,3}k\b|\$\d{2,3},\d{3}|€\s?\d{2,3}|\d{2,3}\s?(?:k|EUR|USD)\b/i,
      ],
      // Must defer to a human or use flag_concern — this is the real assertion
      acceptableEither: {
        flagFiredOR: /hiring manager|talent partner|head of (?:engineering|talent|people)|recruiter|founder|on a call/i,
      },
    },
  },
  {
    id: "formal-firm",
    label: "PERSONALITY — formal law firm tone consistency",
    company: LATHAM,
    candidate: MARC,
    intent: "Recruit for a Senior Associate role in cross-border M&A, Paris office",
    reply:
      "Thank you for the outreach. I'd be interested in learning more about the opportunity and the partnership trajectory.",
    expect: {
      signal: "interested",
      toolsRequired: ["classify_signal", "compose_response"],
      toolsForbidden: ["close_thread"],
      // Personality marker — formal firm shouldn't use casual phrases
      responseMustNotMatch: [
        /\b(?:gonna|wanna|hey|yo|cheers|grab a coffee|grab \d+|cool|awesome|love that|honestly)\b/i,
      ],
      responseMustContain: [
        /(Monday|Tuesday|Wednesday|Thursday|Friday|next week|tomorrow|this week)/i,
      ],
    },
  },
  {
    id: "curveball",
    label: "EDGE CASE — off-topic candidate reply",
    company: MISTRAL,
    candidate: SOPHIE,
    intent: "Recruit for a senior ML engineer role",
    reply:
      "btw your domain name is misspelled on linkedin",
    expect: {
      // Any signal acceptable here; the test is the agent doesn't crash and stays in character
      toolsRequired: ["classify_signal"],
      // Whatever it picks, it must commit (no fallback triggered)
      noFallback: true,
    },
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${path}: ${text.slice(0, 200)}`);
  }
}

function check(label, ok, detail = "") {
  const mark = ok ? c.green("✅") : c.red("❌");
  console.log(`     ${mark} ${label}${detail ? c.gray(" — " + detail) : ""}`);
  return ok;
}

async function runScenario(s) {
  console.log("\n" + c.bold("─".repeat(72)));
  console.log(c.bold(`SCENARIO: ${s.label}`));
  console.log(c.bold("─".repeat(72)));

  // 1. Configure
  const config = await post("/api/configure", { company: s.company });
  if (config?.error) throw new Error(`configure error: ${config.error}`);
  if (!config?.personality?.name) throw new Error("configure returned no personality");

  // 2. Plan
  const plan = await post("/api/plan", {
    company: s.company,
    personality: config.personality,
    candidate: s.candidate,
    intent: s.intent,
  });
  if (plan?.error) throw new Error(`plan error: ${plan.error}`);
  if (!plan?.messages?.length) throw new Error("plan returned no messages");

  // 3. Critique (skip if you want to save tokens; agentic loop doesn't need it)
  // const crit = await post("/api/critique", { personality: config.personality, messages: plan.messages });

  // 4. Agent reply — the agentic loop
  const conversation = [{ role: "agent", content: plan.messages[0].body }];
  const remaining = plan.messages.slice(1);

  const t0 = Date.now();
  const result = await post("/api/agent-reply", {
    company: s.company,
    personality: config.personality,
    candidate: s.candidate,
    intent: s.intent,
    conversation: [...conversation, { role: "candidate", content: s.reply }],
    candidateReply: s.reply,
    remainingMessages: remaining,
  });
  const ms = Date.now() - t0;
  if (result?.error) throw new Error(`agent-reply error: ${result.error}`);

  // ─── Render trace ────────────────────────────────────────────────────────
  console.log(`\n  ${c.gray("Candidate reply:")}\n  "${s.reply}"`);
  console.log(
    `\n  ${c.gray("Tool trace")} (${result.iterations ?? "?"} iter, ${ms}ms):`
  );
  for (const t of result.trace ?? []) {
    console.log(`    → ${c.bold(t.name)}: ${c.gray(t.summary || "")}`);
  }
  console.log(
    `\n  ${c.gray("Signal:")} ${result.signal}    ${c.gray("Response (" + (result.response?.length ?? 0) + " chars):")}\n  "${(result.response || "").slice(0, 280)}${(result.response?.length ?? 0) > 280 ? "…" : ""}"`
  );
  if (result.flaggedConcern) {
    console.log(`\n  ${c.yellow("🚩 Flagged:")} ${result.flaggedConcern}`);
  }
  if (result.fallback) {
    console.log(`\n  ${c.yellow("⚠ Fallback:")} ${result.fallback}`);
  }

  // ─── Assertions ──────────────────────────────────────────────────────────
  console.log(`\n  ${c.gray("Assertions:")}`);
  let passed = true;
  const e = s.expect;
  const toolNames = (result.trace ?? []).map((t) => t.name);

  if (e.signal) {
    passed &= check(`Signal is "${e.signal}"`, result.signal === e.signal, `got "${result.signal}"`);
  }
  if (e.signalOneOf) {
    passed &= check(
      `Signal is one of [${e.signalOneOf.join(", ")}]`,
      e.signalOneOf.includes(result.signal),
      `got "${result.signal}"`
    );
  }
  for (const tool of e.toolsRequired ?? []) {
    passed &= check(`Called ${tool}`, toolNames.includes(tool));
  }
  for (const tool of e.toolsForbidden ?? []) {
    passed &= check(`Did NOT call ${tool}`, !toolNames.includes(tool));
  }
  for (const re of e.responseMustNotMatch ?? []) {
    const match = (result.response || "").match(re);
    passed &= check(
      `Response does NOT contain ${re}`,
      !match,
      match ? `found: "${match[0]}"` : ""
    );
  }
  for (const re of e.responseMustContain ?? []) {
    const match = (result.response || "").match(re);
    passed &= check(`Response contains ${re}`, !!match, match ? `found: "${match[0]}"` : "");
  }
  if (e.responseShould) {
    const match = (result.response || "").match(e.responseShould);
    passed &= check(`Response addresses concern (${e.responseShould})`, !!match);
  }
  if (e.acceptableEither?.flagFiredOR) {
    const flagged = !!result.flaggedConcern;
    const matched = e.acceptableEither.flagFiredOR.test(result.response || "");
    passed &= check(
      `Defers to human OR flags (one of these must be true)`,
      flagged || matched,
      flagged ? "flag_concern fired" : matched ? "defers in response" : "neither"
    );
  }
  if (e.noFallback) {
    passed &= check(`No fallback triggered`, !result.fallback);
  }

  return { id: s.id, label: s.label, passed: !!passed, ms };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold(`\nPSVIEW Agentic Loop Tests — ${BASE}\n`));
  const results = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    try {
      results.push(await runScenario(SCENARIOS[i]));
    } catch (e) {
      console.log(`\n  ${c.red("❌ SCENARIO FAILED:")} ${e.message}`);
      results.push({ id: SCENARIOS[i].id, label: SCENARIOS[i].label, passed: false, error: e.message });
    }
    if (i < SCENARIOS.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log("\n" + c.bold("═".repeat(72)));
  const pass = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(c.bold(`Results: ${pass}/${total} scenarios passed`));
  console.log(c.bold("═".repeat(72)));
  for (const r of results) {
    const mark = r.passed ? c.green("✅") : c.red("❌");
    console.log(`  ${mark} ${r.label}${r.ms ? c.gray(` (${r.ms}ms)`) : ""}`);
  }
  process.exit(pass === total ? 0 : 1);
}

main().catch((e) => {
  console.error(c.red("\nFATAL: " + e.message));
  process.exit(2);
});
