import assert from "node:assert/strict";
import test from "node:test";
import { parseRealtimeVoiceEvent } from "./voice.ts";

test("extracts a controlled microphone transcription event", () => {
  assert.deepEqual(parseRealtimeVoiceEvent(JSON.stringify({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "  My name is Shawn.  ",
  })), { kind: "user_transcript", text: "My name is Shawn." });
});

test("extracts completed agent audio without exposing malformed events", () => {
  assert.deepEqual(parseRealtimeVoiceEvent(JSON.stringify({
    type: "response.output_audio_transcript.done",
    transcript: "Got it.",
  })), { kind: "agent_transcript", text: "Got it." });
  assert.deepEqual(parseRealtimeVoiceEvent("not json"), { kind: "ignore", text: "" });
});
