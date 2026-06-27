"use client";

import { useEffect, useState } from "react";

function isReloadNavigation() {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload";
}

export function AuthSession({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(() => {
    if (typeof window === "undefined") return true;
    return !(isReloadNavigation() && window.location.pathname !== "/login");
  });

  useEffect(() => {
    if (!isReloadNavigation() || window.location.pathname === "/login") {
      setReady(true);
      return;
    }

    const from = `${window.location.pathname}${window.location.search}`;

    void fetch("/api/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        window.location.replace(`/login?from=${encodeURIComponent(from)}`);
      });
  }, []);

  if (!ready) return null;

  return children;
}
