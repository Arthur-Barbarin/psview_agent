/**
 * PSVIEW Plan Quality Test Suite
 * Tests /api/plan for two classes of bugs:
 *   1. Fit score calibration — over-generous scoring for stretch candidates
 *   2. Email arc temporal logic — messages 2+ must not reference calls/conversations that haven't happened
 *
 * Uses generic candidate archetypes (not tied to any real person).
 * Run: node test-plan.mjs  (dev server must be on :3000)
 */

const BASE = "http://localhost:3000";

// ─── Shared company context ───────────────────────────────────────────────────
// Generic deep-tech engineering company — chosen to make seniority gaps obvious.
const COMPANY = {
  name: "Luminary Robotics",
  description:
    "Series B startup building autonomous mobile robots for industrial logistics. 80 engineers, shipping hardware+software to warehouse customers.",
  culture:
    "Hands-on engineering culture. Everyone is IC first. Fast iteration, direct feedback. No passengers.",
  profiles:
    "Senior robotics software engineers with 4+ years hands-on C++ and ROS. Motion planning, perception, or systems integration. Direct experience deploying robots, not just advising on them.",
  tone: "Direct, technical, peer-to-peer. No buzzwords.",
};

// Pre-baked personality — skip /api/configure to keep tests fast and deterministic.
const PERSONALITY = {
  name: "Jordan from Luminary",
  voicePrinciples: [
    "Lead with something specific to the candidate's technical work",
    "Be peer-level, not salesy",
    "Reference the real engineering problem we're solving",
    "One concrete ask per message",
  ],
  valueSignals: ["Hands-on engineering", "Ownership", "Speed", "Systems thinking"],
  avoids: [
    "Corporate speak",
    "Flattery or hype",
    "Vague CTAs like 'let's connect'",
    "Following up on previous messages",
  ],
  openingStyle: "Open on a technical observation specific to the candidate's work",
  closingStyle: "Concrete timeframe — a specific day or window, never open-ended",
};

// ─── Assertions ───────────────────────────────────────────────────────────────

// Phrases that imply a prior call/conversation happened — forbidden in cold outreach
const TEMPORAL_PHRASES = [
  "as we discussed",
  "as i mentioned",
  "as discussed",
  "following up on our call",
  "following up on our conversation",
  "per our discussion",
  "since our last conversation",
  "since our call",
  "from our conversation",
  "what we talked about",
  "as you mentioned on our call",
  "i'd like to provide more information on what we talked",
  "as per our",
  "our previous conversation",
];

// Openers that are lazy/generic — forbidden in message 1
const BANNED_OPENERS = [
  "i wanted to reach out",
  "i hope this message finds you",
  "i hope you're doing well",
  "i hope this finds you",
  "i'm reaching out because",
  "i wanted to follow up",
  "just checking in",
  "i hope you've had a chance",
];

function containsPhrase(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.find((p) => lower.includes(p.toLowerCase()));
}

