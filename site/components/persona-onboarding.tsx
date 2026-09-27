"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, CalendarDays, Check, Mail, Mic, Phone, PhoneOff, Plus, ShieldCheck } from "lucide-react";
import { mergeAgentTurn, ONBOARDING_STORAGE_KEY, type AgentTurn, type Message, type OnboardingState } from "@/lib/onboarding";

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

const initialMessages: Message[] = [{
  id: "welcome",
  role: "agent",
  text: "welcome to persona :)\n\nI'm your personal agent, what do you want to name me?",
}];
const initialState: OnboardingState = {
  agentName: "", userName: "", primaryNeed: "", callStatus: "not_offered", googleStatus: "not_asked",
};
const DEVICE_STORAGE_KEY = "persona-device-id";

function MessageText({ text }: { text: string }) {
  const lines = text.replace(/\s+•\s*/g, "\n• ").split("\n");
  const blocks: Array<{ type: "paragraph" | "list"; content: string[] }> = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (/^[•*-]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[•*-]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[•*-]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", content: items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^[•*-]\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", content: [paragraph.join(" ")] });
  }

  return <>{blocks.map((block, index) => block.type === "list"
    ? <ul key={`list-${index}`}>{block.content.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
    : <p key={`paragraph-${index}`}>{block.content[0]}</p>)}</>;
}

