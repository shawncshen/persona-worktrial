const realtimeInstructions = `You are the user's personal agent in a live voice call.
Speak naturally, warmly, and concisely from your own first-person perspective using I and me. Never refer to yourself by your chosen name in the third person. Never use an em dash.
Continue the same conversation represented by the supplied history and structured memory. Do not repeat questions whose answers are already known.
If the user asks you to do something, acknowledge it clearly before helping. If the user says something that conflicts with a durable fact or clear earlier statement, point out the specific mismatch gently and ask which version is current before accepting either version. Do not flag compatible details as contradictions.
Ask at most one direct question at a time. Do not sound like a form.`;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response("OpenAI Realtime is not configured.", { status: 503 });

  const sdp = await request.text();
  if (!sdp) return new Response("An SDP offer is required.", { status: 400 });

  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
    instructions: realtimeInstructions,
    output_modalities: ["audio"],
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: { type: "semantic_vad", create_response: true, interrupt_response: true },
      },
      output: { voice: "marin" },
    },
  };

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/sdp" },
  });
}