function check(label, condition, detail = "") {
  const icon = condition ? "✅" : "❌";
  console.log(`  ${icon} ${label}${detail ? `  (${detail})` : ""}`);
  return !!condition;
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const CASES = [
  {
    // ── Case 1: Consulting founder applying for senior IC role ─────────────
    // The agent has 4 years *away* from hands-on engineering, now advises clients.
    // Should surface a significant fit gap — consultant ≠ IC engineer.
    label: "STRETCH — Consulting founder for senior IC role",
    description:
      "Founder running a 2-person consultancy for 4 years. Advises on robotics strategy. No direct recent hands-on C++/ROS work.",
    candidate: {
      name: "David Chen",
      role: "Founder & Principal Consultant at Chen Robotics Solutions",
      background:
        "Advises manufacturing firms on automation strategy and vendor selection. Spent 3 years as a robotics software engineer before starting his consultancy 4 years ago. MBA from Wharton. No recent hands-on C++/ROS coding — strategic and client-facing for the last 4 years.",
    },
    intent: "Recruit for Senior Robotics Software Engineer — motion planning, hands-on C++/ROS required",
    enableResearch: false,
    assertions: {
      fitScoreMax: 6,       // Consulting gap + seniority-type gap should pull this down
      shouldReach: false,   // Agent should flag this as a stretch
      minConcerns: 1,       // At least one specific concern raised
    },
  },
  {
    // ── Case 2: Strong direct match ────────────────────────────────────────
    // Senior IC at a peer company, directly relevant domain and seniority.
    // Should score high and proceed without a fit gate.
    label: "STRONG MATCH — Senior IC at peer company, direct domain",
    description:
      "5 years hands-on robotics SW at a well-known robotics company, right seniority, right tech stack.",
    candidate: {
      name: "Maria Santos",
      role: "Senior Robotics Software Engineer at Boston Dynamics",
      background:
        "5 years building motion planning systems in C++ and ROS2. Led integration of the perception stack for Spot across 3 product generations. Co-authored two ICRA papers on trajectory optimization. Direct experience deploying robots in unstructured environments.",
    },
    intent: "Recruit for Senior Robotics Software Engineer — motion planning, C++/ROS2",
    enableResearch: false,
    assertions: {
      fitScoreMin: 7,       // Strong direct match should score 7+
      shouldReach: true,
    },
  },
  {
    // ── Case 3: Adjacent field — relevant but missing key requirements ─────
    // Strong engineer but from automotive autonomy, not robotics specifically.
    // No ROS experience. Score should reflect the gap.
    label: "ADJACENT FIELD — Automotive autonomy, no ROS background",
    description:
      "Senior SWE in automotive autonomy — strong C++ and real-time systems, but no robotics or ROS background.",
    candidate: {
      name: "James Park",
      role: "Senior Software Engineer at Waymo (Perception team)",
      background:
        "4 years on Waymo's object detection pipeline in C++. Strong real-time systems background. Deep computer vision expertise. No ROS or robotics deployment experience — all work has been on automotive AD stacks.",
    },
    intent: "Recruit for Senior Robotics Software Engineer — perception focus, must ramp quickly on ROS2",
    enableResearch: false,
    assertions: {
      fitScoreMin: 4,       // Should not be dismissed outright — skills transfer
      fitScoreMax: 7,       // But gap on ROS/robotics should cap the score
      minConcerns: 1,       // At least one concern about the gap
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function runCase(tc, i) {
  console.log(`\n${"─".repeat(65)}`);
  console.log(`CASE ${i + 1}: ${tc.label}`);
  console.log(`Context: ${tc.description}`);
  console.log(`Candidate: ${tc.candidate.name} — ${tc.candidate.role}`);
  console.log(`${"─".repeat(65)}`);

  let plan;
  try {
    plan = await post("/api/plan", {
      company: COMPANY,
      personality: PERSONALITY,
      candidate: tc.candidate,
      intent: tc.intent,
      enableResearch: tc.enableResearch ?? false,
    });
  } catch (e) {
    console.log(`  ❌ Request failed: ${e.message}`);
    return { passed: false, label: tc.label };
  }

  if (plan.error) {
    console.log(`  ❌ API error: ${plan.error}`);
    return { passed: false, label: tc.label };
  }

  const { fitCheck, messages = [] } = plan;
  const score = fitCheck?.score;
  const shouldReach = fitCheck?.shouldReach;
  const concerns = fitCheck?.concerns ?? [];

  // Print plan summary
  console.log(`\n  Fit check:`);
  console.log(`    Score: ${score ?? "missing"}/10`);
  console.log(`    shouldReach: ${shouldReach}`);
  console.log(`    Reasoning: ${(fitCheck?.reasoning ?? "").slice(0, 200)}`);
  if (concerns.length) {
    console.log(`    Concerns:`);
    concerns.forEach((c) => console.log(`      · ${c}`));
  }

  console.log(`\n  Messages (${messages.length}):`);
  messages.forEach((m, j) => {
    const preview = (m.body ?? "").slice(0, 120).replace(/\n/g, " ");
    console.log(`    [${m.channel ?? "?"} ${j + 1}] ${preview}${m.body?.length > 120 ? "…" : ""}`);
  });

  // ── Assertions ────────────────────────────────────────────────────────────
  console.log(`\n  Assertions:`);
  const results = [];
  const { assertions: ex } = tc;

  // Fit score bounds
  if (ex.fitScoreMax !== undefined) {
    results.push(check(
      `Fit score ≤ ${ex.fitScoreMax} (got ${score})`,
      score !== undefined && score <= ex.fitScoreMax,
      score > ex.fitScoreMax ? `score ${score} is too generous for this profile` : ""
    ));
  }
  if (ex.fitScoreMin !== undefined) {
    results.push(check(
      `Fit score ≥ ${ex.fitScoreMin} (got ${score})`,
      score !== undefined && score >= ex.fitScoreMin,
      score < ex.fitScoreMin ? `score ${score} is too low` : ""
    ));
  }

  // shouldReach
  if (ex.shouldReach !== undefined) {
    results.push(check(
      `shouldReach === ${ex.shouldReach}`,
      shouldReach === ex.shouldReach,
      shouldReach !== ex.shouldReach ? `got ${shouldReach}` : ""
    ));
  }

  // Concerns not empty
  if (ex.minConcerns !== undefined) {
    results.push(check(
      `At least ${ex.minConcerns} concern(s) listed`,
      concerns.length >= ex.minConcerns,
      concerns.length === 0 ? "no concerns listed — gaps not flagged" : `${concerns.length} concern(s)`
    ));
  }

  // Message 1 — no banned openers
  if (messages[0]?.body) {
    const hit = containsPhrase(messages[0].body, BANNED_OPENERS);
    results.push(check(
      "Message 1 has no lazy opener",
      !hit,
      hit ? `banned opener detected: "${hit}"` : ""
    ));
  }

  // Messages 2+ — no temporal phrases implying a prior call
  const followUps = messages.slice(1);
  if (followUps.length > 0) {
    const violations = followUps.flatMap((m, j) => {
      const hit = containsPhrase(m.body ?? "", TEMPORAL_PHRASES);
      return hit ? [`Message ${j + 2}: "${hit}"`] : [];
    });
    results.push(check(
      `Message(s) 2+ contain no "as we discussed" / "our call" phrases`,
      violations.length === 0,
      violations.length > 0 ? violations.join("; ") : ""
    ));
  } else {
    console.log(`  ⚠️  Only 1 message generated — follow-up arc check skipped`);
  }

  const passed = results.every(Boolean);
  console.log(`\n  ${passed ? "✅ CASE PASSED" : "❌ CASE FAILED"}`);
  return { passed, label: tc.label };
}

async function main() {
  console.log("PSVIEW Plan Quality Test Suite");
  console.log(`Testing /api/plan at ${BASE}`);
  console.log("Company: Luminary Robotics (generic — tests archetypes, not specific people)");
  console.log("\nWhat this tests:");
  console.log("  1. Fit score calibration — consulting/advisory founders should score ≤ 6");
  console.log("  2. Temporal arc integrity — follow-up messages must not reference calls that haven't happened");
  console.log("  3. Opener quality — message 1 must not start with a lazy generic opener\n");

  const results = [];
  for (let i = 0; i < CASES.length; i++) {
    const r = await runCase(CASES[i], i);
    results.push(r);
    if (i < CASES.length - 1) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n${"═".repeat(65)}`);
  const passed = results.filter((r) => r.passed).length;
  console.log(`Results: ${passed}/${results.length} cases passed`);
  results.forEach((r, i) =>
    console.log(`  ${r.passed ? "✅" : "❌"} Case ${i + 1}: ${r.label}`)
  );

  if (passed < results.length) {
    console.log("\nDebug hints:");
    console.log("  - Fit score too high: tighten the fitCheck reasoning in /api/plan/route.ts");
    console.log("  - shouldReach wrong: check the score threshold (currently < 5 → false)");
    console.log("  - Temporal phrase in follow-up: the REALISTIC SEQUENCE ARC rule isn't being followed");
    console.log("  - Lazy opener: the BANNED OPENERS rule isn't being respected");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
