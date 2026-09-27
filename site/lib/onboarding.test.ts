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
  assert.equal(nextReply(state, next), "Good to meet you, shawn. What’s one thing you wish I could take off your plate?");
});

test("the agent speaks about itself in the first person", () => {
  const state = { ...initial, agentName: "Jack", userName: "Shawn" };
  const reply = nextReply(state, state);
  assert.match(reply, /I could take off your plate/);
  assert.doesNotMatch(reply, /Jack could/);
});

test("still extracts several details from one natural message", () => {
  const next = extractFacts("Call yourself Nova. I'm Shawn and I need help with recruiting emails.", initial);
  assert.equal(next.agentName, "Nova");
  assert.equal(next.userName, "Shawn");
  assert.equal(next.primaryNeed, "recruiting emails");
});
