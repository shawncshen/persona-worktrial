import assert from "node:assert/strict";
import test from "node:test";
import { isOnboardingReady, mergeAgentTurn, normalizeMemory, type AgentTurn, type OnboardingState } from "./onboarding.ts";

const current: OnboardingState = {
  agentName: "Nova",
  userName: "",
  userEmail: "",
  primaryNeed: "",
  callStatus: "not_offered",
  googleStatus: "not_asked",
  onboardingComplete: false,
};

test("merges model-extracted memory without losing known facts", () => {
  const turn: AgentTurn = {
    reply: "Good to meet you, Shawn.",
    acknowledgedTask: true,
    memory: { agentName: "", userName: "Shawn", userEmail: "shawn@example.com", primaryNeed: "recruiting emails" },
    nextAction: "offer_google",
  };
  assert.deepEqual(mergeAgentTurn(current, turn), {
    ...current,
    userName: "Shawn",
    userEmail: "shawn@example.com",
    primaryNeed: "recruiting emails",
    googleStatus: "offered",
  });
});

test("turn actions reveal the voice choice without overwriting memory", () => {
  const turn: AgentTurn = {
    reply: "Nova feels right. Want to talk or keep texting?",
    acknowledgedTask: false,
    memory: { agentName: "Nova", userName: "", userEmail: "", primaryNeed: "" },
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

test("finishes only after details, a call attempt, and a Google decision", () => {
  assert.equal(isOnboardingReady(current), false);
  assert.equal(isOnboardingReady({
    ...current,
    agentName: "Nova",
    userName: "Shawn",
    userEmail: "shawn@example.com",
    primaryNeed: "recruiting follow-ups",
    callStatus: "ended",
    googleStatus: "connected",
  }), true);
});
