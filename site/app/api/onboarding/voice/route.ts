import { NextResponse } from "next/server";
import { saveVoiceMessage } from "@/db/onboarding";
import type { Message } from "@/lib/onboarding";

export async function POST(request: Request) {
  const body = await request.json() as { deviceId?: string; sessionId?: string; message?: Message };
  const message = body.message;
  if (!body.deviceId || !body.sessionId || !message || !["user", "agent"].includes(message.role) || !message.id || !message.text?.trim()) {
    return NextResponse.json({ error: "A valid voice message and session identity are required." }, { status: 400 });
  }
  if (body.deviceId.length > 100 || body.sessionId.length > 100 || message.id.length > 100 || message.text.length > 5000) {
    return NextResponse.json({ error: "Voice message data is too long." }, { status: 400 });
  }
  try {
    await saveVoiceMessage({ deviceId: body.deviceId, sessionId: body.sessionId }, { ...message, text: message.text.trim() });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Voice message could not be saved." }, { status: 503 });
  }
}
