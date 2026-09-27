import { env } from "cloudflare:workers";
import type { Message, OnboardingState } from "@/lib/onboarding";

type VoiceIdentity = { deviceId: string; sessionId: string };

function database() {
  if (!env.DB) throw new Error("Voice persistence is unavailable.");
  return env.DB;
}

export async function saveVoiceMessage(identity: VoiceIdentity, message: Message) {
  await database().prepare(`
    INSERT OR IGNORE INTO voice_messages (id, session_id, device_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(message.id, identity.sessionId, identity.deviceId, message.role, message.text, Date.now()).run();
}

export async function saveVoiceSnapshot(identity: VoiceIdentity, messages: Message[], profile: OnboardingState) {
  const db = database();
  const now = Date.now();
  const statements = messages.map((message, index) => db.prepare(`
    INSERT OR IGNORE INTO voice_messages (id, session_id, device_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(message.id, identity.sessionId, identity.deviceId, message.role, message.text, now + index));
  statements.push(db.prepare(`
    INSERT INTO onboarding_profiles (session_id, device_id, agent_name, user_name, user_email, primary_need, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      device_id = excluded.device_id,
      agent_name = excluded.agent_name,
      user_name = excluded.user_name,
      user_email = excluded.user_email,
      primary_need = excluded.primary_need,
      updated_at = excluded.updated_at
  `).bind(identity.sessionId, identity.deviceId, profile.agentName, profile.userName, profile.userEmail, profile.primaryNeed, now));
  await db.batch(statements);
}
