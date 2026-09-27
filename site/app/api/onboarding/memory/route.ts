import { NextResponse } from "next/server";
import { saveVoiceSnapshot } from "@/db/onboarding";
import { normalizeMemory, type Message, type OnboardingState } from "@/lib/onboarding";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["acknowledgedTask", "memory", "nextAction"],
  properties: {
    acknowledgedTask: { type: "boolean" },
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
    nextAction: { type: "string", enum: ["none", "offer_call", "onboarding_complete"] },
  },
};

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Memory extraction is not configured." }, { status: 503 });
  const body = await request.json() as { messages?: Message[]; profile?: OnboardingState; deviceId?: string; sessionId?: string };
  if (!body.profile || !body.messages?.length || !body.deviceId || !body.sessionId) return NextResponse.json({ error: "Conversation context and session identity are required." }, { status: 400 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-6-astra",
      store: false,
      instructions: `Extract durable onboarding memory from this voice conversation, including the user's explicitly stated email address. Never invent or infer an email. Preserve known values unless the user clearly resolves a correction. If the latest user statement conflicts with memory and the assistant asks for clarification, keep the old value until the user clarifies. Set acknowledgedTask true only when the latest user message explicitly requests an action and the latest assistant reply accepts it.

primaryNeed must be one short, stable description of what the user wants help with, under 160 characters. It must never become a transcript, recap, activity log, list of turns, or record of completed actions. Keep it in the user's conversational language and never append a stray translation or switch languages unless the user does.`,
      input: [
        { role: "developer", content: `Current structured memory: ${JSON.stringify(body.profile)}` },
        ...body.messages.slice(-24).map((message) => ({ role: message.role === "agent" ? "assistant" : "user", content: message.text })),
      ],
      text: { format: { type: "json_schema", name: "persona_voice_memory", strict: true, schema } },
    }),
  });
  if (!response.ok) {
    try {
      await saveVoiceSnapshot({ deviceId: body.deviceId, sessionId: body.sessionId }, body.messages, body.profile);
    } catch { /* Return the model failure below; the client can retry persistence on the next turn. */ }
    return NextResponse.json({ error: "Voice memory could not be extracted." }, { status: 502 });
  }
  const text = outputText(await response.json());
  const turn = JSON.parse(text) as { acknowledgedTask: boolean; memory: { agentName: string; userName: string; userEmail: string; primaryNeed: string }; nextAction: "none" | "offer_call" | "onboarding_complete" };
  turn.memory = normalizeMemory(turn.memory);
  const updatedProfile: OnboardingState = {
    ...body.profile,
    agentName: turn.memory.agentName || body.profile.agentName,
    userName: turn.memory.userName || body.profile.userName,
    userEmail: turn.memory.userEmail || body.profile.userEmail,
    primaryNeed: turn.memory.primaryNeed || body.profile.primaryNeed,
    callStatus: "ended",
  };
  try {
    await saveVoiceSnapshot({ deviceId: body.deviceId, sessionId: body.sessionId }, body.messages, updatedProfile);
  } catch {
    return NextResponse.json({ error: "Voice conversation could not be saved." }, { status: 503 });
  }
  return NextResponse.json(turn);
}
