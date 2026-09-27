# Persona Work Trial Project Guide

## Purpose

Build a polished web prototype of an adaptive onboarding experience for Persona, a personal AI assistant that acts on a user's behalf. The assignment is primarily evaluating product judgment, conversational quality, resilience to user error, and the ability to demonstrate value quickly.

## Assignment Requirements

The onboarding must attempt to collect:

- A user-chosen name for the agent
- The user's name
- The user's email address, stored as profile memory without connecting Google

The experience must attempt to use a voice call to collect the onboarding details, including the agent's name when it is still unknown. It must also work through text and recover gracefully from errors such as a declined call, hangup, disconnection, interruption, contradictory answers, skipped questions, or refusal to provide information.

Users may move into the main experience early when they already have a clear task. Do not force a rigid sequence or make the onboarding feel like a form.

## Product Direction

- Build a website, not a real telephone or iMessage integration.
- Make onboarding feel like messaging a capable person in iMessage.
- Use a wide, desktop-friendly iOS-style conversation as the primary interface.
- Allow the user to switch freely between text and a browser-based voice call.
- Keep the call control available from the first render, before the user names the agent. A pre-name call uses the generic `Your Persona` identity, collects the user's name, email, and need, and leaves agent naming to text.
- Preserve context and progress across text, voice, hangups, refreshes, and resumed sessions.
- Treat text and voice as two channels for the same logical agent identity.
- Demonstrate a personalized first useful action as early as possible.
- Include a separate evaluator-friendly memory page that transparently shows what the agent has learned and the shared conversation state.
- Ask for personal information only when it has a clear benefit. Birthday is optional and should not block completion.
- Generate an agent email alias after the agent is named rather than asking the user to supply one. A demonstration of the agent emailing someone is a useful post-onboarding moment.
- Do not show or implement a Google/Gmail connection flow in the current prototype. Collect and remember the user's email address conversationally instead.

## Conversation Design

- Open with exactly: `welcome to persona :)` followed by `I'm your personal agent, what do you want to name me?` on a new paragraph.
- Start in text and invite the user to name the agent. If the user starts a call before naming it, the voice agent must ask what the user wants to name it before collecting other onboarding details.
- After naming, let the agent introduce itself and offer text or voice naturally.
- Learn the user's name, email address, and primary need conversationally. Ask for the email naturally and never invent or infer it.
- If a user supplies several required details in one message, recognize all of them and skip redundant questions.
- If the user goes off-topic while onboarding is incomplete, answer their question or request first, then send a second, separate agent message that gently returns to onboarding and asks for exactly one missing detail. Never combine the answer and redirect in one bubble, never ask for a known detail, and do not redirect after onboarding is complete.
- If a voice call ends unexpectedly, save all captured information and continue in text without asking the user to repeat it.
- The agent may gently steer the user, but must not sound like a form, checklist, or scripted support bot.
- Once named, the agent must speak from its own first-person perspective using `I` and `me`, never refer to itself by name in third person.
- When resuming a voice conversation with known names, say `Hey [user], it’s [agent]. Let’s continue where we left off.`
- If a new statement conflicts with durable memory or a clear earlier statement, identify the mismatch conversationally and ask which version is current before changing memory. Do not treat harmless elaborations or compatible facts as contradictions.
- When a user explicitly asks the agent to do something, add a thumbs-up reaction to that user message only when the model's reply acknowledges or accepts the task. Do not react to ordinary answers or unaccepted requests.
- Announce `You're done with onboarding. Let me know if you need anything from me!` exactly once after the agent has a name, knows the user's name, email address, and primary need, and has attempted to offer or complete a voice call.
- User-facing chat copy must never use an em dash. This is a strict project rule.
- The text composer supports both Enter and Command+Enter to send a message.
- The composer plus button opens the native device picker for photos and common files, including on phones. Show removable previews before sending and render selected attachments in the outgoing iMessage bubble. The current prototype shares attachment names and media types with the agent, not file contents, and must not pretend it inspected the contents.

## Visual Direction

- The overall website design should match https://yourpersona.com/band as exactly as practical, including its background, typography, scale, spacing, colors, rounded forms, restrained motion, and minimal controls. Do not reuse proprietary site assets unless they are licensed or supplied for the project.
- Use Persona's warm cream page background and editorial typography.
- Reference Muse's messaging-first interaction pattern: the assistant should feel like a contact the user is messaging, not an empty AI prompt box.
- Place onboarding inside a large rectangular iMessage panel with a white background and generously curved corners.
- Use familiar iMessage conventions such as gray incoming bubbles, blue outgoing bubbles, a rounded composer, a typing indicator, and subtle timestamps. Meta Muse may be used as an interaction and layout reference.
- Include distinct microphone and call controls. The microphone may dictate a message; the call control begins a full Realtime conversation.
- The top-left Persona wordmark uses a restrained brand animation inspired by the reference site: a short drop-in on load and a subtle silver sheen sweeping through the letters every 2.4 seconds, with motion disabled when the user prefers reduced motion.

## Technical Direction

Preferred stack:

- Next.js-compatible Vinext for the web application and server endpoints
- Device-local persistence for the credential-free work-trial demo, with the state model kept ready for a future server database
- OpenAI Responses API for text interaction
- OpenAI Realtime API over WebRTC for browser voice interaction
- OpenAI Sites for the initial private deployment

Voice calls use the OpenAI Realtime API over WebRTC for genuine low-latency speech-to-speech conversation. The standard API key remains server-side in the Site environment. Voice transcripts are distilled into the same durable onboarding memory used by text.

Do not use Twilio for the initial prototype. Twilio is only necessary if the scope changes to actual telephone numbers. The assignment explicitly permits a browser voice simulator.

