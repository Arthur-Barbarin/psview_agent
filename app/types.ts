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

export interface Plan {
  reasoning: string;
  strategy: {
    touchpoints: number;
    arc: string;
    angle: string;
  };
  messages: Message[];
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
