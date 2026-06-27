"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearBuildAssistStorage, writeDraftTeamSessionId } from "../../lib/build-assist-session";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Wrong password.");
        return;
      }

      clearBuildAssistStorage();
      writeDraftTeamSessionId(null);

      const from = searchParams.get("from") || "/";
      router.replace(from);
      router.refresh();
    } catch {
      setError("Could not sign in. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="login-card">
      <span className="login-eyebrow">Poke Pane</span>
      <h1>Enter password</h1>
      <p>This build is private. Ask the owner for access.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          disabled={loading}
          autoFocus
        />
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <button type="submit" disabled={loading || !password.trim()}>
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="login-gate">
      <Suspense fallback={<section className="login-card"><p>Loading…</p></section>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
