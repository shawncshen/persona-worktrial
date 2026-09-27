import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const voiceMessages = sqliteTable("voice_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  deviceId: text("device_id").notNull(),
  role: text("role", { enum: ["user", "agent"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_voice_messages_session_created").on(table.sessionId, table.createdAt)]);

export const onboardingProfiles = sqliteTable("onboarding_profiles", {
  sessionId: text("session_id").primaryKey(),
  deviceId: text("device_id").notNull(),
  agentName: text("agent_name").notNull().default(""),
  userName: text("user_name").notNull().default(""),
  userEmail: text("user_email").notNull().default(""),
  primaryNeed: text("primary_need").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
