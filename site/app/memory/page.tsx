"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Circle, Mail, MessageCircle, Phone } from "lucide-react";
import { ONBOARDING_STORAGE_KEY, type Message, type OnboardingState } from "@/lib/onboarding";

type SavedSession = { profile: OnboardingState; messages: Message[] };

const emptyProfile: OnboardingState = {
  agentName: "",
  userName: "",
  userEmail: "",
  primaryNeed: "",
  callStatus: "not_offered",
  googleStatus: "not_asked",
  onboardingComplete: false,
};

export default function MemoryPage() {
  const [session, setSession] = useState<SavedSession>({ profile: emptyProfile, messages: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSession(JSON.parse(stored) as SavedSession);
      } catch {
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  const { profile, messages } = session;
  const learned = [
    { label: "Agent name", value: profile.agentName, detail: "The identity you chose" },
    { label: "Your name", value: profile.userName, detail: "How I should address you" },
    { label: "Your email", value: profile.userEmail, detail: "The account I should connect with" },
    { label: "What matters now", value: profile.primaryNeed, detail: "The first thing you want help with" },
  ];

  return (
    <main className="memory-page">
      <header className="memory-header">
        <Link className="wordmark memory-wordmark" href="/" aria-label="Return to Persona onboarding">
          <span className="wordmark-base">persona</span>
          <span className="wordmark-sheen" aria-hidden="true">persona</span>
        </Link>
        <Link className="back-link" href="/"><ArrowLeft size={16} />Back to conversation</Link>
      </header>

      <section className="memory-intro">
        <p className="eyebrow">Agent memory</p>
        <h1>What I know about you.</h1>
        <p>This is the working context I use across text and voice. You stay in control of it.</p>
      </section>

      <section className="memory-grid" aria-live="polite">
        <article className="memory-card memory-card-wide">
          <div className="memory-card-heading"><MessageCircle size={19} /><h2>Learned in conversation</h2></div>
          <div className="memory-facts">
            {learned.map((item) => (
              <div className="memory-fact" key={item.label}>
                <span>{item.label}</span>
                <strong>{ready && item.value ? item.value : "Not learned yet"}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="memory-card">
          <div className="memory-card-heading"><Phone size={19} /><h2>Conversation</h2></div>
          <dl className="memory-list">
            <div><dt>Current channel</dt><dd>Text</dd></div>
            <div><dt>Voice status</dt><dd>{profile.callStatus.replaceAll("_", " ")}</dd></div>
            <div><dt>Messages remembered</dt><dd>{messages.length}</dd></div>
          </dl>
        </article>

        <article className="memory-card">
          <div className="memory-card-heading"><Mail size={19} /><h2>Connections</h2></div>
          <div className="connection-row">
            <span className="connection-icon"><Mail size={17} /><CalendarDays size={17} /></span>
            <span><strong>Google</strong><small>Gmail and Calendar</small></span>
            <span className={`memory-status ${profile.googleStatus === "connected" ? "connected" : ""}`}>
              {profile.googleStatus === "connected" ? <Check size={14} /> : <Circle size={11} />}
              {profile.googleStatus.replaceAll("_", " ")}
            </span>
          </div>
        </article>
      </section>

      <p className="memory-footnote">Important actions still require your approval. You can reset this prototype from the conversation.</p>
    </main>
  );
}
