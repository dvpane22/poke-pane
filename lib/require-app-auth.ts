import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, isAppPasswordEnabled, isAuthenticatedCookie } from "./app-auth";

export async function isRequestAuthenticated() {
  if (!isAppPasswordEnabled()) return true;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  return isAuthenticatedCookie(token);
}

export async function requireAppAuth() {
  if (await isRequestAuthenticated()) return;
  redirect("/login");
}

export async function unauthorizedJsonResponse() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
