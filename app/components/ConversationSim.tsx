"use client";
import { useRef, useState } from "react";
import { AgentConfig, AgentReplyResult, Candidate, Company, ConversationMessage, CritiqueResult, Message, Plan, Signal, ToolCall } from "../types";
import ReasoningBox from "./ReasoningBox";

const SIGNAL_COLOR: Record<Signal, string> = {
  interested: "bg-green-100 text-green-700",
  neutral: "bg-gray-100 text-gray-600",
  hesitant: "bg-yellow-100 text-yellow-700",
  declined: "bg-red-100 text-red-700",
};

const SIGNAL_LABEL: Record<Signal, string> = {
  interested: "🟢 Interested",
  neutral: "⚪ Neutral",
  hesitant: "🟡 Hesitant",
  declined: "🔴 Declined",
};

const TOOL_LABEL: Record<ToolCall["name"], string> = {
  classify_signal: "Classify signal",
  compose_response: "Compose response",
  revise_remaining_plan: "Revise remaining plan",
  close_thread: "Close thread",
  flag_concern: "Flag concern",
};

const TOOL_ICON: Record<ToolCall["name"], string> = {
  classify_signal: "🔍",
  compose_response: "✍️",
  revise_remaining_plan: "♻️",
  close_thread: "🚪",
  flag_concern: "🚩",
};

