"use client";

import { FormEvent, useState } from "react";

export function PasswordGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "Try that again.";
        setError(message);
        setSubmitting(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Couldn’t unlock the site. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <main className="password-page">
      <form className="password-card" onSubmit={submit}>
        <div className="password-wordmark" aria-label="Persona">persona</div>
        <h1>Enter password</h1>
        <p>This Persona prototype is private.</p>
        <label className="sr-only" htmlFor="site-password">Password</label>
        <input
          id="site-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
        />
        {error ? <p className="password-error" role="alert">{error}</p> : null}
        <button type="submit" disabled={!password || submitting}>
          {submitting ? "Opening…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
