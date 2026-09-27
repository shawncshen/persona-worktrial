export type Message = { id: string; role: "agent" | "user"; text: string; reaction?: string };

export const ONBOARDING_STORAGE_KEY = "persona-onboarding-v1";

export type OnboardingState = {
  agentName: string;
  userName: string;
  primaryNeed: string;
  callStatus: "not_offered" | "offered" | "declined" | "ended";
  googleStatus: "not_asked" | "offered" | "connected" | "declined";
};

export type AgentTurn = {
  reply: string;
  acknowledgedTask: boolean;
  reaction?: string;
  memory: {
    agentName: string;
    userName: string;
    primaryNeed: string;
  };
  nextAction: "none" | "offer_call" | "offer_google" | "onboarding_complete";
};

const MEMORY_LIMITS = { agentName: 80, userName: 80, primaryNeed: 160 } as const;

export function normalizeMemory(memory: AgentTurn["memory"]): AgentTurn["memory"] {
  return {
    agentName: memory.agentName.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.agentName),
    userName: memory.userName.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.userName),
    primaryNeed: memory.primaryNeed.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.primaryNeed),
  };
}

export function mergeAgentTurn(current: OnboardingState, turn: AgentTurn): OnboardingState {
  const memory = normalizeMemory(turn.memory);
  return {
    ...current,
    agentName: memory.agentName || current.agentName,
    userName: memory.userName || current.userName,
    primaryNeed: memory.primaryNeed || current.primaryNeed,
    callStatus: turn.nextAction === "offer_call" && current.callStatus === "not_offered" ? "offered" : current.callStatus,
    googleStatus: turn.nextAction === "offer_google" && current.googleStatus === "not_asked" ? "offered" : current.googleStatus,
  };
}
