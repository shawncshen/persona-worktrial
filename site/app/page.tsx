import { Mic, Phone, Plus } from "lucide-react";

export default function Home() {
  return (
    <main className="persona-page">
      <header className="site-header">
        <a href="#conversation" className="wordmark" aria-label="Persona home">
          persona
        </a>
        <p>Your personal intelligence</p>
        <button type="button" className="quiet-button">About Persona</button>
      </header>

      <section className="intro-copy" aria-labelledby="page-title">
        <p className="eyebrow">Meet your Persona</p>
        <h1 id="page-title">Let&apos;s make this personal.</h1>
      </section>

      <section id="conversation" className="message-shell" aria-label="Persona onboarding conversation">
        <header className="message-header">
          <div className="contact-avatar" aria-hidden="true"><span>P</span></div>
          <div className="contact-details">
            <strong>Your Persona</strong>
            <span>Here when you need it</span>
          </div>
          <button type="button" className="icon-button" aria-label="Start a voice call">
            <Phone size={19} strokeWidth={1.9} />
          </button>
        </header>

        <div className="message-body" role="log" aria-live="polite">
          <p className="time-label">Today 9:41 AM</p>
          <div className="bubble-row incoming">
            <div className="message-bubble">
              <p>Hi. I&apos;m here to make life a little lighter.</p>
              <p>Before we get started, what should I go by?</p>
            </div>
          </div>
        </div>

        <form className="composer">
          <button type="button" className="composer-icon" aria-label="More options">
            <Plus size={21} strokeWidth={1.9} />
          </button>
          <label className="message-input-wrap">
            <span className="sr-only">Message your Persona</span>
            <input type="text" placeholder="Message" aria-label="Message your Persona" />
            <button type="button" className="mic-button" aria-label="Dictate a message">
              <Mic size={19} strokeWidth={1.9} />
            </button>
          </label>
        </form>
      </section>

      <p className="privacy-note">Private by design. Yours to control.</p>
    </main>
  );
}
