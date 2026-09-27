export type Message = { id: string; role: "agent" | "user"; text: string; reaction?: string };

export const ONBOARDING_STORAGE_KEY = "persona-onboarding-v1";

export type OnboardingState = {
  agentName: string;
  userName: string;
  userEmail: string;
  primaryNeed: string;
  callStatus: "not_offered" | "offered" | "declined" | "ended";
  googleStatus: "not_asked" | "offered" | "connected" | "declined";
  onboardingComplete: boolean;
};

export type AgentTurn = {
  reply: string;
  acknowledgedTask: boolean;
  reaction?: string;
  memory: {
    agentName: string;
    userName: string;
    userEmail: string;
    primaryNeed: string;
  };
  nextAction: "none" | "offer_call" | "offer_google" | "onboarding_complete";
};

const MEMORY_LIMITS = { agentName: 80, userName: 80, userEmail: 254, primaryNeed: 160 } as const;

export function normalizeMemory(memory: AgentTurn["memory"]): AgentTurn["memory"] {
  return {
    agentName: memory.agentName.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.agentName),
    userName: memory.userName.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.userName),
    userEmail: memory.userEmail.replace(/\s+/g, "").trim().slice(0, MEMORY_LIMITS.userEmail),
    primaryNeed: memory.primaryNeed.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.primaryNeed),
  };
}

export function isOnboardingReady(profile: OnboardingState): boolean {
  const hasRequiredDetails = Boolean(profile.agentName.trim() && profile.userName.trim() && profile.userEmail.trim() && profile.primaryNeed.trim());
  const callWasAttempted = profile.callStatus !== "not_offered";
  const googleWasResolved = profile.googleStatus === "connected" || profile.googleStatus === "declined";
  return hasRequiredDetails && callWasAttempted && googleWasResolved;
}

export function mergeAgentTurn(current: OnboardingState, turn: AgentTurn): OnboardingState {
  const memory = normalizeMemory(turn.memory);
  return {
    ...current,
    agentName: memory.agentName || current.agentName,
    userName: memory.userName || current.userName,
    userEmail: memory.userEmail || current.userEmail,
    primaryNeed: memory.primaryNeed || current.primaryNeed,
    callStatus: turn.nextAction === "offer_call" && current.callStatus === "not_offered" ? "offered" : current.callStatus,
    googleStatus: turn.nextAction === "offer_google" && current.googleStatus === "not_asked" ? "offered" : current.googleStatus,
  };
}
