export interface Company {
  name: string;
  description: string;
  culture: string;
  profiles: string;
  tone: string;
}

export interface Candidate {
  name: string;
  role: string;
  background: string;
}

export interface Personality {
  name: string;
  voicePrinciples: string[];
  valueSignals: string[];
  avoids: string[];
  openingStyle: string;
  closingStyle: string;
}

export interface AgentConfig {
  reasoning: string;
  personality: Personality;
}

export interface Message {
  step: number;
  channel: string;
  subject: string | null;
  body: string;
  intent: string;
}

export interface ConversationMessage {
  role: "agent" | "candidate";
  content: string;
}

export interface ReplyResult {
  reasoning: string;
  signal: "interested" | "neutral" | "hesitant" | "declined";
  response: string;
}

export type Signal = "interested" | "neutral" | "hesitant" | "declined";

export interface ToolCall {
  name:
    | "classify_signal"
    | "compose_response"
    | "revise_remaining_plan"
    | "close_thread"
    | "flag_concern";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  // Human-readable one-line summary of what this call did. The agent fills this in via args.
  summary?: string;
}

export interface AgentReplyResult {
  trace: ToolCall[];
  signal: Signal;
  response: string;
  revisedMessages?: Message[];
  closed?: boolean;
  flaggedConcern?: string;
  iterations: number;
  fallback?: string; // set if the loop produced nothing usable
}

export interface FitCheck {
  shouldReach: boolean;
  score: number; // 1-10
  reasoning: string;
  concerns: string[];
}

export interface ResearchResultSnippet {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ResearchTrace {
  query: string;
  reasoning: string;
  answer: string | null;
  results: ResearchResultSnippet[];
  skipped?: boolean;
}

export interface Plan {
  fitCheck: FitCheck;
  reasoning: string;
  strategy: {
    touchpoints: number;
    arc: string;
    angle: string;
  };
  messages: Message[];
  research?: ResearchTrace[];
  researchEnabled?: boolean;
}

export interface CritiqueViolation {
  messageStep: number;
  rule: string;
  originalOpener?: string;
}

export interface CritiqueResult {
  passed: boolean;
  violations: CritiqueViolation[];
  reasoning: string;
  messages: Message[]; // auto-fixed messages
}