export function PersonaOnboarding() {
  const [profile, setProfile] = useState<OnboardingState>(initialState);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [, setCallListening] = useState(false);
  const [callError, setCallError] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const [, setCallCaption] = useState("");
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [connectorBusy, setConnectorBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef<Message[]>(initialMessages);
  const profileRef = useRef<OnboardingState>(initialState);
  const voiceMessagesRef = useRef<Message[]>([]);
  const voiceIdentityRef = useRef({ deviceId: "", sessionId: "" });
  const liveTranscriptRef = useRef("");

  useEffect(() => {
    let deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    voiceIdentityRef.current.deviceId = deviceId;
    const saved = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { profile: OnboardingState; messages: Message[] };
        // Hydrate the durable demo state after the client mounts.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProfile(parsed.profile);
        setMessages(parsed.messages);
      } catch { window.localStorage.removeItem(ONBOARDING_STORAGE_KEY); }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ profile, messages }));
  }, [messages, profile, ready]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (!callActive) return;
    const timer = window.setInterval(() => setCallSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callActive]);

  const addAgentMessage = (text: string, delay = 620) => {
    setTyping(true);
    window.setTimeout(() => {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text }]);
      setTyping(false);
    }, delay);
  };

  const requestAgentTurn = async (nextMessages: Message[], currentProfile: OnboardingState, channel: "text" | "voice") => {
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages, profile: currentProfile, channel }),
    });
    if (!response.ok) throw new Error("Agent response failed");
    return await response.json() as AgentTurn;
  };

  const sendText = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || typing) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text };
    const nextMessages = [...messages, userMessage];
    setInput("");
    setMessages(nextMessages);
    setTyping(true);
    window.requestAnimationFrame(() => {
      shellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    try {
      const turn = await requestAgentTurn(nextMessages, profile, "text");
      setProfile((current) => mergeAgentTurn(current, turn));
      setMessages((items) => [
        ...items.map((message) => turn.acknowledgedTask && message.id === userMessage.id ? { ...message, reaction: turn.reaction || "👍" } : message),
        { id: crypto.randomUUID(), role: "agent", text: turn.reply },
      ]);
    } catch {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text: "I lost my train of thought for a second. Try sending that again?" }]);
    } finally {
      setTyping(false);
    }
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    void sendText(input);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const keepTexting = () => {
    setProfile((state) => ({ ...state, callStatus: "declined" }));
    addAgentMessage("Totally fine. We can do everything here. What should I call you?", 300);
  };

  const startCall = () => {
    voiceMessagesRef.current = [];
    voiceIdentityRef.current.sessionId = crypto.randomUUID();
    setCallOpen(true);
    setCallActive(false);
    setCallSeconds(0);
    setCallError("");
    setCallCaption("");
  };

  const persistVoiceMessage = async (message: Message) => {
    const response = await fetch("/api/onboarding/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...voiceIdentityRef.current, message }),
    });
    if (!response.ok) throw new Error("Voice message persistence failed");
  };

  const saveVoiceMemory = async (voiceMessages: Message[]) => {
    try {
      const response = await fetch("/api/onboarding/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: voiceMessages, profile: profileRef.current, ...voiceIdentityRef.current }),
      });
      if (!response.ok) throw new Error("Voice memory persistence failed");
      const turn = await response.json() as Omit<AgentTurn, "reply">;
      setProfile((current) => mergeAgentTurn(current, { ...turn, reply: "" }));
    } catch { setCallError("The call is still active, but I couldn’t save this turn yet."); }
  };

  const answerCall = async () => {
    setCallError("");
    setCallCaption("Connecting securely…");
    try {
      const peer = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      peer.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const channel = peer.createDataChannel("oai-events");

      peerRef.current = peer;
      dataChannelRef.current = channel;
      microphoneRef.current = stream;
      remoteAudioRef.current = audio;

      channel.addEventListener("message", (event) => {
        const serverEvent = JSON.parse(event.data) as { type?: string; transcript?: string; delta?: string; error?: { message?: string } };
        if (serverEvent.type === "conversation.item.input_audio_transcription.completed" && serverEvent.transcript?.trim()) {
          const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: serverEvent.transcript.trim() };
          voiceMessagesRef.current = [...voiceMessagesRef.current, userMessage];
          void persistVoiceMessage(userMessage).catch(() => setCallError("The call is still active, but I couldn’t save this turn yet."));
        }
        if (serverEvent.type === "response.output_audio_transcript.delta") {
          liveTranscriptRef.current += serverEvent.delta || "";
          setCallCaption(liveTranscriptRef.current);
        }
        if (serverEvent.type === "response.output_audio_transcript.done") {
          const transcript = (serverEvent.transcript || liveTranscriptRef.current).trim();
          liveTranscriptRef.current = "";
          if (!transcript) return;
          setCallCaption(transcript);
          const agentMessage: Message = { id: crypto.randomUUID(), role: "agent", text: transcript };
          voiceMessagesRef.current = [...voiceMessagesRef.current, agentMessage];
          void persistVoiceMessage(agentMessage).catch(() => setCallError("The call is still active, but I couldn’t save this turn yet."));
          void saveVoiceMemory(voiceMessagesRef.current);
        }
        if (serverEvent.type === "error") setCallError(serverEvent.error?.message || "The live call hit an error. You can continue by text.");
      });

      channel.addEventListener("open", () => {
        setCallActive(true);
        setCallListening(true);
        setCallCaption("Listening…");
        messagesRef.current.slice(-24).forEach((message) => channel.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: message.role === "agent" ? "assistant" : "user",
            content: [{ type: message.role === "agent" ? "output_text" : "input_text", text: message.text }],
          },
        })));
        const greeting = profileRef.current.userName
          ? `Say exactly: "Hey ${profileRef.current.userName}, it’s ${profileRef.current.agentName}. Let’s continue where we left off."`
          : `Say exactly: "Hey, it’s ${profileRef.current.agentName}. What should I call you, and what could you use a hand with?"`;
        channel.send(JSON.stringify({ type: "response.create", response: { instructions: greeting } }));
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/realtime", { method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!response.ok) throw new Error(await response.text());
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch {
      microphoneRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
      setCallError("I couldn’t start the live call. Check microphone access, or keep going by text.");
      setCallCaption("");
    }
  };

  useEffect(() => {
    if (!callOpen || callActive || peerRef.current) return;
    void answerCall();
  }, [callActive, callOpen]);

  const endCall = () => {
    dataChannelRef.current?.close();
    peerRef.current?.close();
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    dataChannelRef.current = null;
    peerRef.current = null;
    microphoneRef.current = null;
    remoteAudioRef.current = null;
    setCallOpen(false);
    setCallActive(false);
    setCallListening(false);
    setProfile((state) => ({ ...state, callStatus: "ended" }));
    if (voiceMessagesRef.current.length) void saveVoiceMemory(voiceMessagesRef.current);
  };

  const allowGoogle = () => {
    setConnectorBusy(true);
    window.setTimeout(() => {
      setProfile((state) => ({ ...state, googleStatus: "connected" }));
      setConnectorBusy(false);
      setConnectorOpen(false);
      addAgentMessage(`You’re connected. I can now help with ${profile.primaryNeed || "your inbox and calendar"}. Want me to show you where I’d start?`, 350);
    }, 900);
  };

  const declineGoogle = () => {
    setProfile((state) => ({ ...state, googleStatus: "declined" }));
    addAgentMessage("No problem. I can still help from anything you share here, and you can connect later if you want.", 300);
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool({
      name: "send_onboarding_message",
      title: "Message Persona",
      description: "Send a message through the visible Persona onboarding conversation.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string", minLength: 1, maxLength: 500 } },
        required: ["message"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(value) {
        const message = typeof value === "object" && value !== null && "message" in value ? String((value as { message: unknown }).message).trim() : "";
        if (!message || message.length > 500) throw new Error("Message must contain 1 to 500 characters.");
        void sendText(message);
        return { accepted: true, agentName: profile.agentName || null };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  // The tool is intentionally re-registered whenever its state snapshot changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, typing]);

  const resetDemo = () => {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    setProfile(initialState);
    setMessages(initialMessages);
    setInput("");
  };

  const showCallChoices = profile.callStatus === "offered" && !profile.userName;
  const showGoogleCard = profile.googleStatus === "offered";
  const agentLabel = profile.agentName || "Your Persona";

  return (
    <main className="persona-page">
      <header className="site-header">
        <button type="button" className="wordmark" onClick={resetDemo} aria-label="Restart Persona onboarding">
          <span className="wordmark-base">persona</span>
          <span className="wordmark-sheen" aria-hidden="true">persona</span>
        </button>
        <div className="header-actions">
          <Link className="memory-link" href="/memory">What I know</Link>
        </div>
      </header>

      <section className="intro-copy" aria-labelledby="page-title">
        <h1 id="page-title">
          <span>First AI assistant you can wear.</span>
          <span>Made to get sh*t done.</span>
        </h1>
        <p>Your Persona remembers what matters and does<br className="desktop-break" /> what you need before you know you need it.</p>
      </section>

      <section id="conversation" className="message-shell" aria-label="Persona onboarding conversation" ref={shellRef}>
        <header className="message-header">
          <button type="button" className="chat-reset-button" onClick={resetDemo}>Start over</button>
          <div className="contact-identity">
            <div className="contact-avatar" aria-hidden="true"><img src="/agent-avatar.png" alt="" /></div>
            <strong>{agentLabel}</strong>
          </div>
          <button type="button" className="icon-button" aria-label={`Call ${agentLabel}`} disabled={!profile.agentName} onClick={startCall}><Phone size={19} strokeWidth={1.9} /></button>
        </header>

        <div className="message-body" role="log" aria-live="polite" ref={scrollRef}>
          <p className="time-label">Today 9:41 AM</p>
          {messages.map((message) => (
            <div key={message.id} className={`bubble-row ${message.role === "user" ? "outgoing" : "incoming"}`}>
              <div className="message-bubble-wrap">
                <div className="message-bubble"><MessageText text={message.text} /></div>
                {message.reaction && <span className="message-reaction" aria-label={`Agent reacted with ${message.reaction === "thumbs_up" ? "thumbs up" : message.reaction}`}>{message.reaction === "thumbs_up" ? "👍" : message.reaction}</span>}
              </div>
            </div>
          ))}
          {typing && <div className="bubble-row incoming" aria-label={`${agentLabel} is typing`}><div className="typing-bubble"><span /><span /><span /></div></div>}
          {showCallChoices && !typing && (
            <div className="choice-row" aria-label="Choose how to continue">
              <button type="button" className="primary-choice" onClick={startCall}><Phone size={16} />Call {profile.agentName}</button>
              <button type="button" className="secondary-choice" onClick={keepTexting}>Keep texting</button>
            </div>
          )}
          {showGoogleCard && !typing && (
            <div className="connector-card">
              <div className="google-mark" aria-hidden="true">G</div>
              <div><strong>Connect Google</strong><p>Gmail and Calendar, with your permission</p></div>
              <button type="button" onClick={() => setConnectorOpen(true)}>Allow</button>
              <button type="button" className="text-action" onClick={declineGoogle}>Not now</button>
            </div>
          )}
          {profile.googleStatus === "connected" && (
            <div className="connected-card"><Check size={16} /><span>Google connected</span></div>
          )}
        </div>

        <form className="composer" onSubmit={submitText}>
          <button type="button" className="composer-icon" aria-label="More options"><Plus size={21} strokeWidth={1.9} /></button>
          <label className="message-input-wrap">
            <span className="sr-only">Message {agentLabel}</span>
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKeyDown} type="text" placeholder="Message" aria-label={`Message ${agentLabel}`} autoComplete="off" />
            {input.trim() ? <button type="submit" className="send-button" aria-label="Send message"><ArrowUp size={18} strokeWidth={2.4} /></button> : <button type="button" className="mic-button" aria-label="Dictate a message"><Mic size={19} strokeWidth={1.9} /></button>}
          </label>
        </form>
      </section>

      {callOpen && (
        <div className="call-backdrop" role="dialog" aria-modal="true" aria-label={`Voice call with ${agentLabel}`}>
          <div className="call-panel">
            <div className="call-aura" aria-hidden="true"><img src="/agent-avatar.png" alt="" /></div>
            <h2>{agentLabel}</h2>
            <p className="call-status">{callActive ? `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}` : "calling…"}</p>
            {callError && <p className="call-error" role="alert">{callError}</p>}
            <div className="active-call-actions">
              <button type="button" className="hangup-control" aria-label="Hang up" onClick={endCall}><PhoneOff size={25} /></button>
            </div>
          </div>
        </div>
      )}

      {connectorOpen && (
        <div className="connector-backdrop" role="dialog" aria-modal="true" aria-label="Connect Google">
          <div className="permission-panel">
            <div className="permission-brand"><span>G</span></div>
            <p className="permission-kicker">Connect Google</p>
            <h2>Let {agentLabel} help where it matters.</h2>
            <p className="permission-lede">Start with read access. Sending or changing anything will always require another clear approval.</p>
            <div className="permission-list">
              <div><Mail size={20} /><span><strong>Gmail</strong><small>Find messages and prepare drafts</small></span></div>
              <div><CalendarDays size={20} /><span><strong>Calendar</strong><small>See events and scheduling conflicts</small></span></div>
              <div><ShieldCheck size={20} /><span><strong>You stay in control</strong><small>Remove access whenever you want</small></span></div>
            </div>
            <button type="button" className="allow-google" onClick={allowGoogle} disabled={connectorBusy}>{connectorBusy ? "Connecting…" : "Allow read access"}</button>
            <button type="button" className="cancel-google" onClick={() => setConnectorOpen(false)} disabled={connectorBusy}>Not now</button>
          </div>
        </div>
      )}
    </main>
  );
}
