import { cookies } from "next/headers";

export const ACCESS_COOKIE = "persona_access";
const ACCESS_PASSWORD = process.env.SITE_PASSWORD || "zach";
const ACCESS_SALT = "persona-worktrial-access-v1";

async function accessToken() {
  const bytes = new TextEncoder().encode(`${ACCESS_SALT}:${ACCESS_PASSWORD}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyAccessPassword(password: string) {
  if (password !== ACCESS_PASSWORD) return null;
  return accessToken();
}

export async function hasPageAccess() {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value === await accessToken();
}

export async function hasRequestAccess(request: Request) {
  const expected = await accessToken();
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").some((part) => {
    const [name, ...value] = part.trim().split("=");
    return name === ACCESS_COOKIE && value.join("=") === expected;
  });
}
