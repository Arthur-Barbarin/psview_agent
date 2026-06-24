/**
 * PSVIEW Configure Test Suite
 * Tests /api/configure — personality derivation from company context.
 *
 * What it checks:
 *   1. Schema completeness — all required fields present and non-empty
 *   2. Company specificity — personality reflects the actual company, not generic defaults
 *   3. Differentiation — two very different companies produce meaningfully different personalities
 *   4. Avoids quality — avoids list items are concrete, not vague filler
 *
 * Run: node test-configure.mjs  (dev server must be on :3000)
 */

const BASE = "http://localhost:3000";

// ── Two deliberately contrasting companies ────────────────────────────────────

const COMPANIES = [
  {
    label: "Deep-tech startup",
    company: {
      name: "Mistral AI",
      description: "European AI lab building frontier open-weight models. Fast-moving, deeply technical.",
      culture: "Radical transparency, high ownership, no bureaucracy. Engineers ship fast and own outcomes.",
      profiles: "Senior ML engineers, research scientists, infra engineers who've scaled distributed systems.",
      tone: "Direct and smart. Peer-to-peer. No corporate speak.",
    },
    checks: {
      shouldNotMention: ["passionate", "synergy", "leverage", "excited to connect"],
    },
  },
  {
    label: "Traditional consulting firm",
    company: {
      name: "McKinsey & Company",
      description: "Global management consulting firm advising CEOs and governments on strategy, operations, and transformation.",
      culture: "Rigorous analytical thinking, client obsession, structured problem-solving. High standards for written and verbal communication.",
      profiles: "MBA graduates, former BCG/Bain consultants, ex-operators from Fortune 500. Strong business acumen required.",
      tone: "Professional and polished. Substantive, not flashy.",
    },
    checks: {
      shouldNotMention: ["ship fast", "hack", "move fast", "no bureaucracy"],
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

function allText(personality) {
  return [
    personality.name ?? "",
    ...(personality.voicePrinciples ?? []),
    ...(personality.valueSignals ?? []),
    ...(personality.avoids ?? []),
    personality.openingStyle ?? "",
    personality.closingStyle ?? "",
  ].join(" ").toLowerCase();
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runCase(tc, i) {
  console.log(`\n${"─".repeat(65)}`);
  console.log(`CASE ${i + 1}: ${tc.label} — ${tc.company.name}`);
  console.log(`${"─".repeat(65)}`);

  let data;
  try {
    data = await post("/api/configure", { company: tc.company });
  } catch (e) {
    console.log(`  ❌ Request failed: ${e.message}`);
    return { passed: false, personality: null };
  }

  if (data.error) {
    console.log(`  ❌ API error: ${data.error}`);
    return { passed: false, personality: null };
  }

  const { personality, reasoning } = data;
  if (!personality) {
    console.log(`  ❌ Response missing "personality" field`);
    return { passed: false, personality: null };
  }

  // Print summary
  console.log(`\n  Personality: ${personality.name ?? "(no name)"}`);
  console.log(`  Voice principles (${(personality.voicePrinciples ?? []).length}):`);
  (personality.voicePrinciples ?? []).forEach((p) => console.log(`    → ${p}`));
  console.log(`  Values: ${(personality.valueSignals ?? []).join(", ")}`);
  console.log(`  Avoids:`);
  (personality.avoids ?? []).forEach((a) => console.log(`    ✕ ${a}`));
  console.log(`  Opening style: ${personality.openingStyle ?? "(missing)"}`);
  console.log(`  Closing style: ${personality.closingStyle ?? "(missing)"}`);
  if (reasoning) console.log(`\n  Reasoning: ${reasoning.slice(0, 200)}…`);

  // ── Assertions ─────────────────────────────────────────────────────────────
  console.log(`\n  Assertions:`);
  const results = [];

  // Schema completeness
  results.push(check("Has personality.name", !!personality.name?.trim()));
  results.push(check(
    "voicePrinciples has ≥ 3 items",
    (personality.voicePrinciples ?? []).length >= 3,
    `got ${(personality.voicePrinciples ?? []).length}`
  ));
  results.push(check(
    "valueSignals has ≥ 2 items",
    (personality.valueSignals ?? []).length >= 2,
    `got ${(personality.valueSignals ?? []).length}`
  ));
  results.push(check(
    "avoids has ≥ 2 items",
    (personality.avoids ?? []).length >= 2,
    `got ${(personality.avoids ?? []).length}`
  ));
  results.push(check("openingStyle is non-empty", !!personality.openingStyle?.trim()));
  results.push(check("closingStyle is non-empty", !!personality.closingStyle?.trim()));

  // Avoids items are specific, not single vague words
  const vagueAvoids = (personality.avoids ?? []).filter((a) => a.split(" ").length < 3);
  results.push(check(
    "Avoids items are specific phrases (≥ 3 words each)",
    vagueAvoids.length === 0,
    vagueAvoids.length > 0 ? `vague: ${vagueAvoids.join("; ")}` : ""
  ));

  // Company-specificity — personality name includes company name or agent name
  const nameIncludesCompany = (personality.name ?? "")
    .toLowerCase()
    .includes(tc.company.name.split(" ")[0].toLowerCase());
  results.push(check(
    `Personality name references company ("${tc.company.name.split(" ")[0]}")`,
    nameIncludesCompany,
    nameIncludesCompany ? "" : `got "${personality.name}"`
  ));

  // Negative checks — reliable because exact phrases are either present or not.
  const text = allText(personality);
  for (const phrase of (tc.checks.shouldNotMention ?? [])) {
    const found = text.includes(phrase.toLowerCase());
    results.push(check(`Does NOT contain "${phrase}"`, !found, found ? "generic phrase detected" : ""));
  }

  const passed = results.every(Boolean);
  console.log(`\n  ${passed ? "✅ CASE PASSED" : "❌ CASE FAILED"}`);
  return { passed, personality };
}

async function main() {
  console.log("PSVIEW Configure Test Suite");
  console.log(`Testing /api/configure at ${BASE}`);
  console.log("\nWhat this tests:");
  console.log("  1. Schema — all required fields present, non-empty, avoids are full phrases");
  console.log("  2. Naming — personality name references the company");
  console.log("  3. No generic clichés — banned phrases don't appear");
  console.log("  4. Differentiation — two very different companies produce meaningfully different personalities\n");

  const results = [];
  for (let i = 0; i < COMPANIES.length; i++) {
    const r = await runCase(COMPANIES[i], i);
    results.push(r);
    if (i < COMPANIES.length - 1) await new Promise((r) => setTimeout(r, 800));
  }

  // Cross-case: are the two personalities actually different?
  console.log(`\n${"─".repeat(65)}`);
  console.log("DIFFERENTIATION CHECK — comparing the two personalities");
  console.log(`${"─".repeat(65)}`);
  const [r1, r2] = results;
  if (r1.personality && r2.personality) {
    const name1 = (r1.personality.name ?? "").toLowerCase();
    const name2 = (r2.personality.name ?? "").toLowerCase();
    const namesAreDifferent = name1 !== name2;

    const avoids1 = new Set((r1.personality.avoids ?? []).map((a) => a.toLowerCase()));
    const avoids2 = new Set((r2.personality.avoids ?? []).map((a) => a.toLowerCase()));
    const sharedAvoids = [...avoids1].filter((a) => avoids2.has(a));
    const avoidsDiffer = sharedAvoids.length < Math.min(avoids1.size, avoids2.size);

    console.log(`  Personality 1: ${r1.personality.name}`);
    console.log(`  Personality 2: ${r2.personality.name}`);
    if (sharedAvoids.length > 0) console.log(`  Shared avoids: ${sharedAvoids.join("; ")}`);

    console.log("\n  Assertions:");
    check("Personality names are different", namesAreDifferent);
    check(
      "Avoids lists differ (not identical boilerplate)",
      avoidsDiffer,
      avoidsDiffer ? "" : "both personalities avoid exactly the same things — likely generic output"
    );
  } else {
    console.log("  ⚠️  Skipped — one or both configure calls failed");
  }

  // Summary
  console.log(`\n${"═".repeat(65)}`);
  const passed = results.filter((r) => r.passed).length;
  console.log(`Results: ${passed}/${results.length} cases passed`);
  results.forEach((r, i) =>
    console.log(`  ${r.passed ? "✅" : "❌"} Case ${i + 1}: ${COMPANIES[i].label}`)
  );

  if (passed < results.length) {
    console.log("\nDebug hints:");
    console.log("  - Missing fields: check JSON schema in /api/configure/route.ts");
    console.log("  - Vague avoids: tighten the configure prompt to ask for full phrases");
    console.log("  - Generic output: add 'must be specific to this company, not generic' to the prompt");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
