/**
 * PSVIEW Agent Test Suite
 * Run from the psview-app root: node test-agent.mjs
 * Make sure your dev server is running: npm run dev
 */

const BASE = "http://localhost:3000";

const TESTS = [
  {
    label: "Mistral AI × Senior ML Engineer (interested reply)",
    company: {
      name: "Mistral AI",
      description: "European AI lab building frontier open-weight models. Fast-moving, deeply technical, Paris-based.",
      culture: "Radical transparency, high ownership, no bureaucracy. Engineers ship fast and have real impact.",
      profiles: "Senior ML engineers, research scientists, infra engineers who've scaled distributed systems.",
      tone: "Direct and smart. No corporate speak. Peer-to-peer.",
    },
    candidate: { name: "Sophie Leclerc", role: "Staff ML Engineer at Meta AI", background: "5 years on LLaMA pre-training team, published at NeurIPS, open-source contributor." },
    intent: "Recruit for a senior ML engineer role focused on model pre-training at scale",
    simulatedReply: "Interesting. I've been thinking about making a move but haven't pulled the trigger. What does the pre-training team look like?",
  },
  {
    label: "McKinsey × MBA Consultant (hesitant reply)",
    company: {
      name: "McKinsey & Company",
      description: "Global management consulting firm. Works with CEOs and governments on strategy, operations, and transformation.",
      culture: "High performance, intellectual rigor, global mobility. Meritocratic. Strong alumni network.",
      profiles: "Top MBA graduates, former operators, people from elite universities with 2-5 years experience.",
      tone: "Professional but warm. Prestigious without being arrogant. Thoughtful.",
    },
    candidate: { name: "James Okafor", role: "Strategy Manager at Spotify", background: "HBS MBA, 3 years BCG before Spotify, led market entry into West Africa." },
    intent: "Recruit for an Associate Principal role in the TMT practice",
    simulatedReply: "I've seen McKinsey reach out before. What makes this different from when I left consulting two years ago?",
  },
  {
    label: "Doctolib × Product Manager (declined reply)",
    company: {
      name: "Doctolib",
      description: "European health tech leader. Online booking and software for doctors and hospitals. 70M+ patients, 300k+ practitioners.",
      culture: "Mission-driven, patient first, move fast with care. Strong French startup DNA. Impact is the metric.",
      profiles: "PMs with healthcare or consumer background, data-driven, strong empathy for end users.",
      tone: "Warm and purposeful. Mission comes first. Optimistic but grounded.",
    },
    candidate: { name: "Amara Diallo", role: "Senior PM at Revolut", background: "Led payments product for 3M users, previously health startup founder (exited), based in London." },
    intent: "Recruit for a Senior PM role on patient experience, leading a team of 4",
    simulatedReply: "Thanks for reaching out. I'm not actively looking and pretty happy where I am honestly.",
  },
];

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function runTest(test, i) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`TEST ${i + 1}: ${test.label}`);
  console.log("═".repeat(60));

  // Step 1: Configure
  console.log("\n[1/4] Configuring agent personality...");
  const config = await post("/api/configure", { company: test.company });
  console.log(`  → Agent name: ${config.personality?.name}`);
  console.log(`  → Voice principles: ${config.personality?.voicePrinciples?.join(" | ")}`);
  console.log(`  → Avoids: ${config.personality?.avoids?.join(" | ")}`);
  console.log(`  → Reasoning: ${config.reasoning?.slice(0, 200)}...`);

  // Step 2: Plan
  console.log("\n[2/4] Planning outreach sequence...");
  const plan = await post("/api/plan", {
    company: test.company,
    personality: config.personality,
    candidate: test.candidate,
    intent: test.intent,
  });
  console.log(`  → Strategy arc: ${plan.strategy?.arc}`);
  console.log(`  → Angle: ${plan.strategy?.angle}`);
  console.log(`  → ${plan.messages?.length} messages planned`);
  plan.messages?.forEach((m, i) => {
    console.log(`\n  MESSAGE ${i + 1} [${m.channel}] — ${m.intent}`);
    console.log(`  ${m.body?.slice(0, 300)}...`);
  });

  // Step 3: Reply
  console.log(`\n[3/4] Simulating candidate reply: "${test.simulatedReply}"`);
  const conversation = [
    { role: "agent", content: plan.messages[0].body },
    { role: "candidate", content: test.simulatedReply },
  ];
  const reply = await post("/api/reply", {
    company: test.company,
    personality: config.personality,
    candidate: test.candidate,
    intent: test.intent,
    conversation,
    candidateReply: test.simulatedReply,
  });
  console.log(`  → Signal detected: ${reply.signal}`);
  console.log(`  → Reasoning: ${reply.reasoning?.slice(0, 200)}...`);
  console.log(`  → Agent response:\n  "${reply.response?.slice(0, 400)}..."`);

  // Step 4: Adapt
  console.log("\n[4/4] Adapting remaining messages...");
  const remaining = plan.messages.slice(1);
  const adapted = await post("/api/adapt", {
    company: test.company,
    personality: config.personality,
    candidate: test.candidate,
    intent: test.intent,
    conversation: [...conversation, { role: "agent", content: reply.response }],
    signal: reply.signal,
    remainingMessages: remaining,
  });
  console.log(`  → Plan revised: ${adapted.revised}`);
  console.log(`  → Reasoning: ${adapted.reasoning?.slice(0, 200)}...`);
  if (adapted.revised) {
    adapted.messages?.forEach((m, i) => {
      console.log(`\n  REVISED MESSAGE ${i + 1} [${m.channel}]:`);
      console.log(`  ${m.body?.slice(0, 250)}...`);
    });
  }
}

async function main() {
  console.log("PSVIEW Agent Test Suite");
  console.log(`Running ${TESTS.length} tests against ${BASE}\n`);

  for (let i = 0; i < TESTS.length; i++) {
    try {
      await runTest(TESTS[i], i);
    } catch (e) {
      console.error(`\nTEST ${i + 1} FAILED:`, e.message);
    }
    if (i < TESTS.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("All tests complete.");
}

main();
