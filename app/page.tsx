"use client";
import { useState } from "react";
import { AgentConfig, Candidate, Company, Plan } from "./types";
import CompanyForm from "./components/CompanyForm";
import AgentConfigView from "./components/AgentConfigView";
import ConversationSim from "./components/ConversationSim";
import StepIndicator from "./components/StepIndicator";

type Step = 1 | 2 | 3;

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [company, setCompany] = useState<Company | null>(null);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [intent, setIntent] = useState<string>("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompanySubmit = async (co: Company) => {
    setLoading(true);
    setCompany(co);
    try {
      const res = await fetch("/api/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: co }),
      });
      const config: AgentConfig = await res.json();
      setAgentConfig(config);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handlePlan = (cand: Candidate, intentStr: string, p: Plan) => {
    setCandidate(cand);
    setIntent(intentStr);
    setPlan(p);
    setStep(3);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">PSVIEW</span>
            <span className="text-gray-300 text-sm mx-1">·</span>
            <span className="text-gray-400 text-sm">Recruiting Agent</span>
          </div>
          <StepIndicator current={step} />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-6 py-10">
        {loading && (
          <div className="mb-6 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-violet-700 font-medium">Agent is reading your context and configuring itself…</p>
          </div>
        )}

        {step === 1 && <CompanyForm onSubmit={handleCompanySubmit} />}
        {step === 2 && agentConfig && company && (
          <AgentConfigView config={agentConfig} company={company} onPlan={handlePlan} />
        )}
        {step === 3 && plan && agentConfig && company && candidate && (
          <ConversationSim
            plan={plan}
            config={agentConfig}
            company={company}
            candidate={candidate}
            intent={intent}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-2.5">
        <p className="text-center text-xs text-gray-400">
          No messages are sent. This is a simulation environment.
          {step > 1 && (
            <button
              onClick={() => { setStep(1); setAgentConfig(null); setPlan(null); }}
              className="ml-3 text-violet-500 hover:text-violet-700 font-medium"
            >
              Start over
            </button>
          )}
        </p>
      </footer>
    </div>
  );
}
