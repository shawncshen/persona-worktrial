import { NextResponse } from "next/server";
import { normalizeMemory, type AgentTurn, type Message, type OnboardingState } from "@/lib/onboarding";

type RequestBody = {
  messages?: Message[];
  profile?: OnboardingState;
  channel?: "text" | "voice";
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "onboardingFollowUp", "acknowledgedTask", "reaction", "memoryPatch", "nextAction"],
  properties: {
    reply: { type: "string", minLength: 1, maxLength: 280 },
    onboardingFollowUp: { type: "string", maxLength: 180 },
    acknowledgedTask: { type: "boolean" },
    reaction: { type: "string", maxLength: 12 },
    memoryPatch: {
      type: "object",
      additionalProperties: false,
      required: ["agentName", "userName", "userEmail", "primaryNeed"],
      properties: {
        agentName: { type: ["string", "null"], maxLength: 80 },
        userName: { type: ["string", "null"], maxLength: 80 },
        userEmail: { type: ["string", "null"], maxLength: 254 },
        primaryNeed: { type: ["string", "null"], maxLength: 160 },
      },
    },
    nextAction: { type: "string", enum: ["none", "offer_call", "onboarding_complete"] },
  },
};

const instructions = `You are the user's new personal agent inside a conversational onboarding.
Speak naturally from your own first-person perspective using I and me. Never refer to yourself by your chosen name in the third person. Never use an em dash.

Your goals are to learn, conversationally:
1. The name the user wants to give you. This must be collected in text.
2. The user's name.
3. The user's email address. Ask for it conversationally after learning their name, unless they already supplied it. Never invent or infer it.
4. One concrete thing they want help with when it comes up naturally, but it is optional and must not delay onboarding completion.

Do not behave like a form or follow a rigid question order. Respond to what the user actually says. Extract every useful fact they provide, including several facts in one message, and never ask for known information again. Ask at most one direct question per message.

Use common sense before storing an answer as a name or profile fact. A message appearing after a question is not automatically an answer to that question. If the user jokes, trolls, gives an implausible phrase, or says something unrelated instead of providing a name, respond briefly and naturally, then ask the same onboarding question again. Do not save the joke or phrase as memory.

If onboarding is incomplete and the user's latest message is off-topic or asks for immediate help unrelated to supplying onboarding information, answer it naturally in reply first. Then return a separate onboardingFollowUp that gently redirects and asks for exactly one missing detail. The interface displays reply and onboardingFollowUp as two separate message bubbles, so never combine the answer and redirect in reply. Use natural language such as "Let’s get back to setting me up. What would you like to call me?" Choose the next missing detail in this priority: agent name, user name, email address, then what they want ongoing help with. Do not ask for information already known. Do not redirect when the user supplied useful onboarding information, when resolving a contradiction, or after onboarding is complete. Return an empty onboardingFollowUp when no redirect is needed.

When the user says something that conflicts with a durable fact already in memory or a clear earlier statement, do not silently overwrite it. Point out the specific mismatch in a natural, non-accusatory way, then ask which version is current. For example: "Wait, earlier you said X, but now I'm hearing Y. Do you want X or Y?" Only update memory after the user clarifies. Do not flag harmless elaborations, changes of preference, or facts that can both be true.

Use nextAction to let the interface offer a short voice call after you have been named. Mark onboarding_complete as soon as you know the agent name, user name, and user email. Once those three fields are known, do not ask another onboarding question or ask for a primary need. Keep the reply brief so the interface can immediately announce completion.

Return only changed or newly learned facts in memoryPatch. Use null for every unchanged field. Never repeat known memory in the patch, and never clear a known value. Only patch a conflicting fact after the user clearly resolves the conflict.
Keep primaryNeed to one short, durable description of what the user wants help with. It is not a transcript, recap, activity log, or list of completed actions. Keep it under 160 characters and in the user's conversational language. Never append stray translations or switch languages unless the user does.

Set acknowledgedTask to true only when the user explicitly requests an action and your reply commits to performing that request, or commits to an actionable alternative you can actually perform. A refusal, inability, explanation, hypothetical, question, preference, correction, or unperformed workaround is not an acknowledgement: set acknowledgedTask to false.

Set reaction to an empty string whenever acknowledgedTask is false. When acknowledgedTask is true, return exactly one emoji. Use 👍 by default. Prefer a more contextually obvious emoji only when it clearly fits the accepted task, such as 🎂 for an accepted birthday request or 📅 for accepted scheduling. Never react merely because the user's message contains an emoji or emotionally salient words.

Keep reply to one or two short sentences. Keep onboardingFollowUp to one short sentence. Be warm, casual, and direct, like a capable friend texting.`;

type MemoryPatch = {
  agentName: string | null;
  userName: string | null;
  userEmail: string | null;
  primaryNeed: string | null;
};

type ModelTurn = Omit<AgentTurn, "memory"> & { memoryPatch: MemoryPatch };

function mergeMemoryPatch(profile: OnboardingState, patch: MemoryPatch): AgentTurn["memory"] {
  return normalizeMemory({
    agentName: patch.agentName ?? profile.agentName,
    userName: patch.userName ?? profile.userName,
    userEmail: patch.userEmail ?? profile.userEmail,
    primaryNeed: patch.primaryNeed ?? profile.primaryNeed,
  });
}

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function POST(request: Request) {
  const body = await request.json() as RequestBody;
  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const profile = body.profile;
  if (!profile || messages.length === 0) {
    return NextResponse.json({ error: "Conversation context is required." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The conversational model is not configured yet." }, { status: 503 });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-6-luna",
      service_tier: "fast",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 900,
      prompt_cache_options: { ttl: "30m" },
      instructions,
      input: [
        {
          role: "developer",
          content: `Current structured memory: ${JSON.stringify(profile)}\nActive channel: ${body.channel || "text"}`,
        },
        ...messages.map((message) => {
          const attachmentSummary = message.attachments?.length
            ? `\n\nAttachments selected: ${message.attachments.map((attachment) => `${attachment.name} (${attachment.type})`).join(", ")}. File contents are not available to inspect in this prototype.`
            : "";
          return { role: message.role === "agent" ? "assistant" : "user", content: `${message.text}${attachmentSummary}` };
        }),
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "persona_onboarding_turn",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    return NextResponse.json({ error: "The agent could not respond.", requestId }, { status: 502 });
  }

  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = outputText(payload);
  if (!text) return NextResponse.json({ error: "The agent returned an empty response." }, { status: 502 });

  const turn = JSON.parse(text) as ModelTurn;
  const { memoryPatch, ...rest } = turn;
  return NextResponse.json({ ...rest, memory: mergeMemoryPatch(profile, memoryPatch) } satisfies AgentTurn);
}
