import { NextResponse } from "next/server";
import type { Message, OnboardingState } from "@/lib/onboarding";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["acknowledgedTask", "memory", "nextAction"],
  properties: {
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

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Memory extraction is not configured." }, { status: 503 });
  const body = await request.json() as { messages?: Message[]; profile?: OnboardingState };
  if (!body.profile || !body.messages?.length) return NextResponse.json({ error: "Conversation context is required." }, { status: 400 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-6-astra",
      store: false,
      instructions: `Extract durable onboarding memory from this voice conversation. Preserve known values unless the user clearly resolves a correction. If the latest user statement conflicts with memory and the assistant asks for clarification, keep the old value until the user clarifies. Set acknowledgedTask true only when the latest user message explicitly requests an action and the latest assistant reply accepts it. Choose offer_google only when Google would clearly help the stated need.`,
      input: [
        { role: "developer", content: `Current structured memory: ${JSON.stringify(body.profile)}` },
        ...body.messages.slice(-24).map((message) => ({ role: message.role === "agent" ? "assistant" : "user", content: message.text })),
      ],
      text: { format: { type: "json_schema", name: "persona_voice_memory", strict: true, schema } },
    }),
  });
  if (!response.ok) return NextResponse.json({ error: "Voice memory could not be saved." }, { status: 502 });
  const text = outputText(await response.json());
  return NextResponse.json(JSON.parse(text));
}
