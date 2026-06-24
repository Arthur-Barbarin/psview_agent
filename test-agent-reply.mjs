/**
 * PSVIEW Agent Reply Test — agentic loop
 * Tests /api/agent-reply directly with a pre-baked personality + plan.
 * Run: node test-agent-reply.mjs (dev server must be on :3000)
 */

const BASE = "http://localhost:3000";

// Shared context — one company, one candidate, one plan used by all 3 scenarios
const COMPANY = {
  name: "Mistral AI",
  description: "European AI lab building frontier open-weight models. Fast-moving, deeply technical, Paris-based.",
  culture: "Radical transparency, high ownership, no bureaucracy. Engineers ship fast and have real impact.",
  profiles: "Senior ML engineers, research scientists, infra engineers who've scaled distributed systems.",
  tone: "Direct and smart. No corporate speak. Peer-to-peer.",
};

const CANDIDATE = {
  name: "Sophie Leclerc",
  role: "Staff ML Engineer at Meta AI",
  background: "5 years on LLaMA pre-training team, published at NeurIPS, open-source contributor.",
};

const INTENT = "Recruit for a senior ML engineer role focused on model pre-training at scale";

// Hardcoded personality — skip configure call to save time
const PERSONALITY = {
  name: "Alex from Mistral",
  voicePrinciples: [
    "Lead with a technical hook specific to the candidate's work",
    "Be direct and peer-level — no flattery, no fluff",
    "Name-drop real Mistral work (Mixtral, Le Chat, open weights) to prove you know your company",
    "One concrete ask per message, never vague",
  ],
  valueSignals: ["Technical depth", "Ownership", "Speed", "Open source"],
  avoids: ["Corporate speak", "Flattery", "Passive asks", "Following up on previous messages"],
  openingStyle: "Start with a specific technical observation about the candidate's work",
  closingStyle: "End with a concrete timeframe — never 'let's connect'",
};

// Remaining messages the agent can revise
const REMAINING_MESSAGES = [
  {
    step: 2,
    channel: "LinkedIn",
    subject: null,
    body: "Sophie — we just open-sourced Mixtral 8x22B. Curious if you'd been following the MoE work, since your LLaMA training background would map directly to what we're building. Down for a 20-min call next week?",
    intent: "Deepen the technical hook, move to a call",
  },
  {
    step: 3,
    channel: "Email",
    subject: "One more thing on the pre-training role",
    body: "Sophie, last one from me — we're building out the pre-training team significantly this quarter. If not now, happy to stay in touch. Would Thursday afternoon work for a quick call?",
    intent: "Final nudge, keep door open",
  },
];

const SCENARIOS = [
  {
    label: "INTERESTED — asks a specific technical question",
    reply: "Interesting. I've been following Mixtral closely actually. What does the pre-training infrastructure look like — are you running on custom clusters or cloud? And how large is the training team right now?",
    expect: {
      signal: "interested",
      shouldCall: ["classify_signal", "compose_response"],
      mayCall: ["revise_remaining_plan"],
      mustNotCall: ["close_thread"],
      noCTA: false,
    },
  },
  {
    label: "DECLINED — explicit, no question",
    reply: "Thanks for reaching out but I'm happy where I am and not looking at the moment.",
    expect: {
      signal: "declined",
      shouldCall: ["classify_signal", "close_thread"],
      mayCall: ["flag_concern"],
      mustNotCall: ["compose_response", "revise_remaining_plan"],
      noCTA: true,
    },
  },
  {
    label: "HESITANT — specific concern (relocation)",
    reply: "The work sounds interesting honestly, but I'd need to relocate to Paris and I'm not sure I'm ready for that right now with my family situation.",
    expect: {
      signal: "hesitant",
      shouldCall: ["classify_signal", "compose_response"],
      mayCall: ["flag_concern", "revise_remaining_plan"],
      mustNotCall: ["close_thread"],
      noCTA: false,
    },
  },
];

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
  return res.json();
}

function check(label, condition, detail = "") {
  const icon = condition ? "✅" : "❌";
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
  return condition;
}

