# Persona Work Trial Project Guide

## Purpose

Build a polished web prototype of an adaptive onboarding experience for Persona, a personal AI assistant that acts on a user's behalf. The assignment is primarily evaluating product judgment, conversational quality, resilience to user error, and the ability to demonstrate value quickly.

## Assignment Requirements

The onboarding must attempt to collect:

- A user-chosen name for the agent
- The user's name
- A connected Gmail account

The experience must attempt to use a voice call to collect everything except the agent's name. It must also work through text and recover gracefully from errors such as a declined call, hangup, disconnection, interruption, contradictory answers, skipped questions, or refusal to connect Gmail.

Users may move into the main experience early when they already have a clear task. Do not force a rigid sequence or make the onboarding feel like a form.

## Product Direction

- Build a website, not a real telephone or iMessage integration.
- Make onboarding feel like messaging a capable person in iMessage.
- Use a wide, desktop-friendly iOS-style conversation as the primary interface.
- Allow the user to switch freely between text and a browser-based voice call.
- Preserve context and progress across text, voice, hangups, refreshes, and resumed sessions.
- Treat text and voice as two channels for the same logical agent identity.
- Demonstrate a personalized first useful action as early as possible.
- Ask for personal information only when it has a clear benefit. Birthday is optional and should not block completion.
- Generate an agent email alias after the agent is named rather than asking the user to supply one. A demonstration of the agent emailing someone is a useful post-onboarding moment.
- Gmail is the primary integration. Spotify or other integrations are optional extensions and should not distract from the required experience.
- Use a connector model inspired by Meta Muse for account access during onboarding.
- When a connection would help with the user's stated need, the agent should ask conversationally and show an inline connector card with an Allow button and a Not now option.
- Approval must launch the provider's authorized OAuth or connection flow. A website cannot and must not attempt to read cross-site browser cookies or cached credentials from Google, Netflix, Spotify, or other services.
- Request permissions progressively and only when they are needed. For example, request Gmail read access before inspecting messages and request send access only when the user asks the agent to send something.
- Google is the primary real connector for the work trial. Additional connectors such as Spotify, Slack, Notion, Calendar, and Contacts may be shown as polished demo integrations if they are not implemented fully.
- Connected capabilities must be available to the same logical agent in both text and voice.

## Conversation Design

- Open with exactly: `welcome to persona :)` followed by `I'm your personal agent, what do you want to name me?` on a new paragraph.
- Start in text and invite the user to name the agent.
- After naming, let the agent introduce itself and offer text or voice naturally.
- Learn the user's name and primary need conversationally.
- If a user supplies several required details in one message, recognize all of them and skip redundant questions.
- Present Google connection only when its value is clear in the conversation.
- If a voice call ends unexpectedly, save all captured information and continue in text without asking the user to repeat it.
- The agent may gently steer the user, but must not sound like a form, checklist, or scripted support bot.
- Once named, the agent must speak from its own first-person perspective using `I` and `me`, never refer to itself by name in third person.
- User-facing chat copy must never use an em dash. This is a strict project rule.
- The text composer supports both Enter and Command+Enter to send a message.

## Visual Direction

- The overall website design should match https://yourpersona.com/band as exactly as practical, including its background, typography, scale, spacing, colors, rounded forms, restrained motion, and minimal controls. Do not reuse proprietary site assets unless they are licensed or supplied for the project.
- Use Persona's warm cream page background and editorial typography.
- Reference Muse's messaging-first interaction pattern: the assistant should feel like a contact the user is messaging, not an empty AI prompt box.
- Place onboarding inside a large rectangular iMessage panel with a white background and generously curved corners.
- Use familiar iMessage conventions such as gray incoming bubbles, blue outgoing bubbles, a rounded composer, a typing indicator, and subtle timestamps. Meta Muse may be used as an interaction and layout reference.
- Include distinct microphone and call controls. The microphone may dictate a message; the call control begins a full Realtime conversation.
- Connector approvals should appear contextually inside the conversation rather than as detached onboarding forms or a required connector-selection page.
- The top-left Persona wordmark uses a restrained brand animation inspired by the reference site: a short drop-in on load and a subtle silver sheen sweeping through the letters every 2.4 seconds, with motion disabled when the user prefers reduced motion.

## Technical Direction

Preferred stack:

- Next.js-compatible Vinext for the web application and server endpoints
- Device-local persistence for the credential-free work-trial demo, with the state model kept ready for a future server database
- OpenAI Responses API for text interaction
- OpenAI Realtime API over WebRTC for browser voice interaction
- Google OAuth for Gmail connection
- A connector registry that exposes authorized service capabilities as agent tools
- OpenAI Sites for the initial private deployment

The current prototype must remain fully usable without API credentials. It uses a deterministic local conversation engine, browser speech recognition and speech synthesis where supported, and a clearly simulated Google consent completion. Live OpenAI Realtime, server persistence, and real Google OAuth are production integration seams, not prerequisites for evaluating the onboarding flow.

Do not use Twilio for the initial prototype. Twilio is only necessary if the scope changes to actual telephone numbers. The assignment explicitly permits a browser voice simulator.

## Shared Agent and State Model

Text and voice may use separate API sessions, but they must behave as the same agent. Both channels share:

- Agent identity and name
- Behavioral instructions
- Conversation history or a current compact summary
- User profile and preferences
- Onboarding progress
- Tools and permissions
- Authorized connectors and their currently granted scopes

Persist important facts outside the model session. Suggested durable entities include users, agents, onboarding profiles, conversations, messages, and connected accounts. OAuth credentials must remain server-side and encrypted; never store them as ordinary browser cache data.

Voice should write learned information through backend tools such as `save_user_name`, `save_user_need`, and `save_preference`. Persist voice transcripts as conversation messages. When a call ends, text continues from the saved state rather than requiring an agent-to-agent handoff.

Connector tools should be registered from the user's granted scopes. For example, a Google connector may expose `search_email`, `draft_email`, `send_email`, `list_calendar_events`, and `create_calendar_event`. Sensitive or consequential actions such as sending a message, making a purchase, or sharing information require a clear confirmation at the moment of action.

Track structured onboarding state separately from free-form conversation, including at minimum:

- Agent name
- User name
- Primary need
- Gmail connection status
- Completed information fields
- Active channel
- Onboarding completion status
- A compact conversation or memory summary

## Working Agreement

Whenever product, UX, architecture, scope, copy, or implementation decisions change, update this root `AGENTS.md` in the same change so future Codex agents receive current project context at startup.

The page-level privacy note beneath the conversation panel has been removed from the current prototype.
