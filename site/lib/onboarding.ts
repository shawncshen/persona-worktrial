export type Message = { id: string; role: "agent" | "user"; text: string };

export const ONBOARDING_STORAGE_KEY = "persona-onboarding-v1";

export type OnboardingState = {
  agentName: string;
  userName: string;
  primaryNeed: string;
  callStatus: "not_offered" | "offered" | "declined" | "ended";
  googleStatus: "not_asked" | "offered" | "connected" | "declined";
};

export function cleanName(value: string) {
  return value.replace(/[.!?].*$/, "").replace(/^(please\s+)?(call\s+(yourself|you)|your name is|you are|you're)\s+/i, "").trim().split(/\s+/).slice(0, 3).join(" ");
}

function looksLikeAName(value: string) {
  return Boolean(value && value.length <= 28 && /^[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,2}$/u.test(value));
}

export function extractFacts(input: string, current: OnboardingState) {
  const next = { ...current };
  const agentMatch = input.match(/(?:call (?:yourself|you)|your name is|you(?:'re| are))\s+([\p{L}\p{N}'-]+)/iu);
  const userMatch = input.match(/(?:i(?:'m| am)|call me|my name is)\s+([\p{L}'-]+)/iu);
  const needMatch = input.match(/(?:need|want|could use)\s+(?:some\s+)?help\s+(?:with\s+)?(.+?)(?:[.!?]|$)/i);

  if (agentMatch?.[1]) next.agentName = cleanName(agentMatch[1]);
  if (userMatch?.[1]) next.userName = cleanName(userMatch[1]);
  if (needMatch?.[1]) next.primaryNeed = needMatch[1].trim();

  const direct = cleanName(input);
  if (!next.agentName && looksLikeAName(direct) && !/\b(help|what|why|how|no|yes)\b/i.test(direct)) {
    next.agentName = direct;
  } else if (current.agentName && !next.userName && looksLikeAName(direct)) {
    next.userName = direct;
  }

  return next;
}

export function nextReply(previous: OnboardingState, next: OnboardingState) {
  const namedNow = !previous.agentName && next.agentName;
  const userNow = !previous.userName && next.userName;
  const needNow = !previous.primaryNeed && next.primaryNeed;
  if (namedNow && userNow && needNow) return `Nice to meet you, ${next.userName}. ${next.agentName} works for me. I can already help with ${next.primaryNeed}. Want to connect Google so I can get started?`;
  if (namedNow) return `${next.agentName} it is. Want to talk for a minute, or keep texting here?`;
  if (!next.agentName) return "I’m listening. What name feels right for me?";
  if (!next.userName) return "What should I call you?";
  if (!next.primaryNeed) return `Good to meet you, ${next.userName}. What’s one thing you wish I could take off your plate?`;
  if (userNow || needNow) return `Got it. I can help with ${next.primaryNeed}. Want to connect Google so I can make that useful right away?`;
  return "I’ve got you. Tell me a little more about what would make this genuinely useful.";
}
