"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildAssistAction, BuildAssistMessage } from "./build-assist";

export type BuildAssistPendingAction = {
  id: string;
  action: BuildAssistAction;
  appliedPokemonId?: string;
};

export type BuildAssistTurn = BuildAssistMessage & {
  actions?: BuildAssistPendingAction[];
};

export type BuildAssistSessionState = {
  turns: BuildAssistTurn[];
  open: boolean;
  draft: string;
};

export type BuildAssistSessionControls = {
  turns: BuildAssistTurn[];
  setTurns: (value: BuildAssistTurn[] | ((current: BuildAssistTurn[]) => BuildAssistTurn[])) => void;
  open: boolean;
  setOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  draft: string;
  setDraft: (value: string | ((current: string) => string)) => void;
  clearChat: () => void;
};

export const BUILD_ASSIST_STORAGE_KEY = "poke-pane-build-assist";
export const DRAFT_TEAM_SESSION_KEY = "poke-pane-draft-team-session";

type PersistedBuildAssistSession = BuildAssistSessionState & {
  teamKey: string;
};

const EMPTY_SESSION: BuildAssistSessionState = {
  turns: [],
  open: false,
  draft: "",
};

export function buildTeamAssistKey(activeSavedTeamId: string | null, draftTeamSessionId: string | null) {
  if (activeSavedTeamId) return `saved:${activeSavedTeamId}`;
  if (draftTeamSessionId) return `draft:${draftTeamSessionId}`;
  return "empty";
}

export function createDraftTeamSessionId() {
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readDraftTeamSessionId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DRAFT_TEAM_SESSION_KEY);
}

export function writeDraftTeamSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(DRAFT_TEAM_SESSION_KEY, id);
  else localStorage.removeItem(DRAFT_TEAM_SESSION_KEY);
}

export function clearBuildAssistStorage() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(BUILD_ASSIST_STORAGE_KEY);
}

export function migrateAssistTeamKey(fromKey: string, toKey: string) {
  const stored = readStoredSession();
  if (stored.teamKey !== fromKey) return;
  writeStoredSession({ ...stored, teamKey: toKey });
}

function readStoredSession(): PersistedBuildAssistSession {
  if (typeof window === "undefined") {
    return { ...EMPTY_SESSION, teamKey: "empty" };
  }
  const raw = sessionStorage.getItem(BUILD_ASSIST_STORAGE_KEY);
  if (!raw) {
    return { ...EMPTY_SESSION, teamKey: "empty" };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedBuildAssistSession>;
    return {
      teamKey: typeof parsed.teamKey === "string" ? parsed.teamKey : "empty",
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      open: Boolean(parsed.open),
      draft: typeof parsed.draft === "string" ? parsed.draft : "",
    };
  } catch {
    sessionStorage.removeItem(BUILD_ASSIST_STORAGE_KEY);
    return { ...EMPTY_SESSION, teamKey: "empty" };
  }
}

function writeStoredSession(session: PersistedBuildAssistSession) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(BUILD_ASSIST_STORAGE_KEY, JSON.stringify(session));
}

export function useBuildAssistSession(teamKey: string, enabled = true) {
  const [session, setSession] = useState<PersistedBuildAssistSession>({
    ...EMPTY_SESSION,
    teamKey,
  });
  const [ready, setReady] = useState(false);
  const teamKeyRef = useRef(teamKey);

  useEffect(() => {
    if (!enabled) return;
    const stored = readStoredSession();
    if (stored.teamKey === teamKey) {
      setSession({ ...stored, teamKey });
    } else {
      setSession({ ...EMPTY_SESSION, teamKey });
    }
    teamKeyRef.current = teamKey;
    setReady(true);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ready) return;
    if (teamKeyRef.current === teamKey) return;
    teamKeyRef.current = teamKey;
    const stored = readStoredSession();
    if (stored.teamKey === teamKey) {
      setSession({ ...stored, teamKey });
      return;
    }
    setSession((current) => ({
      ...EMPTY_SESSION,
      teamKey,
      open: false,
    }));
  }, [enabled, ready, teamKey]);

  useEffect(() => {
    if (!enabled || !ready) return;
    writeStoredSession(session);
  }, [enabled, ready, session]);

  const clearChat = useCallback(() => {
    setSession((current) => ({
      ...current,
      turns: [],
      draft: "",
    }));
  }, []);

  const resetForTeamKey = useCallback((nextTeamKey: string, keepOpen = false) => {
    teamKeyRef.current = nextTeamKey;
    setSession({
      ...EMPTY_SESSION,
      teamKey: nextTeamKey,
      open: keepOpen,
    });
  }, []);

  const setTurns = useCallback((value: BuildAssistTurn[] | ((current: BuildAssistTurn[]) => BuildAssistTurn[])) => {
    setSession((current) => ({
      ...current,
      turns: typeof value === "function" ? value(current.turns) : value,
    }));
  }, []);

  const setOpen = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setSession((current) => {
      const open = typeof value === "function" ? value(current.open) : value;
      const next = current.open === open ? current : { ...current, open };
      if (enabled && ready) writeStoredSession(next);
      return next;
    });
  }, [enabled, ready]);

  const setDraft = useCallback((value: string | ((current: string) => string)) => {
    setSession((current) => ({
      ...current,
      draft: typeof value === "function" ? value(current.draft) : value,
    }));
  }, []);

  return {
    turns: session.turns,
    setTurns,
    open: session.open,
    setOpen,
    draft: session.draft,
    setDraft,
    clearChat,
    resetForTeamKey,
  };
}