export default function ConversationSim({
  plan,
  setPlan,
  critique,
  setCritique,
  config,
  company,
  candidate,
  intent,
}: {
  plan: Plan;
  setPlan: (p: Plan) => void;
  critique: CritiqueResult | null;
  setCritique: (c: CritiqueResult | null) => void;
  config: AgentConfig;
  company: Company;
  candidate: Candidate;
  intent: string;
}) {
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [reply, setReply] = useState("");
  const [lastResult, setLastResult] = useState<AgentReplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [planRevised, setPlanRevised] = useState(false);
  const [threadClosed, setThreadClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replyRef = useRef<HTMLDivElement>(null);

  const sendReply = async () => {
    if (!reply.trim() || activeMessageIndex === null) return;
    setLoading(true);
    setError(null);
    const currentMsg = plan.messages[activeMessageIndex];

    const newConv: ConversationMessage[] = [
      ...conversation,
      { role: "agent", content: currentMsg.body },
      { role: "candidate", content: reply },
    ];

    const remainingMessages = plan.messages.slice(activeMessageIndex + 1);

    try {
      const res = await fetch("/api/agent-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          personality: config.personality,
          candidate,
          intent,
          conversation: newConv,
          candidateReply: reply,
          remainingMessages,
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const agentResult = result as AgentReplyResult;
      setLastResult(agentResult);

      const updatedConv: ConversationMessage[] = [
        ...newConv,
        { role: "agent", content: agentResult.response },
      ];
      setConversation(updatedConv);
      setReply("");

      if (agentResult.revisedMessages && agentResult.revisedMessages.length > 0) {
        const newMessages: Message[] = [
          ...plan.messages.slice(0, activeMessageIndex + 1),
          ...agentResult.revisedMessages,
        ];
        setPlan({ ...plan, messages: newMessages });
        setPlanRevised(true);
        // The critique was for the previous plan; clear it so we don't claim
        // self-check passed on messages that were just rewritten.
        setCritique(null);
      }

      if (agentResult.closed) setThreadClosed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent request failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Conversation simulator</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          No real messages sent. The agent picks its own tools — watch the trace.
        </p>
      </div>

      {/* Fit check */}
      {plan.fitCheck && (
        <div className={`rounded-lg border p-4 ${plan.fitCheck.shouldReach ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">
              {plan.fitCheck.shouldReach ? "✓ Candidate fit confirmed" : "⚠ Candidate fit is weak"}
            </span>
            <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${plan.fitCheck.shouldReach ? "bg-green-200 text-green-800" : "bg-amber-200 text-amber-800"}`}>
              Fit score: {plan.fitCheck.score}/10
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{plan.fitCheck.reasoning}</p>
          {plan.fitCheck.concerns.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {plan.fitCheck.concerns.map((c, i) => (
                <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span>·</span>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Research trace — proof the agent picked its own research path */}
      {plan.research && plan.research.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-400 pb-2 border-b border-slate-700">
            <span>🔎</span>
            <span>agent.research(candidate)</span>
            <span className="ml-auto text-slate-500">{plan.research.length} call{plan.research.length > 1 ? "s" : ""}</span>
          </div>
          {plan.research.map((r, i) => (
            <div key={i} className="space-y-1">
              {r.skipped ? (
                <div>
                  <div className="text-slate-200">
                    <span className="text-slate-500 select-none">{String(i + 1).padStart(2, "0")}.</span>
                    {" "}<span className="text-amber-300 font-semibold">no_research_needed</span>
                  </div>
                  <p className="text-slate-400 pl-7 leading-relaxed">{r.reasoning}</p>
                </div>
              ) : (
                <div>
                  <div className="text-slate-200">
                    <span className="text-slate-500 select-none">{String(i + 1).padStart(2, "0")}.</span>
                    {" "}<span className="text-violet-300 font-semibold">research_candidate</span>
                    {" "}<span className="text-slate-400">&quot;{r.query}&quot;</span>
                  </div>
                  {r.reasoning && <p className="text-slate-500 pl-7 leading-relaxed italic">{r.reasoning}</p>}
                  {r.answer && (
                    <p className="text-slate-300 pl-7 leading-relaxed mt-1">
                      <span className="text-emerald-400">→</span> {r.answer.slice(0, 280)}{r.answer.length > 280 ? "…" : ""}
                    </p>
                  )}
                  {r.results.length > 0 && (
                    <ul className="pl-7 mt-1 space-y-0.5">
                      {r.results.slice(0, 3).map((s, j) => (
                        <li key={j} className="text-slate-400 truncate">
                          <span className="text-slate-600">·</span>{" "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-violet-200 hover:underline">{s.title}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Critique result */}
      {critique && (
        <div className={`rounded-lg border px-4 py-3 flex items-start gap-2 ${critique.passed ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"}`}>
          <span className="text-sm mt-0.5">{critique.passed ? "✓" : "↻"}</span>
          <div>
            <p className="text-sm font-medium text-gray-800">
              {critique.passed
                ? "Self-check passed — all messages follow personality rules"
                : `Self-check: ${critique.violations.length} violation${critique.violations.length > 1 ? "s" : ""} detected and auto-fixed`}
            </p>
            {!critique.passed && critique.violations.map((v, i) => (
              <p key={i} className="text-xs text-blue-700 mt-1">Message {v.messageStep}: {v.rule}{v.originalOpener ? ` ("${v.originalOpener}")` : ""}</p>
            ))}
          </div>
        </div>
      )}

      {/* Strategy */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Strategy</p>
        <p className="text-sm text-gray-700">{plan.strategy.arc}</p>
        <p className="text-xs text-gray-500"><span className="font-medium">Angle:</span> {plan.strategy.angle}</p>
        <ReasoningBox reasoning={plan.reasoning} />
      </div>

      {/* Plan revised banner */}
      {planRevised && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="text-amber-600 font-bold">↻</span>
          <p className="text-sm font-medium text-amber-800">Agent revised its remaining messages — see the amber-bordered cards below.</p>
        </div>
      )}

      {/* Thread closed banner */}
      {threadClosed && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="text-red-600 font-bold">🚪</span>
          <p className="text-sm font-medium text-red-800">Agent closed the thread — no further messages will be sent.</p>
        </div>
      )}

      {/* Stacked messages */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Message sequence</p>
        {plan.messages.map((msg, i) => {
          const isActive = activeMessageIndex === i;
          const isRevised = planRevised && i > (activeMessageIndex ?? -1);
          return (
            <div
              key={i}
              className={`rounded-lg border overflow-hidden transition-all ${isActive ? "border-violet-400 shadow-sm" : isRevised ? "border-amber-300" : "border-gray-200"}`}
            >
              <div className={`px-4 py-2.5 flex items-center justify-between ${isActive ? "bg-violet-50" : isRevised ? "bg-amber-50" : "bg-gray-50"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${isActive ? "bg-violet-200 text-violet-800" : "bg-gray-200 text-gray-600"}`}>
                    {msg.channel} {i + 1}
                  </span>
                  {isRevised && <span className="text-xs text-amber-600 font-medium">↻ revised</span>}
                  {msg.subject && <span className="text-xs text-gray-500 truncate max-w-[200px]">{msg.subject}</span>}
                </div>
                <span className="text-xs text-gray-400 italic hidden sm:block">{msg.intent}</span>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                <button
                  onClick={() => {
                    setActiveMessageIndex(i);
                    setConversation([]);
                    setLastResult(null);
                    setPlanRevised(false);
                    setThreadClosed(false);
                    setError(null);
                    setTimeout(() => replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
                  }}
                  className="mt-4 w-full border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  ▶ Simulate candidate reply
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversation thread */}
      {conversation.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversation</p>
          {conversation.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "agent" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === "agent" ? "bg-gray-100 text-gray-800 rounded-tl-sm" : "bg-violet-600 text-white rounded-tr-sm"}`}>
                <p className="text-xs font-semibold mb-1 opacity-60">
                  {msg.role === "agent" ? config.personality.name : candidate.name}
                </p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tool-call trace — the proof of autonomy */}
      {lastResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Agent tool trace</p>
            <span className="text-xs text-gray-400">{lastResult.iterations} loop iteration{lastResult.iterations !== 1 ? "s" : ""}</span>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 space-y-2.5 font-mono text-xs">
            <div className="flex items-center gap-2 text-slate-400 pb-2 border-b border-slate-700">
              <span>$</span>
              <span>agent.run(candidate_reply)</span>
            </div>
            {lastResult.trace.map((call, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-start gap-2 text-slate-200">
                  <span className="text-slate-500 select-none">{String(i + 1).padStart(2, "0")}.</span>
                  <span>{TOOL_ICON[call.name]}</span>
                  <span className="text-violet-300 font-semibold">{TOOL_LABEL[call.name]}</span>
                </div>
                {call.summary && (
                  <p className="text-slate-400 pl-9 leading-relaxed">{call.summary}</p>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 text-emerald-400 pt-2 border-t border-slate-700">
              <span>✓</span>
              <span>agent.complete()</span>
            </div>
          </div>

          {lastResult.fallback && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ {lastResult.fallback}
            </div>
          )}

          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${SIGNAL_COLOR[lastResult.signal]}`}>
            {SIGNAL_LABEL[lastResult.signal]}
          </div>

          {lastResult.flaggedConcern && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-orange-700 mb-1">🚩 Flagged for human</p>
              <p className="text-sm text-orange-800">{lastResult.flaggedConcern}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Reply input */}
      {activeMessageIndex !== null && !threadClosed && (
        <div ref={replyRef} className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Simulate candidate reply to message {activeMessageIndex + 1}
          </p>
          <textarea
            className="input min-h-[80px]"
            placeholder={`Type what ${candidate.name} might reply…`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
          />
          <button
            onClick={sendReply}
            disabled={!reply.trim() || loading}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
          >
            {loading ? "Agent is reasoning…" : "Send reply (Cmd/Ctrl + Enter)"}
          </button>
        </div>
      )}
    </div>
  );
}