The onboarding conversation is model-driven through the OpenAI Responses API with Structured Outputs. The model returns both a natural reply and a structured memory update plus the next suggested interface action. Do not reintroduce a deterministic question tree as the main conversation engine.

All Responses API calls use `service_tier: "fast"` so text replies and voice-memory extraction opt into OpenAI Fast mode. Realtime WebRTC calls keep their native low-latency configuration.

## Shared Agent and State Model

Text and voice may use separate API sessions, but they must behave as the same agent. Both channels share:

- Agent identity and name
- Behavioral instructions
- Conversation history or a current compact summary
- User profile and preferences
- Onboarding progress
- Tools and permissions

Persist important facts outside the model session. Suggested durable entities include users, agents, onboarding profiles, conversations, messages, and connected accounts. OAuth credentials must remain server-side and encrypted; never store them as ordinary browser cache data.

Voice should write learned information through backend tools such as `save_user_name`, `save_user_need`, and `save_preference`. Persist voice transcripts as conversation messages. When a call ends, text continues from the saved state rather than requiring an agent-to-agent handoff.

Track structured onboarding state separately from free-form conversation, including at minimum:

- Agent name
- User name
- User email
- Primary need
- Completed information fields
- Active channel
- Onboarding completion status
- A compact conversation or memory summary

## Working Agreement

Whenever product, UX, architecture, scope, copy, or implementation decisions change, update this root `AGENTS.md` in the same change so future Codex agents receive current project context at startup.

The page-level privacy note beneath the conversation panel has been removed from the current prototype.

Voice calls and text chat are separate presentation channels. Realtime voice transcripts must not be appended to the visible text thread or followed by a text recap. Persist the full voice transcript and the latest structured onboarding profile in server-side D1 storage; the call overlay may show only the current live caption. Text chat remains device-local for the credential-free demo.

Realtime voice uses the `cedar` voice. Its speaking style is warm, relaxed, casually confident, and concise, like a capable friend in an iMessage conversation. Use contractions and everyday language, vary acknowledgements, speak at a natural pace with brief pauses, and usually answer in one or two short sentences. A small natural laugh is acceptable only when it genuinely eases the mood; never force it, overuse it, or use it around serious or sensitive content.

Voice startup must expose distinct microphone-permission, connecting, active, and failed states. The hang-up control remains available throughout startup. Permission and connection waits must time out with useful recovery copy, and a canceled or stale attempt must never connect later.

When a voice call ends before onboarding is complete, the agent immediately continues in text by asking the next unanswered onboarding question. Use the freshly persisted voice memory so the agent never asks for information the user already supplied on the call.

If a user jokes, trolls, or gives an obviously unserious answer during a call, the voice agent may respond with one brief natural laugh or playful acknowledgement, then returns in the same response to the pending onboarding question. It must not lecture, argue, or lose the onboarding thread.

Durable `primary_need` memory is one compact description of the user's ongoing need, capped at 160 characters. It must not accumulate transcripts, completed actions, recaps, or activity logs, and it stays in the user's conversational language unless the user changes languages.

Message reactions are reserved for accepted actions. Refusals, inability statements, hypotheticals, ordinary conversation, and unperformed workarounds receive no reaction. Accepted actions use 👍 by default, with one more contextually obvious emoji allowed when it clearly fits the task, such as 🎂 for an accepted birthday request.

The “Restart session” control lives in the top-left of the conversation header, opposite the call control, while the agent identity remains centered. It is no longer shown in the page-level header. Present it as a comfortably sized rounded white button with a black outline. On hover, use a restrained light-gray fill, subtle shadow, and one-pixel lift.

The page canvas uses a uniform bright white background. Keep the chat panel, message bubbles, controls, and their existing colors and shadows unchanged.

The header tagline “Your personal intelligence” and the intro eyebrow “Meet your Persona” have been removed to keep the first viewport more minimal.

The onboarding hero now mirrors the Persona Band reference typography and copy: “First AI assistant you can wear. Made to get sh*t done.” followed by “Your Persona remembers what matters and does what you need before you know you need it.” Use the system/SF Pro display stack, medium weight, tight tracking, and 1.06 line height for the headline.

Keep the header actions aligned to the far-right edge, opposite the Persona wordmark. Keep the hero compact near the top of the page. Whenever a user sends a text message, smoothly center the complete conversation panel in the viewport so the chat becomes the visual focus.

Keep the hero headline and supporting copy slightly smaller than the Persona Band reference so the conversation panel begins higher in the viewport. Desktop headline sizing should top out around 68px, with tighter vertical margins and a 16px supporting line.

The conversation header centers the agent identity in an iMessage-style stack: an original cute robot avatar with the chosen agent name directly underneath. Do not show the “Here when you need it” subtitle. Keep the call control aligned on the right.

Style the inline “Call” and “Keep texting” choices like native iMessage actions. Use Apple blue with white text for the primary call action and soft iMessage gray with dark text for the secondary action. Avoid black-and-white button treatments.

Opening a voice call is an outgoing call from the user to the agent, never an incoming call. Show an iPhone-style active call stage with the agent avatar, chosen name, connection state or elapsed call timer, and only one centered red hang-up button at the bottom. Do not show answer, decline, mute, “wants to get to know you,” continue-by-text, or visible transcript copy in the call stage.

Chat messages must render bullet content as semantic lists. Each bullet appears on its own line with clear indentation and vertical spacing, including when model output supplies inline bullet separators.

The evaluator memory page is titled “What the agent learned from onboarding.” Present learned onboarding fields in one clean table-style chart rather than separate cards. Do not show the Conversation statistics card or the approval/reset footnote.

Use the official Persona loop mark from the public Persona Band favicon as the website favicon instead of the earlier letter “P” icon.
