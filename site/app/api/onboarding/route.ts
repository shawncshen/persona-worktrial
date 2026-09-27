import { NextResponse } from "next/server";
import type { Message, OnboardingState } from "@/lib/onboarding";

type RequestBody = {
  messages?: Message[];
  profile?: OnboardingState;
  channel?: "text" | "voice";
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "acknowledgedTask", "memory", "nextAction"],
  properties: {
    reply: { type: "string", minLength: 1, maxLength: 500 },
    acknowledgedTask: { type: "boolean" },
    memory: {
      type: "object",
      additionalProperties: false,
      required: ["agentName", "userName", "primaryNeed"],
      properties: {
        agentName: { type: "string", maxLength: 80 },
        userName: { type: "string", maxLength: 80 },
        primaryNeed: { type: "string", maxLength: 300 },
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
3. One concrete thing they want help with.
4. Whether connecting Google would make that help more useful.

Do not behave like a form or follow a rigid question order. Respond to what the user actually says. Extract every useful fact they provide, including several facts in one message, and never ask for known information again. Ask at most one direct question per reply. If the user asks for immediate help, engage with that need first and collect missing details naturally later.

When the user says something that conflicts with a durable fact already in memory or a clear earlier statement, do not silently overwrite it. Point out the specific mismatch in a natural, non-accusatory way, then ask which version is current. For example: "Wait, earlier you said X, but now I'm hearing Y. Do you want X or Y?" Only update memory after the user clarifies. Do not flag harmless elaborations, changes of preference, or facts that can both be true.

Use nextAction to let the interface offer a short voice call after you have been named, offer Google only after you understand a need that Gmail or Calendar could support, and mark onboarding_complete when you know the agent name, user name, and primary need and Google has been addressed or is unnecessary.

Return the complete current memory in every response. Preserve known values unless the user clearly corrects them. Set acknowledgedTask to true only when the user explicitly asks you to do something and your reply accepts or acknowledges that task. Otherwise set it to false. Keep replies warm, concise, and suitable for an iMessage conversation.`;

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
        ...messages.map((message) => ({ role: message.role === "agent" ? "assistant" : "user", content: message.text })),
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

  return NextResponse.json(JSON.parse(text));
}
