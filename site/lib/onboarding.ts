export type Message = { id: string; role: "agent" | "user"; text: string; reaction?: "thumbs_up" };

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
  memory: {
    agentName: string;
    userName: string;
    primaryNeed: string;
  };
  nextAction: "none" | "offer_call" | "offer_google" | "onboarding_complete";
};

export function mergeAgentTurn(current: OnboardingState, turn: AgentTurn): OnboardingState {
  return {
    ...current,
    agentName: turn.memory.agentName || current.agentName,
    userName: turn.memory.userName || current.userName,
    primaryNeed: turn.memory.primaryNeed || current.primaryNeed,
    callStatus: turn.nextAction === "offer_call" && current.callStatus === "not_offered" ? "offered" : current.callStatus,
    googleStatus: turn.nextAction === "offer_google" && current.googleStatus === "not_asked" ? "offered" : current.googleStatus,
  };
}
