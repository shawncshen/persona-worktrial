"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ONBOARDING_STORAGE_KEY, type OnboardingState } from "@/lib/onboarding";

type SavedSession = { profile: OnboardingState };

const emptyProfile: OnboardingState = {
  agentName: "",
  userName: "",
  userEmail: "",
  primaryNeed: "",
  callStatus: "not_offered",
  onboardingComplete: false,
};

export default function MemoryPage() {
  const [session, setSession] = useState<SavedSession>({ profile: emptyProfile });
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

  const { profile } = session;
  const learned = [
    { label: "Agent name", value: profile.agentName, detail: "The identity you chose" },
    { label: "Your name", value: profile.userName, detail: "How I should address you" },
    { label: "Your email", value: profile.userEmail, detail: "The account I should connect with" },
    { label: "What matters now", value: profile.primaryNeed, detail: "The first thing you want help with" },
  ];

  return (
    <main className="memory-page">
      <header className="memory-header">
        <a className="wordmark memory-wordmark" href="/" aria-label="Return to Persona onboarding">
          <span className="wordmark-base">persona</span>
          <span className="wordmark-sheen" aria-hidden="true">persona</span>
        </a>
        <a className="back-link" href="/"><ArrowLeft size={16} />Back to conversation</a>
      </header>

      <section className="memory-intro">
        <p className="eyebrow">Agent memory</p>
        <h1>What the agent learned from onboarding</h1>
      </section>

      <section className="memory-chart" aria-live="polite" aria-label="What the agent learned">
        <table>
          <thead><tr><th scope="col">Memory</th><th scope="col">What the agent learned</th><th scope="col">How it is used</th></tr></thead>
          <tbody>
            {learned.map((item) => (
              <tr key={item.label}>
                <th scope="row">{item.label}</th>
                <td>{ready && item.value ? item.value : "Not learned yet"}</td>
                <td>{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
