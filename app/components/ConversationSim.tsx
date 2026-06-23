"use client";
import { useState } from "react";
import { AgentConfig, Candidate, Company, ConversationMessage, Plan, ReplyResult } from "../types";
import ReasoningBox from "./ReasoningBox";

const SIGNAL_COLOR = {
  interested: "bg-green-100 text-green-700",
  neutral: "bg-gray-100 text-gray-600",
  hesitant: "bg-yellow-100 text-yellow-700",
  declined: "bg-red-100 text-red-700",
};

export default function ConversationSim({
  plan,
  config,
  company,
  candidate,
  intent,
}: {
  plan: Plan;
  config: AgentConfig;
  company: Company;
  candidate: Candidate;
  intent: string;
}) {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [activeMessage, setActiveMessage] = useState(0);
  const [reply, setReply] = useState("");
  const [lastReason, setLastReason] = useState<ReplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPlanReason, setShowPlanReason] = useState(false);

  const currentMsg = plan.messages[activeMessage];

  const sendReply = async () => {
    if (!reply.trim()) return;
    setLoading(true);
    const newConv: ConversationMessage[] = [
      ...conversation,
      { role: "agent", content: currentMsg.body },
      { role: "candidate", content: reply },
    ];
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          personality: config.personality,
          candidate,
          intent,
          conversation: newConv,
          candidateReply: reply,
        }),
      });
      const result: ReplyResult = await res.json();
      setLastReason(result);
      setConversation([...newConv, { role: "agent", content: result.response }]);
      setReply("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Conversation simulator</h2>
        <p className="text-sm text-gray-500 mt-0.5">No real messages sent. Simulate candidate replies to watch the agent react.</p>
      </div>

      {/* Strategy overview */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Agent strategy</p>
          <button
            onClick={() => setShowPlanReason(!showPlanReason)}
            className="text-xs text-violet-600 hover:text-violet-800 font-medium"
          >
            {showPlanReason ? "Hide" : "Show"} reasoning
          </button>
        </div>
        <p className="text-sm text-gray-700">{plan.strategy.arc}</p>
        <p className="text-xs text-gray-500"><span className="font-medium">Angle:</span> {plan.strategy.angle}</p>
        {showPlanReason && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 leading-relaxed">{plan.reasoning}</p>
          </div>
        )}
      </div>

      {/* Message selector */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Message sequence</p>
        <div className="flex gap-2 mb-4">
          {plan.messages.map((m, i) => (
            <button
              key={i}
              onClick={() => { setActiveMessage(i); setConversation([]); setLastReason(null); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                activeMessage === i
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
              }`}
            >
              {m.channel} #{m.step}
            </button>
          ))}
        </div>

        {/* Active message */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600">{currentMsg.channel}</span>
              {currentMsg.subject && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500">{currentMsg.subject}</span>
                </>
              )}
            </div>
            <span className="text-xs text-gray-400 italic">{currentMsg.intent}</span>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{currentMsg.body}</p>
          </div>
        </div>
      </div>

      {/* Conversation thread */}
      {conversation.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversation</p>
          {conversation.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "agent" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "agent"
                    ? "bg-gray-100 text-gray-800 rounded-tl-sm"
                    : "bg-violet-600 text-white rounded-tr-sm"
                }`}
              >
                <p className="text-xs font-semibold mb-1 opacity-60">
                  {msg.role === "agent" ? config.personality.name : candidate.name}
                </p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Last reasoning */}
      {lastReason && (
        <div className="space-y-2">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${SIGNAL_COLOR[lastReason.signal]}`}>
            <span>Signal detected:</span>
            <span className="capitalize">{lastReason.signal}</span>
          </div>
          <ReasoningBox reasoning={lastReason.reasoning} />
        </div>
      )}

      {/* Reply input */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Simulate candidate reply</p>
        <textarea
          className="input min-h-[80px]"
          placeholder={`Type what ${candidate.name} might reply…`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
          }}
        />
        <button
          onClick={sendReply}
          disabled={!reply.trim() || loading}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? "Agent is thinking…" : "Send reply (⌘↵)"}
        </button>
      </div>
    </div>
  );
}
