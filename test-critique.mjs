/**
 * PSVIEW Critique Test Suite
 * Tests /api/critique — the self-verification pass that enforces personality rules on plan messages.
 *
 * What it checks:
 *   1. Catches violations — feed messages that break the avoids list, expect them flagged and rewritten
 *   2. Passes clean messages — clean messages should come back unchanged and with passed: true
 *   3. Rewrite quality — fixed messages should not contain the original violation
 *   4. Schema — response always has the right shape (passed, violations, messages array same length)
 *
 * Run: node test-critique.mjs  (dev server must be on :3000)
 */

const BASE = "http://localhost:3000";

// ── Shared personality — defines the rules the critique must enforce ──────────
const PERSONALITY = {
  name: "Alex from Stripe",
  voicePrinciples: [
    "Lead with a technical hook — reference something specific about the candidate's work",
    "Be direct and peer-level — no corporate tone, no warm-up sentences",
    "Every CTA must name a specific day or time window — never vague",
    "Never start a follow-up message by referencing the previous message",
  ],
  valueSignals: ["Technical depth", "Ownership", "Speed"],
  avoids: [
    "Phrases like 'I hope this finds you well' or 'I hope you're doing well'",
    "Vague CTAs like 'let's connect sometime' or 'feel free to reach out'",
    "Openers that reference the previous message: 'I wanted to follow up', 'following up on my previous'",
    "Flattery or hype: 'amazing work', 'incredible background', 'love what you're doing'",
  ],
  openingStyle: "Open on a specific technical observation or a concrete data point about their work",
  closingStyle: "End with a specific day or time window (e.g. 'Thursday afternoon?')",
};

// ── Test cases ─────────────────────────────────────────────────────────────────

