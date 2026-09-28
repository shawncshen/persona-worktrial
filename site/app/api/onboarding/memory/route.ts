import { NextResponse } from "next/server";
import { hasRequestAccess } from "@/lib/access";
import { saveVoiceSnapshot } from "@/db/onboarding";
import { normalizeMemory, type Message, type OnboardingState } from "@/lib/onboarding";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["acknowledgedTask", "memoryPatch", "steeringPatch", "nextAction"],
  properties: {
    acknowledgedTask: { type: "boolean" },
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
    steeringPatch: {
      type: "object",
      additionalProperties: false,
      required: ["currentGoal", "nextStep", "pendingCommitment", "awaitingUserInput"],
      properties: {
        currentGoal: { type: ["string", "null"], maxLength: 180 },
        nextStep: { type: ["string", "null"], maxLength: 180 },
        pendingCommitment: { type: ["string", "null"], maxLength: 180 },
        awaitingUserInput: { type: ["string", "null"], maxLength: 120 },
      },
    },
    nextAction: { type: "string", enum: ["none", "offer_call", "onboarding_complete"] },
  },
};

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

function cleanSteering(value: string | null, fallback: string, limit: number) {
  return value === null ? fallback : value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function POST(request: Request) {
  if (!await hasRequestAccess(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Memory extraction is not configured." }, { status: 503 });
  const body = await request.json() as { messages?: Message[]; profile?: OnboardingState; deviceId?: string; sessionId?: string };
  if (!body.profile || !body.messages?.length || !body.deviceId || !body.sessionId) return NextResponse.json({ error: "Conversation context and session identity are required." }, { status: 400 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-6-luna",
      service_tier: "fast",
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 600,
      prompt_cache_options: { ttl: "30m" },
      instructions: `Extract only changed or newly learned durable onboarding memory from this voice conversation. Use null for every unchanged field in memoryPatch. Include the user's explicitly stated email address, but never invent or infer one. If the latest user statement conflicts with memory and the assistant asks for clarification, keep the old value until the user clarifies. Set acknowledgedTask true only when the latest user message explicitly requests an action and the latest assistant reply accepts it.

Track active steering state in steeringPatch. Preserve the user's concrete current goal, the exact next step, any promise the agent made, and the one specific input still needed. Use null when unchanged and an empty string only when a commitment or requested input was fulfilled or canceled. The agent must continue its own promises without making the user restate the goal.

primaryNeed must be one short, stable description of what the user wants help with, under 160 characters. It must never become a transcript, recap, activity log, list of turns, or record of completed actions. Keep it in the user's conversational language and never append a stray translation or switch languages unless the user does.`,
      input: [
        { role: "developer", content: `Current structured memory: ${JSON.stringify(body.profile)}` },
        ...body.messages.slice(-8).map((message) => ({ role: message.role === "agent" ? "assistant" : "user", content: message.text })),
      ],
      text: { verbosity: "low", format: { type: "json_schema", name: "persona_voice_memory", strict: true, schema } },
    }),
  });
  if (!response.ok) {
    try {
      await saveVoiceSnapshot({ deviceId: body.deviceId, sessionId: body.sessionId }, body.messages, body.profile);
    } catch { /* Return the model failure below; the client can retry persistence on the next turn. */ }
    return NextResponse.json({ error: "Voice memory could not be extracted." }, { status: 502 });
  }
  const text = outputText(await response.json());
  const turn = JSON.parse(text) as {
    acknowledgedTask: boolean;
    memoryPatch: { agentName: string | null; userName: string | null; userEmail: string | null; primaryNeed: string | null };
    steeringPatch: { currentGoal: string | null; nextStep: string | null; pendingCommitment: string | null; awaitingUserInput: string | null };
    nextAction: "none" | "offer_call" | "onboarding_complete";
  };
  const memory = normalizeMemory({
    agentName: turn.memoryPatch.agentName ?? body.profile.agentName,
    userName: turn.memoryPatch.userName ?? body.profile.userName,
    userEmail: turn.memoryPatch.userEmail ?? body.profile.userEmail,
    primaryNeed: turn.memoryPatch.primaryNeed ?? body.profile.primaryNeed,
  });
  const updatedProfile: OnboardingState = {
    ...body.profile,
    ...memory,
    currentGoal: cleanSteering(turn.steeringPatch.currentGoal, body.profile.currentGoal, 180),
    nextStep: cleanSteering(turn.steeringPatch.nextStep, body.profile.nextStep, 180),
    pendingCommitment: cleanSteering(turn.steeringPatch.pendingCommitment, body.profile.pendingCommitment, 180),
    awaitingUserInput: cleanSteering(turn.steeringPatch.awaitingUserInput, body.profile.awaitingUserInput, 120),
    callStatus: "ended",
  };
  try {
    await saveVoiceSnapshot({ deviceId: body.deviceId, sessionId: body.sessionId }, body.messages, updatedProfile);
  } catch {
    return NextResponse.json({ error: "Voice conversation could not be saved." }, { status: 503 });
  }
  return NextResponse.json({
    acknowledgedTask: turn.acknowledgedTask,
    memory,
    steering: {
      currentGoal: updatedProfile.currentGoal,
      nextStep: updatedProfile.nextStep,
      pendingCommitment: updatedProfile.pendingCommitment,
      awaitingUserInput: updatedProfile.awaitingUserInput,
    },
    nextAction: turn.nextAction,
  });
}
