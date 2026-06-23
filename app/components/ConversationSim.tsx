"use client";
import { useState } from "react";
import { AgentConfig, Candidate, Company, ConversationMessage, CritiqueResult, Message, Plan, ReplyResult } from "../types";
import ReasoningBox from "./ReasoningBox";

const SIGNAL_COLOR = {
  interested: "bg-green-100 text-green-700",
  neutral: "bg-gray-100 text-gray-600",
  hesitant: "bg-yellow-100 text-yellow-700",
  declined: "bg-red-100 text-red-700",
};

const SIGNAL_LABEL = {
  interested: "🟢 Interested",
  neutral: "⚪ Neutral",
  hesitant: "🟡 Hesitant",
  declined: "🔴 Declined",
};

export default function ConversationSim({
  plan,
  setPlan,
  critique,
  config,
  company,
  candidate,
  intent,
}: {
  plan: Plan;
  setPlan: (p: Plan) => void;
  critique: CritiqueResult | null;
  config: AgentConfig;
  company: Company;
  candidate: Candidate;
  intent: string;
}) {
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [reply, setReply] = useState("");
  const [lastReason, setLastReason] = useState<ReplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [planRevised, setPlanRevised] = useState(false);
  const [adaptReasoning, setAdaptReasoning] = useState<string | null>(null);
  const [showAdaptReason, setShowAdaptReason] = useState(true);

  const sendReply = async () => {
    if (!reply.trim() || activeMessageIndex === null) return;
    setLoading(true);
    const currentMsg = plan.messages[activeMessageIndex];

    const newConv: ConversationMessage[] = [
      ...conversation,
      { role: "agent", content: currentMsg.body },
      { role: "candidate", content: reply },
    ];

    try {
      const replyRes = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company, personality: config.personality, candidate, intent,
          conversation: newConv, candidateReply: reply,
        }),
      });
      const result: ReplyResult = await replyRes.json();
      setLastReason(result);

      const updatedConv: ConversationMessage[] = [
        ...newConv, { role: "agent", content: result.response },
      ];
      setConversation(updatedConv);
      setReply("");

      const remaining = plan.messages.slice(activeMessageIndex + 1);
      if (remaining.length > 0) {
        const adaptRes = await fetch("/api/adapt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company, personality: config.personality, candidate, intent,
            conversation: updatedConv, signal: result.signal, remainingMessages: remaining,
          }),
        });
        const adapted = await adaptRes.json();
        if (adapted.revised) {
          const newMessages: Message[] = [
            ...plan.messages.slice(0, activeMessageIndex + 1),
            ...adapted.messages,
          ];
          setPlan({ ...plan, messages: newMessages });
          setPlanRevised(true);
          setAdaptReasoning(adapted.reasoning);
          setShowAdaptReason(true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Conversation simulator</h2>
        <p className="text-sm text-gray-500 mt-0.5">No real messages sent. Click any message to simulate a candidate reply.</p>
      </div>

      {/* Fit check */}
      {plan.fitCheck && (
        <div className={`rounded-lg border p-4 ${plan.fitCheck.shouldReach ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">{plan.fitCheck.shouldReach ? "✓ Candidate fit confirmed" : "⚠ Candidate fit is weak"}</span>
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
      {planRevised && adaptReasoning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-amber-600 font-bold">↻</span>
            <p className="text-sm font-medium text-amber-800">Agent revised its strategy based on candidate signal</p>
            <button onClick={() => setShowAdaptReason(!showAdaptReason)} className="ml-auto text-xs text-amber-600 hover:text-amber-800 font-medium">
              {showAdaptReason ? "Hide" : "Show"} reasoning
            </button>
          </div>
          {showAdaptReason && (
            <div className="px-4 pb-3 text-xs text-amber-700 leading-relaxed border-t border-amber-200 pt-2">
              {adaptReasoning}
            </div>
          )}
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
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? "bg-violet-200 text-violet-800" : "bg-gray-200 text-gray-600"}`}>
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
                  onClick={() => { setActiveMessageIndex(i); setConversation([]); setLastReason(null); }}
                  className="mt-3 text-xs font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1"
                >
                  ▶ Simulate reply to this message
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

      {/* Signal */}
      {lastReason && (
        <div className="space-y-2">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${SIGNAL_COLOR[lastReason.signal]}`}>
            {SIGNAL_LABEL[lastReason.signal]}
          </div>
          <ReasoningBox reasoning={lastReason.reasoning} />
        </div>
      )}

      {/* Reply input */}
      {activeMessageIndex !== null && (
        <div className="space-y-2">
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
            {loading ? "Agent is thinking…" : "Send reply (Cmd/Ctrl + Enter)"}
          </button>
        </div>
      )}
    </div>
  );
}
