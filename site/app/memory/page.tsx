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
  currentGoal: "",
  nextStep: "",
  pendingCommitment: "",
  awaitingUserInput: "",
};

export default function MemoryPage() {
  const [session, setSession] = useState<SavedSession>({ profile: emptyProfile });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const timer = window.setTimeout(() => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as SavedSession;
          setSession({ profile: { ...emptyProfile, ...parsed.profile } });
        } catch {
          window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
        }
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const { profile } = session;
  const aliasLocalPart = profile.agentName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 32);
  const learned = [
    { label: "Agent name", value: profile.agentName, detail: "The identity you chose" },
    { label: "Agent email", value: aliasLocalPart ? `${aliasLocalPart}@yourpersona.com` : "", detail: "Generated automatically after naming" },
    { label: "Your name", value: profile.userName, detail: "How I should address you" },
    { label: "Your email", value: profile.userEmail, detail: "Saved to your profile memory" },
    { label: "What matters now", value: profile.primaryNeed, detail: "The first thing you want help with" },
    { label: "Current goal", value: profile.currentGoal, detail: "The outcome I’m helping move forward" },
    { label: "Next step", value: profile.nextStep, detail: "The next concrete move" },
    { label: "My commitment", value: profile.pendingCommitment, detail: "What I promised to follow through on" },
    { label: "Waiting for", value: profile.awaitingUserInput, detail: "The one input I still need from you" },
  ];

  return (
    <main className="memory-page">
      <header className="memory-header">
        {/* Use a document navigation here so returning never waits on an RSC soft-navigation request. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="wordmark memory-wordmark" href="/" aria-label="Return to Persona onboarding">
          <span className="wordmark-base">persona</span>
          <span className="wordmark-sheen" aria-hidden="true">persona</span>
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
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
