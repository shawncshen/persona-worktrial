"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Phone, Plus } from "lucide-react";

type Message = { id: string; role: "agent" | "user"; text: string };
type OnboardingState = {
  agentName: string;
  userName: string;
  primaryNeed: string;
  callStatus: "not_offered" | "offered" | "declined" | "ended";
  googleStatus: "not_asked" | "offered" | "connected" | "declined";
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

function cleanName(value: string) {
  return value.replace(/[.!?].*$/, "").replace(/^(please\s+)?(call\s+(yourself|you)|your name is|you are|you're)\s+/i, "").trim().split(/\s+/).slice(0, 3).join(" ");
}

function extractFacts(input: string, current: OnboardingState) {
  const next = { ...current };
  const agentMatch = input.match(/(?:call (?:yourself|you)|your name is|you(?:'re| are))\s+([\p{L}\p{N}'-]+)/iu);
  const userMatch = input.match(/(?:i(?:'m| am)|call me|my name is)\s+([\p{L}'-]+)/iu);
  const needMatch = input.match(/(?:need|want|could use)\s+(?:some\s+)?help\s+(?:with\s+)?(.+?)(?:[.!?]|$)/i);
  if (agentMatch?.[1]) next.agentName = cleanName(agentMatch[1]);
  if (userMatch?.[1]) next.userName = cleanName(userMatch[1]);
  if (needMatch?.[1]) next.primaryNeed = needMatch[1].trim();
  if (!next.agentName) {
    const direct = cleanName(input);
    if (direct && direct.length <= 28 && !/\b(help|what|why|how|no|yes)\b/i.test(direct)) next.agentName = direct;
  }
  return next;
}

function nextReply(previous: OnboardingState, next: OnboardingState) {
  const namedNow = !previous.agentName && next.agentName;
  const userNow = !previous.userName && next.userName;
  const needNow = !previous.primaryNeed && next.primaryNeed;
  if (namedNow && userNow && needNow) return `Nice to meet you, ${next.userName}. ${next.agentName} works for me. I can already help with ${next.primaryNeed}. Want to connect Google so I can get started?`;
  if (namedNow) return `${next.agentName} it is. Want to talk for a minute, or keep texting here?`;
  if (!next.agentName) return "I’m listening. What name feels right for me?";
  if (!next.userName) return "What should I call you?";
  if (!next.primaryNeed) return `Good to meet you, ${next.userName}. What’s one thing you wish ${next.agentName} could take off your plate?`;
  if (userNow || needNow) return `Got it. I can help with ${next.primaryNeed}. Want to connect Google so I can make that useful right away?`;
  return "I’ve got you. Tell me a little more about what would make this genuinely useful.";
}

export function PersonaOnboarding() {
  const [profile, setProfile] = useState<OnboardingState>(initialState);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { profile: OnboardingState; messages: Message[] };
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

  const addAgentMessage = (text: string, delay = 620) => {
    setTyping(true);
    window.setTimeout(() => {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text }]);
      setTyping(false);
    }, delay);
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
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

  const keepTexting = () => {
    setProfile((state) => ({ ...state, callStatus: "declined" }));
    addAgentMessage("Totally fine. We can do everything here. What should I call you?", 300);
  };

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
        <button type="button" className="wordmark" onClick={resetDemo} aria-label="Restart Persona onboarding">persona</button>
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
          <button type="button" className="icon-button" aria-label={`Call ${agentLabel}`} disabled={!profile.agentName}><Phone size={19} strokeWidth={1.9} /></button>
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
              <button type="button" className="primary-choice"><Phone size={16} />Call {profile.agentName}</button>
              <button type="button" className="secondary-choice" onClick={keepTexting}>Keep texting</button>
            </div>
          )}
          {showGoogleCard && !typing && (
            <div className="connector-card">
              <div className="google-mark" aria-hidden="true">G</div>
              <div><strong>Connect Google</strong><p>Gmail and Calendar, with your permission</p></div>
              <button type="button">Allow</button>
              <button type="button" className="text-action" onClick={() => setProfile((state) => ({ ...state, googleStatus: "declined" }))}>Not now</button>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={submitText}>
          <button type="button" className="composer-icon" aria-label="More options"><Plus size={21} strokeWidth={1.9} /></button>
          <label className="message-input-wrap">
            <span className="sr-only">Message {agentLabel}</span>
            <input value={input} onChange={(event) => setInput(event.target.value)} type="text" placeholder="Message" aria-label={`Message ${agentLabel}`} autoComplete="off" />
            {input.trim() ? <button type="submit" className="send-button" aria-label="Send message"><ArrowUp size={18} strokeWidth={2.4} /></button> : <button type="button" className="mic-button" aria-label="Dictate a message"><Mic size={19} strokeWidth={1.9} /></button>}
          </label>
        </form>
      </section>

      <p className="privacy-note">Private by design. Yours to control.</p>
    </main>
  );
}
