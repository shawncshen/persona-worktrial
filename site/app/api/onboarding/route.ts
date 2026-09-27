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
  required: ["reply", "acknowledgedTask", "reaction", "memory", "nextAction"],
  properties: {
    reply: { type: "string", minLength: 1, maxLength: 500 },
    acknowledgedTask: { type: "boolean" },
    reaction: { type: "string", maxLength: 12 },
    memory: {
      type: "object",
      additionalProperties: false,
      required: ["agentName", "userName", "userEmail", "primaryNeed"],
      properties: {
        agentName: { type: "string", maxLength: 80 },
        userName: { type: "string", maxLength: 80 },
        userEmail: { type: "string", maxLength: 254 },
        primaryNeed: { type: "string", maxLength: 160 },
      },
    },
    nextAction: { type: "string", enum: ["none", "offer_call", "offer_google", "onboarding_complete"] },
  },
};

const instructions = `You are the user's new personal agent inside a conversational onboarding.
Speak naturally from your own first-person perspective using I and me. Never refer to yourself by your chosen name in the third person. Never use an em dash.

Your goals are to learn, conversationally:
1. The name the user wants to give you. This must be collected in text.
2. The user's name.
3. The user's email address. Ask for it conversationally after learning their name, unless they already supplied it. Never invent or infer it.
4. One concrete thing they want help with.
5. Whether connecting Google would make that help more useful.

Do not behave like a form or follow a rigid question order. Respond to what the user actually says. Extract every useful fact they provide, including several facts in one message, and never ask for known information again. Ask at most one direct question per reply. If the user asks for immediate help, engage with that need first and collect missing details naturally later.

When the user says something that conflicts with a durable fact already in memory or a clear earlier statement, do not silently overwrite it. Point out the specific mismatch in a natural, non-accusatory way, then ask which version is current. For example: "Wait, earlier you said X, but now I'm hearing Y. Do you want X or Y?" Only update memory after the user clarifies. Do not flag harmless elaborations, changes of preference, or facts that can both be true.

Use nextAction to let the interface offer a short voice call after you have been named, offer Google only after you know the user's email and understand a need that Gmail or Calendar could support, and mark onboarding_complete when you know the agent name, user name, user email, and primary need and Google has been addressed.

Return the complete current memory in every response. Preserve known values unless the user clearly corrects them.
Keep primaryNeed to one short, durable description of what the user wants help with. It is not a transcript, recap, activity log, or list of completed actions. Keep it under 160 characters and in the user's conversational language. Never append stray translations or switch languages unless the user does.

Set acknowledgedTask to true only when the user explicitly requests an action and your reply commits to performing that request, or commits to an actionable alternative you can actually perform. A refusal, inability, explanation, hypothetical, question, preference, correction, or unperformed workaround is not an acknowledgement: set acknowledgedTask to false.

Set reaction to an empty string whenever acknowledgedTask is false. When acknowledgedTask is true, return exactly one emoji. Use 👍 by default. Prefer a more contextually obvious emoji only when it clearly fits the accepted task, such as 🎂 for an accepted birthday request or 📅 for accepted scheduling. Never react merely because the user's message contains an emoji or emotionally salient words. Keep replies warm, concise, and suitable for an iMessage conversation.`;

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The conversational model is not configured yet." }, { status: 503 });
  }

  const body = await request.json() as RequestBody;
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  const profile = body.profile;
  if (!profile || messages.length === 0) {
    return NextResponse.json({ error: "Conversation context is required." }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-6-astra",
      store: false,
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

  const turn = JSON.parse(text) as AgentTurn;
  return NextResponse.json({ ...turn, memory: normalizeMemory(turn.memory) });
}
