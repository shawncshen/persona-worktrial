export type ParsedVoiceEvent =
  | { kind: "user_transcript" | "agent_delta" | "agent_transcript"; text: string }
  | { kind: "error"; text: string }
  | { kind: "ignore"; text: "" };

export function parseRealtimeVoiceEvent(raw: string): ParsedVoiceEvent {
  try {
    const event = JSON.parse(raw) as { type?: string; transcript?: string; delta?: string; error?: { message?: string } };
    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript?.trim()) {
      return { kind: "user_transcript", text: event.transcript.trim() };
    }
    if (event.type === "response.output_audio_transcript.delta" && event.delta) {
      return { kind: "agent_delta", text: event.delta };
    }
    if (event.type === "response.output_audio_transcript.done" && event.transcript?.trim()) {
      return { kind: "agent_transcript", text: event.transcript.trim() };
    }
    if (event.type === "error") return { kind: "error", text: event.error?.message || "The live call hit an error." };
  } catch { /* Ignore malformed Realtime events without ending the call. */ }
  return { kind: "ignore", text: "" };
}
