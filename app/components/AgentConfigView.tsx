"use client";
import { useState } from "react";
import { AgentConfig, Candidate, Company, CritiqueResult, Plan } from "../types";
import ReasoningBox from "./ReasoningBox";

type PendingPlan = { plan: Plan; critique: CritiqueResult; candidate: Candidate; intent: string };

export default function AgentConfigView({
  config,
  company,
  onPlan,
}: {
  config: AgentConfig;
  company: Company;
  onPlan: (candidate: Candidate, intent: string, plan: Plan, critique: CritiqueResult) => void;
}) {
  const { personality } = config;
  const [candidate, setCandidate] = useState<Candidate>({ name: "", role: "", background: "" });
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [critiqueWarning, setCritiqueWarning] = useState(false);
  const [pending, setPending] = useState<PendingPlan | null>(null);
  const [enableResearch, setEnableResearch] = useState(true);

  const set = (k: keyof Candidate) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCandidate((c) => ({ ...c, [k]: e.target.value }));

  const ready = Object.values(candidate).every((v) => v.trim()) && intent.trim();

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setCritiqueWarning(false);
    setPending(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      // Step 1: Plan
      setLoadingStage(enableResearch ? "Researching candidate, then planning…" : "Planning outreach sequence…");
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, personality, candidate, intent, enableResearch }),
        signal: controller.signal,
      });
      const plan: Plan = await res.json();
      if ((plan as { error?: string }).error) throw new Error((plan as { error?: string }).error);

      // Step 2: Critique — self-verification pass
      setLoadingStage("Agent self-checking messages…");
      let critique: CritiqueResult;
      try {
        const critiqueRes = await fetch("/api/critique", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personality, messages: plan.messages }),
          signal: controller.signal,
        });
        const critiqueData: CritiqueResult & { error?: string } = await critiqueRes.json();

        if (critiqueData.error) {
          // Critique failed — proceed with original, show warning
          setCritiqueWarning(true);
          critique = { passed: true, violations: [], reasoning: "", messages: plan.messages };
        } else if (
          critiqueData.messages &&
          critiqueData.messages.length === plan.messages.length
        ) {
          // Valid response — use fixed messages if violations found
          critique = critiqueData;
        } else {
          // Length mismatch — reordering guard, use original messages
          setCritiqueWarning(true);
          critique = { ...critiqueData, messages: plan.messages };
        }
      } catch {
        setCritiqueWarning(true);
        critique = { passed: true, violations: [], reasoning: "", messages: plan.messages };
      }

      const finalPlan: Plan =
        critique.violations?.length > 0
          ? { ...plan, messages: critique.messages }
          : plan;

      // If fit score < 4, gate on user confirmation
      if (plan.fitCheck && !plan.fitCheck.shouldReach) {
        setPending({ plan: finalPlan, critique, candidate, intent });
      } else {
        onPlan(candidate, intent, finalPlan, critique);
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      setLoadingStage(isAbort ? "Request timed out — please try again." : `Error: ${String(err)}`);
      setTimeout(() => setLoadingStage(""), 4000);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Agent configured</h2>
        <p className="text-sm text-gray-500 mt-0.5">The agent derived its own personality from your context.</p>
      </div>

      <ReasoningBox reasoning={config.reasoning} />

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-sm">
            {personality.name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{personality.name}</p>
            <p className="text-xs text-gray-500">Recruiting agent for {company.name}</p>
          </div>
        </div>

        <Section title="Voice principles">
          <ul className="space-y-1">
            {personality.voicePrinciples.map((p, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-violet-400 mt-0.5">→</span>{p}</li>
            ))}
          </ul>
        </Section>

        <Section title="Values it embodies">
          <div className="flex flex-wrap gap-2">
            {personality.valueSignals.map((v, i) => (
              <span key={i} className="bg-violet-100 text-violet-700 text-xs font-medium px-2.5 py-1 rounded-full">{v}</span>
            ))}
          </div>
        </Section>

        <Section title="Never does">
          <ul className="space-y-1">
            {personality.avoids.map((a, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-red-400 mt-0.5">✕</span>{a}</li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Low fit gate — show before form submission, or after plan if fit is weak */}
      {pending && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 font-bold text-sm">⚠ Agent recommends against reaching out</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
              Fit score: {pending.plan.fitCheck?.score ?? "?"}/10
            </span>
          </div>
          <p className="text-xs text-gray-600">{pending.plan.fitCheck?.reasoning}</p>
          {(pending.plan.fitCheck?.concerns ?? []).length > 0 && (
            <ul className="space-y-0.5">
              {(pending.plan.fitCheck?.concerns ?? []).map((c, i) => (
                <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span>·</span>{c}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setPending(null)}
              className="flex-1 text-xs text-gray-500 hover:text-gray-700 font-medium py-2 border border-gray-200 rounded-lg bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onPlan(pending.candidate, pending.intent, pending.plan, pending.critique); setPending(null); }}
              className="flex-1 text-xs text-amber-700 hover:text-amber-900 font-semibold py-2 border border-amber-300 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors"
            >
              Plan anyway →
            </button>
          </div>
        </div>
      )}

      {critiqueWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          <p className="text-xs text-yellow-700">⚠ Self-check unavailable — messages shown as generated. Groq may have returned an unexpected format.</p>
        </div>
      )}

      <form onSubmit={handlePlan} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Target candidate</h3>
          <p className="text-xs text-gray-400 mb-3">The agent will tailor the sequence to this person.</p>
          <div className="space-y-3">
            <input className="input" placeholder="Candidate name" value={candidate.name} onChange={set("name")} required />
            <input className="input" placeholder="Current role (e.g. Staff ML Engineer at Meta)" value={candidate.role} onChange={set("role")} required />
            <textarea className="input min-h-[70px]" placeholder="Brief background — what they've built, where they've worked, anything relevant" value={candidate.background} onChange={set("background")} required />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outreach intent</label>
          <p className="text-xs text-gray-400 mb-1.5">What is the agent trying to accomplish?</p>
          <input className="input" placeholder="e.g. Recruit for a senior ML engineer role focused on inference optimization" value={intent} onChange={(e) => setIntent(e.target.value)} required />
        </div>

        <label className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${enableResearch ? "border-violet-300 bg-violet-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-violet-600"
            checked={enableResearch}
            onChange={(e) => setEnableResearch(e.target.checked)}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Let the agent research this candidate</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Agent decides whether to search the web for public info (papers, talks, OSS) before writing. Adds 3–6s. Requires <code className="px-1 bg-white border border-gray-200 rounded">TAVILY_API_KEY</code>.
            </p>
          </div>
        </label>

        {loading && (
          <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3">
            <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-violet-700 font-medium">{loadingStage}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!ready || loading || !!pending}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? "Working…" : "Generate message sequence →"}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}