const CASES = [
  {
    label: "VIOLATIONS — messages break multiple avoids rules",
    description: "Message 1 has a forbidden opener + flattery. Message 2 references previous message. Both should be flagged and rewritten.",
    messages: [
      {
        step: 1,
        channel: "LinkedIn",
        subject: null,
        body: "I hope this finds you well! I've been following your amazing work on distributed systems and I think you'd be an incredible fit at Stripe. Would love to connect whenever you have time.",
        intent: "Cold opener",
      },
      {
        step: 2,
        channel: "Email",
        subject: "Following up",
        body: "I wanted to follow up on my previous message. I hope you've had a chance to look it over. I'd love to chat whenever works for you — feel free to reach out!",
        intent: "Follow-up",
      },
    ],
    assertions: {
      passed: false,
      minViolations: 2,        // At least 2 messages should be flagged
      // These exact phrases must NOT appear in the rewritten messages
      rewriteMustNotContain: [
        "I hope this finds you well",
        "amazing work",
        "incredible",
        "whenever you have time",
        "I wanted to follow up on my previous",
        "I hope you've had a chance",
        "feel free to reach out",
        "whenever works for you",
      ],
    },
  },
  {
    label: "CLEAN — messages follow all rules",
    description: "Both messages comply with the personality. Critique should pass without changes.",
    messages: [
      {
        step: 1,
        channel: "LinkedIn",
        subject: null,
        body: "Your writeup on Raft consensus in distributed payment systems was one of the clearest breakdowns I've read — we've been wrestling with the same consistency guarantees at Stripe. Would Thursday at 3pm work for a 20-minute call?",
        intent: "Cold opener — specific technical hook",
      },
      {
        step: 2,
        channel: "Email",
        subject: "Stripe infra team — one more thing",
        body: "We're rebuilding the payment routing layer this quarter and the team that built it is the same one hiring. Thought it might change the calculus. Free for 30 minutes Wednesday morning?",
        intent: "Follow-up with a new angle",
      },
    ],
    assertions: {
      passed: true,
      maxViolations: 0,
    },
  },
  {
    label: "MIXED — one clean, one violating",
    description: "Message 1 is good. Message 2 uses a vague CTA. Only message 2 should be flagged.",
    messages: [
      {
        step: 1,
        channel: "LinkedIn",
        subject: null,
        body: "Noticed you led the migration of Shopify's checkout flow to an event-driven architecture — we're at a similar inflection point on Stripe's payment orchestration layer. Does Tuesday at 2pm work for a quick call?",
        intent: "Cold opener",
      },
      {
        step: 2,
        channel: "Email",
        subject: "Quick follow-up",
        body: "Wanted to share more context on what we're building. Let's connect sometime — feel free to reach out whenever is convenient for you.",
        intent: "Follow-up",
      },
    ],
    assertions: {
      passed: false,
      // Only message 2 should be flagged
      violationSteps: [2],
      // Message 1 should be unchanged in the output
      message1Unchanged: true,
      rewriteMustNotContain: ["let's connect", "feel free to reach out", "whenever is convenient"],
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function check(label, condition, detail = "") {
  const icon = condition ? "✅" : "❌";
  console.log(`  ${icon} ${label}${detail ? `  (${detail})` : ""}`);
  return !!condition;
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runCase(tc, i) {
  console.log(`\n${"─".repeat(65)}`);
  console.log(`CASE ${i + 1}: ${tc.label}`);
  console.log(`Context: ${tc.description}`);
  console.log(`${"─".repeat(65)}`);

  let result;
  try {
    result = await post("/api/critique", { personality: PERSONALITY, messages: tc.messages });
  } catch (e) {
    console.log(`  ❌ Request failed: ${e.message}`);
    return false;
  }

  if (result.error) {
    console.log(`  ❌ API error: ${result.error}`);
    return false;
  }

  // Print result summary
  console.log(`\n  Result:`);
  console.log(`    passed: ${result.passed}`);
  console.log(`    violations: ${(result.violations ?? []).length}`);
  (result.violations ?? []).forEach((v) =>
    console.log(`      · Step ${v.messageStep}: ${v.rule}${v.originalOpener ? ` — "${v.originalOpener}"` : ""}`)
  );
  console.log(`    Reasoning: ${(result.reasoning ?? "").slice(0, 200)}`);
  if (result.messages) {
    console.log(`\n  Rewritten messages:`);
    result.messages.forEach((m, j) => {
      const preview = (m.body ?? "").slice(0, 120).replace(/\n/g, " ");
      console.log(`    [${j + 1}] ${preview}${m.body?.length > 120 ? "…" : ""}`);
    });
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  console.log(`\n  Assertions:`);
  const results = [];
  const { assertions: ex } = tc;

  // Schema
  results.push(check("Response has 'passed' boolean", typeof result.passed === "boolean"));
  results.push(check("Response has 'violations' array", Array.isArray(result.violations)));
  results.push(check(
    "Output messages count matches input",
    (result.messages ?? []).length === tc.messages.length,
    `input: ${tc.messages.length}, output: ${(result.messages ?? []).length}`
  ));

  // passed flag
  if (ex.passed !== undefined) {
    results.push(check(
      `passed === ${ex.passed}`,
      result.passed === ex.passed,
      result.passed !== ex.passed ? `got ${result.passed}` : ""
    ));
  }

  // Violation count
  const violationCount = (result.violations ?? []).length;
  if (ex.minViolations !== undefined) {
    results.push(check(
      `At least ${ex.minViolations} violation(s) flagged`,
      violationCount >= ex.minViolations,
      `got ${violationCount}`
    ));
  }
  if (ex.maxViolations !== undefined) {
    results.push(check(
      `No more than ${ex.maxViolations} violation(s)`,
      violationCount <= ex.maxViolations,
      violationCount > 0 ? `got ${violationCount}: ${(result.violations ?? []).map((v) => v.rule).join("; ")}` : ""
    ));
  }

  // Specific steps violated
  if (ex.violationSteps) {
    const flaggedSteps = new Set((result.violations ?? []).map((v) => v.messageStep));
    for (const step of ex.violationSteps) {
      results.push(check(`Step ${step} flagged as violation`, flaggedSteps.has(step)));
    }
  }

  // Rewritten messages don't contain banned phrases
  if (ex.rewriteMustNotContain) {
    const allRewrittenText = (result.messages ?? []).map((m) => m.body ?? "").join(" ").toLowerCase();
    for (const phrase of ex.rewriteMustNotContain) {
      const still = allRewrittenText.includes(phrase.toLowerCase());
      results.push(check(
        `Rewrite removed "${phrase}"`,
        !still,
        still ? "violation phrase still present after rewrite" : ""
      ));
    }
  }

  // Message 1 unchanged (for mixed case)
  if (ex.message1Unchanged) {
    const orig = tc.messages[0]?.body?.trim();
    const fixed = (result.messages ?? [])[0]?.body?.trim();
    results.push(check(
      "Message 1 body unchanged (no violation there)",
      orig === fixed,
      orig !== fixed ? "message 1 was modified despite no violation" : ""
    ));
  }

  const passed = results.every(Boolean);
  console.log(`\n  ${passed ? "✅ CASE PASSED" : "❌ CASE FAILED"}`);
  return passed;
}

async function main() {
  console.log("PSVIEW Critique Test Suite");
  console.log(`Testing /api/critique at ${BASE}`);
  console.log("\nWhat this tests:");
  console.log("  1. Violations are caught and flagged correctly");
  console.log("  2. Clean messages pass without modification");
  console.log("  3. Rewritten messages don't still contain the violating phrase");
  console.log("  4. Response schema is always correct (same message count, right types)\n");

  const results = [];
  for (let i = 0; i < CASES.length; i++) {
    const passed = await runCase(CASES[i], i);
    results.push(passed);
    if (i < CASES.length - 1) await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n${"═".repeat(65)}`);
  const passCount = results.filter(Boolean).length;
  console.log(`Results: ${passCount}/${results.length} cases passed`);
  results.forEach((p, i) => console.log(`  ${p ? "✅" : "❌"} Case ${i + 1}: ${CASES[i].label}`));

  if (passCount < results.length) {
    console.log("\nDebug hints:");
    console.log("  - passed: true when violations exist → model not strict enough, tighten critique prompt");
    console.log("  - violation phrases still in rewrite → add 'forbidden to use this phrase at all' to prompt");
    console.log("  - message 1 modified in mixed case → model is being too aggressive, rewriting unnecessarily");
    console.log("  - schema wrong → check JSON response_format in /api/critique/route.ts");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