async function runScenario(scenario, i) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`SCENARIO ${i + 1}: ${scenario.label}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Candidate reply: "${scenario.reply}"\n`);

  const conversation = [
    { role: "agent", content: "Sophie — noticed your work on LLaMA pre-training. We're building out Mistral's training team and your background maps directly to what we need. Free for 20 min Thursday or Friday?" },
    { role: "candidate", content: scenario.reply },
  ];

  let result;
  try {
    result = await post("/api/agent-reply", {
      company: COMPANY,
      personality: PERSONALITY,
      candidate: CANDIDATE,
      intent: INTENT,
      conversation,
      candidateReply: scenario.reply,
      remainingMessages: REMAINING_MESSAGES,
    });
  } catch (e) {
    console.log(`  ❌ Request failed: ${e.message}`);
    return false;
  }

  if (result.error) {
    console.log(`  ❌ API error: ${result.error}`);
    return false;
  }

  // Print tool trace
  console.log(`  Tool trace (${result.iterations} iteration${result.iterations !== 1 ? "s" : ""}):`);
  const calledTools = new Set();
  for (const call of result.trace ?? []) {
    calledTools.add(call.name);
    console.log(`    → ${call.name}: ${call.summary ?? JSON.stringify(call.args).slice(0, 100)}`);
  }

  if (result.fallback) {
    console.log(`  ⚠️  Fallback triggered: ${result.fallback}`);
  }

  console.log(`\n  Response (${result.response?.length ?? 0} chars):\n  "${result.response?.slice(0, 300)}${result.response?.length > 300 ? "..." : ""}"`);

  if (result.revisedMessages?.length) {
    console.log(`\n  Revised plan (${result.revisedMessages.length} message${result.revisedMessages.length !== 1 ? "s" : ""}):`);
    result.revisedMessages.forEach((m, j) => {
      console.log(`    [${m.channel} ${j + 1}] ${m.body?.slice(0, 150)}...`);
    });
  }

  if (result.flaggedConcern) {
    console.log(`\n  🚩 Flagged concern: ${result.flaggedConcern}`);
  }

  // Assertions
  const { expect: ex } = scenario;
  console.log("\n  Assertions:");
  let allPassed = true;

  allPassed &= check(`Signal is "${ex.signal}"`, result.signal === ex.signal, `got "${result.signal}"`);

  for (const tool of ex.shouldCall) {
    allPassed &= check(`Called ${tool}`, calledTools.has(tool));
  }
  for (const tool of ex.mustNotCall) {
    allPassed &= check(`Did NOT call ${tool}`, !calledTools.has(tool));
  }

  if (ex.noCTA) {
    const cta = /free for|Thursday|Friday|next week|let'?s|call|schedule/i.test(result.response ?? "");
    allPassed &= check("No CTA in closing message", !cta, cta ? "CTA phrase detected" : "clean close");
  } else {
    const cta = /Thursday|Friday|Monday|Tuesday|Wednesday|next week|tomorrow|\d+ min/i.test(result.response ?? "");
    allPassed &= check("Response contains a concrete timeframe", cta, cta ? "found" : "no specific day/time found");
  }

  allPassed &= check("No fallback triggered", !result.fallback, result.fallback ?? "");

  return !!allPassed;
}

async function main() {
  console.log("PSVIEW Agent Reply Test Suite");
  console.log(`Testing /api/agent-reply at ${BASE}`);
  console.log("Company: Mistral AI × Sophie Leclerc (Staff ML Engineer at Meta AI)\n");

  const results = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    const passed = await runScenario(SCENARIOS[i], i);
    results.push(passed);
    if (i < SCENARIOS.length - 1) await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n${"═".repeat(60)}`);
  const passCount = results.filter(Boolean).length;
  console.log(`Results: ${passCount}/${results.length} scenarios passed`);
  results.forEach((p, i) => console.log(`  ${p ? "✅" : "❌"} Scenario ${i + 1}: ${SCENARIOS[i].label}`));

  if (passCount < results.length) {
    console.log("\nFailing scenarios to check:");
    console.log("  - If classify_signal not called: tool calling may not be enabled for this model");
    console.log("  - If close_thread not called on declined: tighten the system prompt in agent-reply/route.ts");
    console.log("  - If CTA appears in declined close: model ignored the close_thread description");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
