import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isAppPasswordEnabled, isAuthenticatedCookie } from "./lib/app-auth";

export async function middleware(request: NextRequest) {
  if (!isAppPasswordEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (await isAuthenticatedCookie(token)) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
