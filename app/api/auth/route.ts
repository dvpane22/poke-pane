import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCookieValue, isAppPasswordEnabled } from "../../../lib/app-auth";

export async function POST(request: Request) {
  if (!isAppPasswordEnabled()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const expected = process.env.APP_PASSWORD?.trim() ?? "";

  if (!password || password !== expected) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const token = await authCookieValue();
  if (!token) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}
