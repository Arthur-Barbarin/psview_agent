/**
 * PSVIEW Research Loop Test Harness
 *
 * Tests the agentic research phase in /api/plan:
 *   - Does the agent search when the candidate has a public footprint?
 *   - Does the agent skip when there's nothing useful to find?
 *   - Does the opener actually USE the research findings vs. ignore them?
 *   - Does the agent invent facts beyond what research returned?
 *   - Does /api/research work as a standalone endpoint?
 *
 * Usage:
 *   node test-research.mjs
 *   PSVIEW_URL=https://psview-agent-demo.vercel.app node test-research.mjs
 *
 * Notes:
 *   - These are PUBLIC FIGURES used purely to test the search-and-cite path.
 *     Replace with your own examples in real use.
 *   - Each scenario hits configure + plan. No conversation loop here.
 */

const BASE = process.env.PSVIEW_URL?.replace(/\/$/, "") || "http://localhost:3000";
const DELAY_MS = Number(process.env.DELAY_MS ?? 1_500);

const MISTRAL = {
  name: "Mistral AI",
  description:
    "European AI lab building frontier open-weight models. Fast-moving, deeply technical, Paris-based.",
  culture: "Radical transparency, high ownership, no bureaucracy. Engineers ship fast.",
  profiles: "Senior ML engineers, research scientists, infra engineers who've scaled distributed systems.",
  tone: "Direct and smart. No corporate speak. Peer-to-peer.",
};

const REGIONAL_RETAIL = {
  name: "Acme Regional Supply",
  description: "Regional B2B office-supply distributor in the US Midwest. Family-owned, 80 employees.",
  culture: "Loyalty, steady, low turnover. Long lunches.",
  profiles: "Sales and marketing professionals with regional experience.",
  tone: "Warm and folksy. No jargon.",
};

