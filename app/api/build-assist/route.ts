import { NextResponse } from "next/server";
import {
  buildBuildAssistSystemPrompt,
  type BuildAssistMessage,
  type BuildAssistRequest,
} from "../../../lib/build-assist";
import { isRequestAuthenticated, unauthorizedJsonResponse } from "../../../lib/require-app-auth";

const MAX_MESSAGES = 16;

export async function POST(request: Request) {
  if (!(await isRequestAuthenticated())) {
    return unauthorizedJsonResponse();
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Build assist is not configured. Add OPENAI_API_KEY to .env.local and restart the dev server." },
      { status: 503 },
    );
  }

  let body: BuildAssistRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { messages, context } = body;
  if (!context || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages and team context are required." }, { status: 400 });
  }

  const sanitizedMessages = messages
    .filter((message): message is BuildAssistMessage =>
      (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
      && message.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES);

  if (!sanitizedMessages.length || sanitizedMessages[sanitizedMessages.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "The latest message must be from the user." }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const apiBase = process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1";

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        max_tokens: 900,
        stream: true,
        messages: [
          { role: "system", content: buildBuildAssistSystemPrompt(context, sanitizedMessages) },
          ...sanitizedMessages.map((message) => ({
            role: message.role,
            content: message.content.trim(),
          })),
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: "The language model request failed.", detail: detail.slice(0, 400) },
        { status: 502 },
      );
    }

    if (!response.body) {
      return NextResponse.json({ error: "The assistant returned an empty reply." }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const upstream = response.body.getReader();
    let buffer = "";
    const pendingDeltas: string[] = [];

    const stream = new ReadableStream({
      async pull(controller) {
        const pendingDelta = pendingDeltas.shift();
        if (pendingDelta) {
          controller.enqueue(encoder.encode(pendingDelta));
          return;
        }

        while (true) {
          const { done, value } = await upstream.read();
          if (done) {
            if (buffer.trim()) {
              controller.enqueue(encoder.encode(readStreamingDelta(buffer)));
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const delta = readStreamingDelta(line);
            if (delta) {
              pendingDeltas.push(delta);
            }
          }

          const nextDelta = pendingDeltas.shift();
          if (nextDelta) {
            controller.enqueue(encoder.encode(nextDelta));
            return;
          }
        }
      },
      async cancel() {
        await upstream.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Build assist failed.", detail: message }, { status: 500 });
  }
}

function readStreamingDelta(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:") || trimmed === "data: [DONE]") return "";

  try {
    const payload = JSON.parse(trimmed.slice(5).trim());
    return payload.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}
