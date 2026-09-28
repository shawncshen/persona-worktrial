export type Attachment = { id: string; name: string; type: string; size: number; previewUrl?: string };
export type Message = { id: string; role: "agent" | "user"; text: string; reaction?: string; attachments?: Attachment[] };

export const ONBOARDING_STORAGE_KEY = "persona-onboarding-v1";

export type OnboardingState = {
  agentName: string;
  userName: string;
  userEmail: string;
  primaryNeed: string;
  callStatus: "not_offered" | "offered" | "declined" | "ended";
  onboardingComplete: boolean;
  currentGoal: string;
  nextStep: string;
  pendingCommitment: string;
  awaitingUserInput: string;
};

export type AgentTurn = {
  reply: string;
  onboardingFollowUp?: string;
  acknowledgedTask: boolean;
  reaction?: string;
  memory: {
    agentName: string;
    userName: string;
    userEmail: string;
    primaryNeed: string;
  };
  steering: {
    currentGoal: string;
    nextStep: string;
    pendingCommitment: string;
    awaitingUserInput: string;
  };
  nextAction: "none" | "offer_call" | "onboarding_complete";
};

const MEMORY_LIMITS = {
  agentName: 80,
  userName: 80,
  userEmail: 254,
  primaryNeed: 160,
  currentGoal: 180,
  nextStep: 180,
  pendingCommitment: 180,
  awaitingUserInput: 120,
} as const;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= MEMORY_LIMITS.userEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeMemory(memory: AgentTurn["memory"]): AgentTurn["memory"] {
  return {
    agentName: memory.agentName.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.agentName),
    userName: memory.userName.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.userName),
    userEmail: isValidEmail(memory.userEmail) ? memory.userEmail.trim().slice(0, MEMORY_LIMITS.userEmail) : "",
    primaryNeed: memory.primaryNeed.replace(/\s+/g, " ").trim().slice(0, MEMORY_LIMITS.primaryNeed),
  };
}

export function isOnboardingReady(profile: OnboardingState): boolean {
  return Boolean(profile.agentName.trim() && profile.userName.trim() && isValidEmail(profile.userEmail));
}

export function mergeAgentTurn(current: OnboardingState, turn: AgentTurn): OnboardingState {
  const memory = normalizeMemory(turn.memory);
  return {
    ...current,
    agentName: memory.agentName || current.agentName,
    userName: memory.userName || current.userName,
    userEmail: memory.userEmail || current.userEmail,
    primaryNeed: memory.primaryNeed || current.primaryNeed,
    currentGoal: turn.steering.currentGoal || current.currentGoal,
    nextStep: turn.steering.nextStep,
    pendingCommitment: turn.steering.pendingCommitment,
    awaitingUserInput: turn.steering.awaitingUserInput,
    callStatus: turn.nextAction === "offer_call" && current.callStatus === "not_offered" ? "offered" : current.callStatus,
  };
}
