import assert from "node:assert/strict";
import test from "node:test";
import { isOnboardingReady, isValidEmail, mergeAgentTurn, normalizeMemory, type AgentTurn, type OnboardingState } from "./onboarding.ts";

const current: OnboardingState = {
  agentName: "Nova",
  userName: "",
  userEmail: "",
  primaryNeed: "",
  callStatus: "not_offered",
  onboardingComplete: false,
  currentGoal: "",
  nextStep: "",
  pendingCommitment: "",
  awaitingUserInput: "",
};

const emptySteering: AgentTurn["steering"] = {
  currentGoal: "",
  nextStep: "",
  pendingCommitment: "",
  awaitingUserInput: "",
};

test("merges model-extracted memory without losing known facts", () => {
  const turn: AgentTurn = {
    reply: "Good to meet you, Shawn.",
    acknowledgedTask: true,
    memory: { agentName: "", userName: "Shawn", userEmail: "shawn@example.com", primaryNeed: "recruiting emails" },
    steering: emptySteering,
    nextAction: "none",
  };
  assert.deepEqual(mergeAgentTurn(current, turn), {
    ...current,
    userName: "Shawn",
    userEmail: "shawn@example.com",
    primaryNeed: "recruiting emails",
  });
});

test("turn actions reveal the voice choice without overwriting memory", () => {
  const turn: AgentTurn = {
    reply: "Nova feels right. Want to talk or keep texting?",
    acknowledgedTask: false,
    memory: { agentName: "Nova", userName: "", userEmail: "", primaryNeed: "" },
    steering: emptySteering,
    nextAction: "offer_call",
  };
  assert.equal(mergeAgentTurn(current, turn).callStatus, "offered");
});

test("keeps primary need compact and single-line", () => {
  const longNeed = `help me with email\n${"activity log ".repeat(30)}`;
  const memory = normalizeMemory({ agentName: " Nova ", userName: " Shawn ", userEmail: " shawn@example.com ", primaryNeed: longNeed });
  assert.equal(memory.agentName, "Nova");
  assert.equal(memory.userName, "Shawn");
  assert.ok(memory.primaryNeed.length <= 160);
  assert.equal(memory.primaryNeed.includes("\n"), false);
});

test("finishes as soon as agent name, user name, and email are known", () => {
  assert.equal(isOnboardingReady(current), false);
  assert.equal(isOnboardingReady({
    ...current,
    agentName: "Nova",
    userName: "Shawn",
    userEmail: "shawn@example.com",
  }), true);
});

test("rejects malformed email memory and does not complete onboarding", () => {
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(normalizeMemory({ agentName: "Nova", userName: "Shawn", userEmail: "not-an-email", primaryNeed: "" }).userEmail, "");
  assert.equal(isOnboardingReady({ ...current, userName: "Shawn", userEmail: "not-an-email" }), false);
});

test("carries the exact next step and commitment across turns", () => {
  const turn: AgentTurn = {
    reply: "Send me the menu and I’ll turn it into a grocery list.",
    acknowledgedTask: true,
    reaction: "👍",
    memory: { agentName: "Nova", userName: "Shawn", userEmail: "", primaryNeed: "plan weekly meals" },
    steering: {
      currentGoal: "plan weekly meals",
      nextStep: "turn the user's menu into a grocery list",
      pendingCommitment: "create a grocery list from the user's menu",
      awaitingUserInput: "the menu",
    },
    nextAction: "none",
  };
  assert.deepEqual(mergeAgentTurn(current, turn), {
    ...current,
    userName: "Shawn",
    primaryNeed: "plan weekly meals",
    currentGoal: "plan weekly meals",
    nextStep: "turn the user's menu into a grocery list",
    pendingCommitment: "create a grocery list from the user's menu",
    awaitingUserInput: "the menu",
  });
});
