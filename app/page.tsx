"use client";
import { useEffect, useState } from "react";
import { AgentConfig, Candidate, Company, CritiqueResult, Plan } from "./types";
import CompanyForm from "./components/CompanyForm";
import AgentConfigView from "./components/AgentConfigView";
import ConversationSim from "./components/ConversationSim";
import StepIndicator from "./components/StepIndicator";
import { usePersistedState } from "./hooks/usePersistedState";

type Step = 1 | 2 | 3;

export default function Home() {
  const [step, setStep] = usePersistedState<Step>("psv_step", 1);
  const [company, setCompany] = usePersistedState<Company | null>("psv_company", null);
  const [agentConfig, setAgentConfig] = usePersistedState<AgentConfig | null>("psv_config", null);
  const [candidate, setCandidate] = usePersistedState<Candidate | null>("psv_candidate", null);
  const [intent, setIntent] = usePersistedState<string>("psv_intent", "");
  const [plan, setPlan] = usePersistedState<Plan | null>("psv_plan", null);
  const [critique, setCritique] = usePersistedState<CritiqueResult | null>("psv_critique", null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    if (step > 1) setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => setRestored(false), 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCompanySubmit = async (co: Company) => {
    setLoading(true);
    setApiError(null);
    setCompany(co);
    // Reset downstream state when re-configuring for a new company
    setCandidate(null);
    setIntent("");
    setPlan(null);
    setCritique(null);
    try {
      const res = await fetch("/api/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: co }),
      });
      const config = await res.json();
      if (config.error) throw new Error(config.error);
      setAgentConfig(config as AgentConfig);
      setStep(2);
    } catch {
      setApiError("Failed to configure agent. Check your API key or try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlan = (cand: Candidate, intentStr: string, p: Plan, c: CritiqueResult) => {
    setCandidate(cand);
    setIntent(intentStr);
    setPlan(p);
    setCritique(c);
    setStep(3);
  };

  const handleReset = () => {
    setStep(1);
    setCompany(null);
    setAgentConfig(null);
    setCandidate(null);
    setIntent("");
    setPlan(null);
    setCritique(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
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

      <main className="max-w-2xl mx-auto px-6 py-10 pb-16">
        {restored && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="text-green-600">↺</span>
            <p className="text-sm text-green-700 font-medium">Session restored — your previous context is still here.</p>
          </div>
        )}

        {apiError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-700 font-medium">{apiError}</p>
          </div>
        )}

        {loading && (
          <div className="mb-6 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-violet-700 font-medium">Agent is reading your context and configuring itself…</p>
          </div>
        )}

        {/* Defer step rendering until mounted — avoids localStorage hydration mismatch */}
        {!mounted ? null : step === 1 ? (
          <CompanyForm onSubmit={handleCompanySubmit} />
        ) : step === 2 && agentConfig && company ? (
          <AgentConfigView config={agentConfig} company={company} onPlan={handlePlan} />
        ) : step === 3 && plan && agentConfig && company && candidate ? (
          <ConversationSim
            plan={plan}
            setPlan={setPlan}
            critique={critique}
            setCritique={setCritique}
            config={agentConfig}
            company={company}
            candidate={candidate}
            intent={intent}
          />
        ) : null}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-2.5">
        <p className="text-center text-xs text-gray-400">
          Built for the PSVIEW founding engineer test by Arthur Barbarin.
          {mounted && step > 1 && (
            <button onClick={handleReset} className="ml-3 text-violet-500 hover:text-violet-700 font-medium">
              Start over
            </button>
          )}
        </p>
      </footer>
    </div>
  );
}
