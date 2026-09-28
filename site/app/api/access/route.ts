import { NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessPassword } from "@/lib/access";

export async function POST(request: Request) {
  let password = "";
  try {
    const body = await request.json() as { password?: unknown };
    password = typeof body.password === "string" ? body.password.slice(0, 100) : "";
  } catch {
    return NextResponse.json({ error: "Enter the password to continue." }, { status: 400 });
  }

  const token = await verifyAccessPassword(password);
  if (!token) return NextResponse.json({ error: "That password isn’t right." }, { status: 401 });

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
