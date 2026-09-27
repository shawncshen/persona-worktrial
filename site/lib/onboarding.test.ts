import assert from "node:assert/strict";
import test from "node:test";
import { extractFacts, nextReply, type OnboardingState } from "./onboarding.ts";

const initial: OnboardingState = {
  agentName: "",
  userName: "",
  primaryNeed: "",
  callStatus: "not_offered",
  googleStatus: "not_asked",
};

test("uses a plain reply as the agent name first", () => {
  assert.equal(extractFacts("shawn", initial).agentName, "shawn");
});

test("uses a plain reply as the user name after the agent is named", () => {
  const state = { ...initial, agentName: "shawn", callStatus: "declined" as const };
  const next = extractFacts("shawn", state);
  assert.equal(next.userName, "shawn");
  assert.match(nextReply(state, next), /What’s one thing/);
});

test("still extracts several details from one natural message", () => {
  const next = extractFacts("Call yourself Nova. I'm Shawn and I need help with recruiting emails.", initial);
  assert.equal(next.agentName, "Nova");
  assert.equal(next.userName, "Shawn");
  assert.equal(next.primaryNeed, "recruiting emails");
});
