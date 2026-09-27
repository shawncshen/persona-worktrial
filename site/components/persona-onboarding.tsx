"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarDays, Check, Mail, Mic, MicOff, Phone, PhoneOff, Plus, ShieldCheck, Volume2 } from "lucide-react";
import { extractFacts, nextReply, type Message, type OnboardingState } from "@/lib/onboarding";

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

const STORAGE_KEY = "persona-onboarding-v1";
const initialMessages: Message[] = [{
  id: "welcome",
  role: "agent",
  text: "Hi. I’m here to make life a little lighter.\n\nBefore we get started, what should I go by?",
}];
const initialState: OnboardingState = {
  agentName: "", userName: "", primaryNeed: "", callStatus: "not_offered", googleStatus: "not_asked",
};

export function PersonaOnboarding() {
  const [profile, setProfile] = useState<OnboardingState>(initialState);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callListening, setCallListening] = useState(false);
  const [callError, setCallError] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const [callCaption, setCallCaption] = useState("");
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [connectorBusy, setConnectorBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { profile: OnboardingState; messages: Message[] };
        // Hydrate the durable demo state after the client mounts.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProfile(parsed.profile);
        setMessages(parsed.messages);
      } catch { window.localStorage.removeItem(STORAGE_KEY); }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, messages }));
  }, [messages, profile, ready]);

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

  const sendText = (rawText: string) => {
    const text = rawText.trim();
    if (!text || typing) return;
    const next = extractFacts(text, profile);
    const shouldOfferGoogle = Boolean(next.userName && next.primaryNeed && profile.googleStatus === "not_asked");
    setInput("");
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text }]);
    setProfile({
      ...next,
      callStatus: next.agentName && next.callStatus === "not_offered" ? "offered" : next.callStatus,
      googleStatus: shouldOfferGoogle ? "offered" : next.googleStatus,
    });
    addAgentMessage(nextReply(profile, next));
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    sendText(input);
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

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1.03;
    window.speechSynthesis.speak(utterance);
  };

  const startCall = () => {
    setCallOpen(true);
    setCallActive(false);
    setCallSeconds(0);
    setCallError("");
    setCallCaption("");
  };

  const answerCall = () => {
    setCallActive(true);
    const greeting = profile.userName
      ? `Hey ${profile.userName}, it’s ${profile.agentName}. I remember where we left off. What would you like to focus on?`
      : `Hey, it’s ${profile.agentName}. What should I call you, and what could you use a hand with?`;
    setCallCaption(greeting);
    speak(greeting);
  };

  const captureVoice = () => {
    type SpeechResult = { 0: { transcript: string } };
    type Recognition = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
    };
    const voiceWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const VoiceRecognition = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!VoiceRecognition) {
      setCallError("Voice input is not available in this browser. You can keep going by text.");
      return;
    }
    const recognition = new VoiceRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    setCallListening(true);
    setCallError("");
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      const next = extractFacts(transcript, profile);
      setProfile({ ...next, callStatus: "ended", googleStatus: next.userName && next.primaryNeed ? "offered" : next.googleStatus });
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text: transcript }]);
      const reply = nextReply(profile, next);
      setCallCaption(reply);
      speak(reply);
    };
    recognition.onerror = () => setCallError("I couldn’t hear that clearly. Try again, or keep going by text.");
    recognition.onend = () => setCallListening(false);
    recognition.start();
  };

  const endCall = () => {
    window.speechSynthesis?.cancel();
    const learned = [profile.userName && `your name is ${profile.userName}`, profile.primaryNeed && `you want help with ${profile.primaryNeed}`].filter(Boolean).join(" and ");
    setCallOpen(false);
    setCallActive(false);
    setCallListening(false);
    setProfile((state) => ({ ...state, callStatus: "ended" }));
    addAgentMessage(learned ? `Good talking with you. I saved that ${learned}. We can keep going here.` : "Looks like we got cut off. No worries. We can keep going here, or call again anytime.", 250);
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
        sendText(message);
        return { accepted: true, agentName: profile.agentName || null };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  // The tool is intentionally re-registered whenever its state snapshot changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, typing]);

  const resetDemo = () => {
    window.localStorage.removeItem(STORAGE_KEY);
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
        <p>Your personal intelligence</p>
        <button type="button" className="quiet-button" onClick={resetDemo}>Start over</button>
      </header>

      <section className="intro-copy" aria-labelledby="page-title">
        <p className="eyebrow">Meet your Persona</p>
        <h1 id="page-title">Let&apos;s make this personal.</h1>
      </section>

      <section id="conversation" className="message-shell" aria-label="Persona onboarding conversation">
        <header className="message-header">
          <div className="contact-avatar" aria-hidden="true"><span>{profile.agentName ? profile.agentName[0].toUpperCase() : "P"}</span></div>
          <div className="contact-details"><strong>{agentLabel}</strong><span>{typing ? "Typing…" : "Here when you need it"}</span></div>
          <button type="button" className="icon-button" aria-label={`Call ${agentLabel}`} disabled={!profile.agentName} onClick={startCall}><Phone size={19} strokeWidth={1.9} /></button>
        </header>

        <div className="message-body" role="log" aria-live="polite" ref={scrollRef}>
          <p className="time-label">Today 9:41 AM</p>
          {messages.map((message) => (
            <div key={message.id} className={`bubble-row ${message.role === "user" ? "outgoing" : "incoming"}`}>
              <div className="message-bubble">{message.text.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
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
            <div className="call-aura" aria-hidden="true"><span>{profile.agentName ? profile.agentName[0].toUpperCase() : "P"}</span></div>
            <p className="call-kicker">{callActive ? "Persona voice" : "Incoming call"}</p>
            <h2>{agentLabel}</h2>
            <p className="call-status">{callActive ? `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}` : "Wants to get to know you"}</p>
            {callActive && callCaption && <div className="live-caption"><Volume2 size={16} /><p>{callCaption}</p></div>}
            {callError && <p className="call-error" role="alert">{callError}</p>}
            {!callActive ? (
              <div className="incoming-actions">
                <button type="button" className="decline-call" onClick={endCall}><PhoneOff size={21} /><span>Decline</span></button>
                <button type="button" className="answer-call" onClick={answerCall}><Phone size={22} /><span>Answer</span></button>
              </div>
            ) : (
              <div className="active-call-actions">
                <button type="button" className={callListening ? "voice-control listening" : "voice-control"} onClick={captureVoice} disabled={callListening}>
                  {callListening ? <MicOff size={22} /> : <Mic size={22} />}
                  <span>{callListening ? "Listening" : "Speak"}</span>
                </button>
                <button type="button" className="hangup-control" onClick={endCall}><PhoneOff size={22} /><span>End</span></button>
              </div>
            )}
            <button type="button" className="continue-text" onClick={endCall}>Continue by text</button>
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
