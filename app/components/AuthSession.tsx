"use client";

import { useEffect, useState } from "react";

const TAB_SESSION_KEY = "pane-tab-session";

export function AuthSession({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isLogin = window.location.pathname === "/login";
    const tabAlreadyActive = sessionStorage.getItem(TAB_SESSION_KEY) === "1";
    sessionStorage.setItem(TAB_SESSION_KEY, "1");

    if (!tabAlreadyActive || isLogin) {
      setReady(true);
      return;
    }

    const from = `${window.location.pathname}${window.location.search}`;

    void fetch("/api/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        sessionStorage.removeItem(TAB_SESSION_KEY);
        window.location.replace(`/login?from=${encodeURIComponent(from)}`);
      });
  }, []);

  if (!ready) return null;

  return children;
}
