import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isRequestAuthenticated } from "../../../../lib/require-app-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isRequestAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const roomName = typeof body.roomName === "string" ? body.roomName.trim() : "";
  const role = body.role === "publisher" ? "publisher" : "viewer";
  if (!roomName || !/^[a-zA-Z0-9_-]{3,64}$/.test(roomName)) {
    return NextResponse.json({ error: "Room code must be 3–64 letters, numbers, hyphens, or underscores." }, { status: 400 });
  }

  const identity = `${role}-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: role === "publisher",
    canPublishData: role === "publisher",
  });

  return NextResponse.json({ url, token: await token.toJwt(), roomName, identity });
}
