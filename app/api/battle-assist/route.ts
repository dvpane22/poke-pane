import { NextResponse } from "next/server";
import { buildBattleAssistPrompt, type BattleAssistMessage, type BattleAssistRequest } from "../../../lib/battle-assist";
import { isRequestAuthenticated, unauthorizedJsonResponse } from "../../../lib/require-app-auth";

const MAX_MESSAGES = 16;

export async function POST(request: Request) {
  if (!(await isRequestAuthenticated())) return unauthorizedJsonResponse();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Battle Assist is not configured. Add OPENAI_API_KEY to .env.local and restart the dev server." }, { status: 503 });
  }

  let body: BattleAssistRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter((message): message is BattleAssistMessage =>
      Boolean(message)
      && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
      && message.content.trim().length > 0,
    ).slice(-MAX_MESSAGES)
    : [];

  if (!messages.length || messages[messages.length - 1]?.role !== "user" || !Array.isArray(body.playerTeam) || !Array.isArray(body.opponents)) {
    return NextResponse.json({ error: "A player team, opponent roster, and latest user message are required." }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const apiBase = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 550,
        stream: true,
        messages: [
          { role: "system", content: buildBattleAssistPrompt(body.playerTeam, body.opponents) },
          ...messages.map((message) => ({ role: message.role, content: message.content.trim() })),
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text();
      return NextResponse.json({ error: "The Battle Assist request failed.", detail: detail.slice(0, 400) }, { status: 502 });
    }

    return streamOpenAiResponse(response.body);
  } catch (error) {
    return NextResponse.json({ error: "Battle Assist failed.", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

function streamOpenAiResponse(body: ReadableStream<Uint8Array>) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) controller.enqueue(encoder.encode(readDelta(buffer)));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const delta = readDelta(line);
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        return;
      }
    },
    async cancel() { await reader.cancel(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}

function readDelta(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:") || trimmed === "data: [DONE]") return "";
  try {
    return JSON.parse(trimmed.slice(5).trim()).choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}
