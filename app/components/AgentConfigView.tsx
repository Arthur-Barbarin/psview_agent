"use client";
import { useState } from "react";
import { AgentConfig, Candidate, Company, Plan } from "../types";
import ReasoningBox from "./ReasoningBox";

export default function AgentConfigView({
  config,
  company,
  onPlan,
}: {
  config: AgentConfig;
  company: Company;
  onPlan: (candidate: Candidate, intent: string, plan: Plan) => void;
}) {
  const { personality } = config;
  const [candidate, setCandidate] = useState<Candidate>({ name: "", role: "", background: "" });
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof Candidate) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCandidate((c) => ({ ...c, [k]: e.target.value }));

  const ready = Object.values(candidate).every((v) => v.trim()) && intent.trim();

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, personality, candidate, intent }),
      });
      const plan = await res.json();
      onPlan(candidate, intent, plan);
    } finally {
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

      <form onSubmit={handlePlan} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Target candidate</h3>
          <p className="text-xs text-gray-400 mb-3">The agent will tailor the sequence to this person.</p>
          <div className="space-y-3">
            <input
              className="input"
              placeholder="Candidate name"
              value={candidate.name}
              onChange={set("name")}
              required
            />
            <input
              className="input"
              placeholder="Current role (e.g. Staff ML Engineer at Meta)"
              value={candidate.role}
              onChange={set("role")}
              required
            />
            <textarea
              className="input min-h-[70px]"
              placeholder="Brief background — what they've built, where they've worked, anything relevant"
              value={candidate.background}
              onChange={set("background")}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outreach intent</label>
          <p className="text-xs text-gray-400 mb-1.5">What is the agent trying to accomplish?</p>
          <input
            className="input"
            placeholder="e.g. Recruit for a senior ML engineer role focused on inference optimization"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={!ready || loading}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? "Planning sequence…" : "Generate message sequence →"}
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