const SCENARIOS = [
  {
    id: "high-footprint-must-search",
    label: "HIGH PUBLIC FOOTPRINT — must search & cite",
    company: MISTRAL,
    candidate: {
      name: "Tri Dao",
      role: "Assistant Professor at Princeton, Chief Scientist at Together AI",
      background:
        "Co-author of FlashAttention and Mamba. PhD from Stanford. Major contributor to efficient long-context model architectures.",
    },
    intent: "Recruit for a research scientist role on efficient pre-training architectures",
    enableResearch: true,
    expect: {
      // Research phase
      researchCalled: true,
      researchNotSkipped: true,
      // Opener should reference something verifiable from his public work
      openerMustReferenceOneOf: [
        /FlashAttention/i, /Mamba/i, /Together/i, /Princeton/i, /Stanford/i,
        /efficient/i, /long.context/i, /attention/i,
      ],
      // Common hallucination patterns we'd want to catch (specific funding figures, etc.)
      openerMustNotMatch: [
        /\$\d{2,3}M\b|\$\d{2,3} million\b/i,
        /\b\d{4,}\s*(?:GPUs?|H100s?|A100s?)\b/i,
      ],
      // Plan should still produce valid output
      planValid: true,
    },
  },
  {
    id: "low-footprint-should-skip",
    label: "LOW PUBLIC FOOTPRINT — should skip or return little",
    company: REGIONAL_RETAIL,
    candidate: {
      name: "Beth Hennessy",
      role: "Outside Sales Rep at a small office-supply distributor in Ohio",
      background:
        "12 years in regional B2B sales. Manages 60 accounts in northeast Ohio. No public posts, no conferences.",
    },
    intent: "Recruit for a senior outside sales role",
    enableResearch: true,
    expect: {
      // Either skipped explicitly OR searched but returned essentially nothing useful
      acceptableEither: {
        skippedOrEmpty: true,
      },
      // Critical: must not fabricate sources or quotes about her
      openerMustNotMatch: [
        /featured in|interviewed by|spoke at|wrote about|published/i,
      ],
      planValid: true,
    },
  },
  {
    id: "research-disabled-control",
    label: "CONTROL — research disabled, plan must still work",
    company: MISTRAL,
    candidate: {
      name: "Sophie Leclerc",
      role: "Staff ML Engineer at Meta AI",
      background: "5 years on LLaMA pre-training, NeurIPS publications.",
    },
    intent: "Recruit for a senior ML engineer role",
    enableResearch: false,
    expect: {
      researchAbsent: true,
      planValid: true,
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
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch { throw new Error(`Non-JSON from ${path}: ${txt.slice(0, 200)}`); }
}

function check(label, ok, detail = "") {
  const mark = ok ? c.green("✅") : c.red("❌");
  console.log(`     ${mark} ${label}${detail ? c.gray(" — " + detail) : ""}`);
  return ok;
}

// ─── Direct Tavily endpoint smoke test ───────────────────────────────────

async function smokeTestResearchEndpoint() {
  console.log(c.bold(`\n[smoke] /api/research direct call…`));
  const r = await post("/api/research", { query: "FlashAttention paper Tri Dao" });
  if (r.disabled) {
    console.log(`  ${c.yellow("⚠")} TAVILY_API_KEY not set on this deployment. Research will silently no-op.`);
    return false;
  }
  if (r.error) {
    console.log(`  ${c.red("❌")} ${r.error}`);
    return false;
  }
  console.log(`  ${c.green("✅")} ${r.results?.length ?? 0} results, answer ${r.answer ? "present" : "missing"}`);
  if (r.results?.[0]) console.log(`     ${c.gray("top result:")} ${r.results[0].title}`);
  return true;
}

// ─── Scenario runner ──────────────────────────────────────────────────────

async function runScenario(s) {
  console.log("\n" + c.bold("─".repeat(72)));
  console.log(c.bold(`SCENARIO: ${s.label}`));
  console.log(c.bold("─".repeat(72)));

  const config = await post("/api/configure", { company: s.company });
  if (config?.error) throw new Error(`configure error: ${config.error}`);
  if (!config?.personality?.name) throw new Error("no personality returned");

  const t0 = Date.now();
  const plan = await post("/api/plan", {
    company: s.company,
    personality: config.personality,
    candidate: s.candidate,
    intent: s.intent,
    enableResearch: s.enableResearch,
  });
  const ms = Date.now() - t0;

  if (plan?.error) throw new Error(`plan error: ${plan.error}`);

  // ─── Render research trace ────────────────────────────────────────────
  console.log(`\n  ${c.gray("Candidate:")} ${s.candidate.name} — ${s.candidate.role}`);
  console.log(`  ${c.gray("Research enabled:")} ${s.enableResearch ? "yes" : "no"} ${c.gray(`(${ms}ms total)`)}`);

  if (plan.research?.length) {
    console.log(`\n  ${c.gray("Research trace")} (${plan.research.length} call${plan.research.length > 1 ? "s" : ""}):`);
    for (const r of plan.research) {
      if (r.skipped) {
        console.log(`    → ${c.yellow("no_research_needed")}: ${c.gray(r.reasoning)}`);
      } else {
        console.log(`    → ${c.bold("research_candidate")} "${r.query}"`);
        if (r.reasoning) console.log(`        ${c.gray(r.reasoning)}`);
        if (r.answer) console.log(`        ${c.gray("answer:")} ${r.answer.slice(0, 220)}${r.answer.length > 220 ? "…" : ""}`);
        for (const x of (r.results ?? []).slice(0, 3)) {
          console.log(`        ${c.gray("·")} ${x.title}`);
        }
        if (!r.answer && !r.results?.length) console.log(`        ${c.yellow("(no useful results)")}`);
      }
    }
  } else if (s.enableResearch) {
    console.log(`\n  ${c.yellow("(no research trace returned — phase may have failed silently)")}`);
  } else {
    console.log(`\n  ${c.gray("(research not enabled)")}`);
  }

  const opener = plan.messages?.[0]?.body ?? "";
  console.log(`\n  ${c.gray("Opener (first message, " + opener.length + " chars):")}`);
  console.log(`  "${opener.slice(0, 320)}${opener.length > 320 ? "…" : ""}"`);

  // ─── Assertions ──────────────────────────────────────────────────────
  console.log(`\n  ${c.gray("Assertions:")}`);
  let passed = true;
  const e = s.expect;

  if (e.planValid) {
    const ok = !!plan.messages?.length && !!plan.strategy;
    passed &= check("Plan has messages + strategy", ok);
  }

  if (e.researchCalled) {
    const did = (plan.research ?? []).some((r) => !r.skipped);
    passed &= check("Research was actually called (not skipped)", did);
  }
  if (e.researchNotSkipped) {
    const skippedOnly = (plan.research ?? []).every((r) => r.skipped);
    passed &= check("Research did not exit early via no_research_needed", !skippedOnly);
  }
  if (e.researchAbsent) {
    passed &= check("No research trace returned", !plan.research || plan.research.length === 0);
  }
  if (e.acceptableEither?.skippedOrEmpty) {
    const trace = plan.research ?? [];
    const skipped = trace.some((r) => r.skipped);
    const allEmpty = trace.length > 0 && trace.every((r) => r.skipped || (!r.answer && (r.results?.length ?? 0) === 0));
    passed &= check("Skipped OR found nothing useful", skipped || allEmpty || trace.length === 0,
      skipped ? "no_research_needed fired" : allEmpty ? "all results empty" : "trace empty");
  }
  if (e.openerMustReferenceOneOf) {
    const found = e.openerMustReferenceOneOf.find((re) => re.test(opener));
    passed &= check(
      `Opener references one of ${e.openerMustReferenceOneOf.length} expected terms`,
      !!found,
      found ? `matched ${found}` : "no expected term found"
    );
  }
  for (const re of e.openerMustNotMatch ?? []) {
    const m = opener.match(re);
    passed &= check(`Opener does NOT match ${re}`, !m, m ? `found: "${m[0]}"` : "");
  }

  return { id: s.id, label: s.label, passed: !!passed, ms };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold(`\nPSVIEW Research Loop Tests — ${BASE}\n`));
  const tavilyOk = await smokeTestResearchEndpoint();
  if (!tavilyOk) {
    console.log(c.yellow("\nProceeding with scenario tests anyway — research scenarios may fail.\n"));
  }

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
  console.log(c.bold(`Results: ${pass}/${results.length} scenarios passed`));
  console.log(c.bold("═".repeat(72)));
  for (const r of results) {
    const mark = r.passed ? c.green("✅") : c.red("❌");
    console.log(`  ${mark} ${r.label}${r.ms ? c.gray(` (${r.ms}ms)`) : ""}`);
  }
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(c.red("\nFATAL: " + e.message));
  process.exit(2);
});
