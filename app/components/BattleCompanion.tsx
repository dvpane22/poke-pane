"use client";

import Link from "next/link";
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, CircleHelp, FolderOpen, LoaderCircle,
  Maximize2, MessageCircle, Radio, RotateCcw, ScanLine, Send, Sparkles, Target, Undo2, X,
} from "lucide-react";
import { Room, RoomEvent, Track, VideoQuality } from "livekit-client";
import { QRCodeSVG } from "qrcode.react";
import { POKEMON, type PokemonBuild, type PokemonData } from "../../lib/pokemon";
import type { BattleAssistMessage, BattleOpponent } from "../../lib/battle-assist";

const CURRENT_TEAM_KEY = "poke-pane-team-v3";
const SAVED_TEAMS_KEY = "poke-pane-saved-teams-v1";
const DISPLAY_WIDTH = 1280;
const DISPLAY_HEIGHT = 720;

type ConnectionState = "connecting" | "connected" | "error";
type BattleStage = "choose-team" | "pair" | "calibrate" | "scan" | "dashboard";
type Point = { x: number; y: number };
type Reference = { id: string; name: string; sprite: string; assets?: string[] };
type Candidate = { speciesId: string; confidence: number };
type SpriteEmbedding = { speciesId: string; embedding: number[] };

type TeamOption = {
  id: string;
  name: string;
  count: number;
  kind: "current" | "saved";
  pokemon: PokemonBuild[];
};

type OpponentSlot = BattleOpponent & {
  candidates: Candidate[];
};

type VisionMessage =
  | { type: "corrected"; requestId: number; frame: ImageBitmap }
  | { type: "progress"; requestId: number; value: number; label: string }
  | { type: "scanned"; requestId: number; slots: Candidate[][]; frame: ImageBitmap; crops: ImageBitmap[] }
  | { type: "error"; requestId: number; message: string };

function createRoomName() {
  return `battle-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createEmptyOpponents(): OpponentSlot[] {
  return Array.from({ length: 6 }, () => ({ speciesId: null, name: null, source: "unknown", candidates: [] }));
}

function normalizeBuild(value: unknown): PokemonBuild | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PokemonBuild>;
  if (typeof raw.species !== "string" || !raw.species.trim()) return null;
  const evs = raw.evs && typeof raw.evs === "object" ? raw.evs as Partial<PokemonBuild["evs"]> : {};
  return {
    id: typeof raw.id === "string" ? raw.id : `${raw.species}-${Math.random().toString(16).slice(2)}`,
    species: raw.species,
    megaForm: typeof raw.megaForm === "string" ? raw.megaForm : undefined,
    item: typeof raw.item === "string" ? raw.item : "",
    ability: typeof raw.ability === "string" ? raw.ability : "",
    nature: typeof raw.nature === "string" ? raw.nature : "",
    moves: Array.isArray(raw.moves) ? raw.moves.filter((move): move is string => typeof move === "string").slice(0, 4) : [],
    evs: {
      HP: Number(evs.HP) || 0, Atk: Number(evs.Atk) || 0, Def: Number(evs.Def) || 0,
      SpA: Number(evs.SpA) || 0, SpD: Number(evs.SpD) || 0, Spe: Number(evs.Spe) || 0,
    },
  };
}

function toReferenceId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function calibratedVideoStyle(dimensions: { width: number; height: number }, points: Point[]): CSSProperties | undefined {
  if (points.length !== 4 || !dimensions.width || !dimensions.height) return undefined;
  const xs = points.map((point) => point.x / dimensions.width);
  const ys = points.map((point) => point.y / dimensions.height);
  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(1, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(1, Math.max(...ys));
  const cropWidth = Math.max(0.05, maxX - minX);
  const cropHeight = Math.max(0.05, maxY - minY);
  const scaleX = 1 / cropWidth;
  const scaleY = 1 / cropHeight;
  const translateX = -0.5 - (minX - 0.5) * scaleX;
  const translateY = -0.5 - (minY - 0.5) * scaleY;
  return {
    transform: `translate(${translateX * 100}%, ${translateY * 100}%) scale(${scaleX}, ${scaleY})`,
    transformOrigin: "50% 50%",
  };
}

function isReliableMatch(candidates: Candidate[]) {
  const [first, second] = candidates;
  // Reference-image similarities are cosine scores. A result must have both a usable match
  // and a clear gap before Battle Companion treats it as detected rather than review-needed.
  return Boolean(first && first.confidence >= 0.45 && (!second || first.confidence - second.confidence >= 0.025));
}

function useCanvasFrame(canvasRef: React.RefObject<HTMLCanvasElement | null>, frame: ImageBitmap | null) {
  useEffect(() => {
    if (!frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d");
    context?.drawImage(frame, 0, 0);
  }, [canvasRef, frame]);
}

export function BattleCompanion() {
  const pageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const calibrationRef = useRef<HTMLDivElement>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement>(null);
  const visionWorkerRef = useRef<Worker | null>(null);
  const roomRef = useRef<Room | null>(null);
  const videoTrackRef = useRef<Track | null>(null);
  const requestIdRef = useRef(0);
  const correctingRef = useRef(false);

  const [stage, setStage] = useState<BattleStage>("choose-team");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [roomName, setRoomName] = useState("");
  const [hasVideo, setHasVideo] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [error, setError] = useState("");
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [teamsReady, setTeamsReady] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<PokemonBuild[]>([]);
  const [selectedTeamName, setSelectedTeamName] = useState("");
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [correctedFrame, setCorrectedFrame] = useState<ImageBitmap | null>(null);
  const [references, setReferences] = useState<Reference[]>([]);
  const [referenceEmbeddings, setReferenceEmbeddings] = useState<SpriteEmbedding[]>([]);
  const [opponents, setOpponents] = useState<OpponentSlot[]>(createEmptyOpponents);
  const [opponentCrops, setOpponentCrops] = useState<ImageBitmap[]>([]);
  const [scanProgress, setScanProgress] = useState<{ value: number; label: string } | null>(null);
  const [editingOpponent, setEditingOpponent] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<BattleAssistMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const catalog = useMemo(() => {
    const unique = new Map<string, PokemonData>();
    POKEMON.forEach((pokemon) => unique.set(toReferenceId(pokemon.name), pokemon));
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, []);
  const catalogById = useMemo(() => new Map(catalog.map((pokemon) => [toReferenceId(pokemon.name), pokemon])), [catalog]);
  const referenceById = useMemo(() => new Map(references.map((reference) => [reference.id, reference])), [references]);

  useCanvasFrame(correctedCanvasRef, correctedFrame);

  useEffect(() => () => {
    opponentCrops.forEach((crop) => crop.close());
  }, [opponentCrops]);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [stage]);

  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem(CURRENT_TEAM_KEY) || "[]");
      const saved = JSON.parse(localStorage.getItem(SAVED_TEAMS_KEY) || "[]");
      const currentTeam = Array.isArray(current) ? current.map(normalizeBuild).filter((pokemon): pokemon is PokemonBuild => Boolean(pokemon)) : [];
      const options: TeamOption[] = [{ id: "current", name: "Current team", count: currentTeam.length, kind: "current", pokemon: currentTeam }];
      if (Array.isArray(saved)) {
        saved.forEach((team: unknown) => {
          const candidate = team as { id?: unknown; name?: unknown; pokemon?: unknown } | null;
          if (!candidate || typeof candidate.id !== "string" || typeof candidate.name !== "string" || !Array.isArray(candidate.pokemon)) return;
          const pokemon = candidate.pokemon.map(normalizeBuild).filter((entry): entry is PokemonBuild => Boolean(entry));
          options.push({ id: candidate.id, name: candidate.name, count: pokemon.length, kind: "saved", pokemon });
        });
      }
      setTeamOptions(options);
    } catch {
      setTeamOptions([{ id: "current", name: "Current team", count: 0, kind: "current", pokemon: [] }]);
    } finally {
      setTeamsReady(true);
    }
  }, []);

  useEffect(() => {
    const fallback = catalog.map((pokemon) => ({ id: toReferenceId(pokemon.name), name: pokemon.name, sprite: pokemon.sprite }));
    void fetch("/battle-reference-manifest.json")
      .then((response) => response.ok ? response.json() : null)
      .then((manifest: { references?: Reference[] } | null) => setReferences(manifest?.references?.length ? manifest.references : fallback))
      .catch(() => setReferences(fallback));
  }, [catalog]);

  useEffect(() => {
    void fetch("/battle-reference-embeddings.json")
      .then((response) => response.ok ? response.json() : null)
      .then((manifest: { references?: SpriteEmbedding[] } | null) => setReferenceEmbeddings(manifest?.references ?? []))
      .catch(() => setReferenceEmbeddings([]));
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL("./battleVision.worker.ts", import.meta.url));
    visionWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<VisionMessage>) => {
      const message = event.data;
      if (message.type === "corrected") {
        correctingRef.current = false;
        setCorrectedFrame((current) => {
          current?.close();
          return message.frame;
        });
      }
      if (message.type === "progress") setScanProgress({ value: message.value, label: message.label });
      if (message.type === "scanned") {
        setCorrectedFrame((current) => {
          current?.close();
          return message.frame;
        });
        setOpponentCrops(message.crops);
        setOpponents(message.slots.map((candidates) => {
          const first = candidates[0];
          const pokemon = first && isReliableMatch(candidates) ? catalogById.get(first.speciesId) : undefined;
          return {
            speciesId: pokemon ? first?.speciesId ?? null : null,
            name: pokemon?.name ?? null,
            confidence: first?.confidence,
            source: pokemon ? "detected" : "unknown",
            candidates,
          };
        }));
        setScanProgress(null);
        setStage("dashboard");
      }
      if (message.type === "error") {
        correctingRef.current = false;
        setError(message.message);
        setScanProgress(null);
      }
    };
    worker.onerror = () => setError("Your browser could not start the local vision worker. You can still enter the opponent team manually.");
    return () => worker.terminate();
  }, [catalogById]);

  const disconnect = useCallback((returnToTeamPicker = false) => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    videoTrackRef.current?.detach();
    videoTrackRef.current = null;
    setHasVideo(false);
    setOpponentCrops([]);
    if (videoRef.current) videoRef.current.srcObject = null;
    setCalibrationPoints([]);
    setCorrectedFrame((frame) => { frame?.close(); return null; });
    setScanProgress(null);
    if (returnToTeamPicker) {
      setSelectedTeam([]);
      setSelectedTeamName("");
      setRoomName("");
      setOpponents(createEmptyOpponents());
      setStage("choose-team");
    }
  }, []);

  const connect = useCallback(async () => {
    const nextRoomName = createRoomName();
    setRoomName(nextRoomName);
    setConnection("connecting");
    setError("");
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomName: nextRoomName, role: "viewer" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create a battle room.");

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, publication) => {
        if (track.kind !== Track.Kind.Video) return;
        publication.setVideoQuality(VideoQuality.HIGH);
        videoTrackRef.current = track;
        if (videoRef.current) track.attach(videoRef.current);
        setHasVideo(true);
        setStage("calibrate");
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        if (videoTrackRef.current === track) {
          videoTrackRef.current = null;
          setHasVideo(false);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) roomRef.current = null;
      });
      await room.connect(payload.url, payload.token);
      setConnection("connected");
    } catch (reason) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      setConnection("error");
      setError(reason instanceof Error ? reason.message : "Could not create the battle room.");
    }
  }, []);

  useEffect(() => {
    if (hasVideo && videoRef.current && videoTrackRef.current) {
      videoTrackRef.current.attach(videoRef.current);
    }
  }, [hasVideo, stage]);

  const updateVideoDimensions = useCallback((video: HTMLVideoElement | null) => {
    if (!video?.videoWidth || !video.videoHeight) return;
    setVideoDimensions((current) => current.width === video.videoWidth && current.height === video.videoHeight
      ? current
      : { width: video.videoWidth, height: video.videoHeight });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!hasVideo || !video) return;
    const update = () => updateVideoDimensions(video);
    const animationFrame = requestAnimationFrame(update);
    const timer = window.setTimeout(update, 120);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("canplay", update);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("canplay", update);
    };
  }, [hasVideo, stage, updateVideoDimensions]);

  useEffect(() => () => disconnect(false), [disconnect]);

  const chooseTeam = (team: TeamOption) => {
    setSelectedTeam(structuredClone(team.pokemon));
    setSelectedTeamName(team.name);
    setOpponents(createEmptyOpponents());
    setStage("pair");
    void connect();
  };

  const publicOrigin = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_PUBLIC_APP_URL?.trim() || window.location.origin).replace(/\/$/, "")
    : "";
  const pairingUrl = roomName && publicOrigin
    ? `pokepane://connect?room=${encodeURIComponent(roomName)}&host=${encodeURIComponent(publicOrigin)}`
    : "";

  const getVideoFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) throw new Error("Waiting for the iPhone camera frame.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Camera frame capture is unavailable in this browser.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return createImageBitmap(canvas);
  }, []);

  const addCalibrationPoint = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (calibrationPoints.length >= 4) return;
    const video = videoRef.current;
    const target = calibrationRef.current;
    if (!video?.videoWidth || !video.videoHeight || !target) return;
    const bounds = target.getBoundingClientRect();
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = bounds.width / bounds.height;
    const shownWidth = containerRatio > videoRatio ? bounds.height * videoRatio : bounds.width;
    const shownHeight = containerRatio > videoRatio ? bounds.height : bounds.width / videoRatio;
    const left = (bounds.width - shownWidth) / 2;
    const top = (bounds.height - shownHeight) / 2;
    const x = event.clientX - bounds.left - left;
    const y = event.clientY - bounds.top - top;
    if (x < 0 || y < 0 || x > shownWidth || y > shownHeight) return;
    setCalibrationPoints((points) => [...points, { x: x / shownWidth * video.videoWidth, y: y / shownHeight * video.videoHeight }]);
  };

  const calibrate = async () => {
    try {
      setError("");
      const frame = await getVideoFrame();
      const id = ++requestIdRef.current;
      visionWorkerRef.current?.postMessage({ type: "correct", requestId: id, frame, points: calibrationPoints }, [frame]);
      setStage("scan");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not capture the iPhone camera frame.");
    }
  };

  const scanOpponents = async () => {
    if (!references.length) return setError("The Pokémon reference catalog is still loading. Try again in a moment.");
    if (!referenceEmbeddings.length) return setError("The Champions menu-sprite library is still loading. Try again in a moment, or enter the team manually.");
    try {
      setError("");
      setScanProgress({ value: 0.02, label: "Capturing the calibrated team preview…" });
      const frame = await getVideoFrame();
      const id = ++requestIdRef.current;
      visionWorkerRef.current?.postMessage({ type: "scan", requestId: id, frame, points: calibrationPoints, references, embeddings: referenceEmbeddings }, [frame]);
    } catch (reason) {
      setScanProgress(null);
      setError(reason instanceof Error ? reason.message : "Could not scan the team preview.");
    }
  };

  const updateOpponent = (index: number, speciesId: string | null, source: OpponentSlot["source"] = "manual") => {
    const pokemon = speciesId ? catalogById.get(speciesId) : undefined;
    setOpponents((slots) => slots.map((slot, slotIndex) => slotIndex === index ? {
      ...slot,
      speciesId: pokemon ? speciesId : null,
      name: pokemon?.name ?? null,
      confidence: source === "manual" ? undefined : slot.confidence,
      source: pokemon ? source : "unknown",
    } : slot));
    setEditingOpponent(null);
  };

  const submitChat = async (event: FormEvent) => {
    event.preventDefault();
    const content = chatDraft.trim();
    if (!content || chatSending) return;
    const nextMessages = [...chatMessages, { role: "user" as const, content }];
    setChatMessages([...nextMessages, { role: "assistant", content: "" }]);
    setChatDraft("");
    setChatSending(true);
    try {
      const response = await fetch("/api/battle-assist", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, playerTeam: selectedTeam, opponents }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Battle Assist could not answer right now.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setChatMessages([...nextMessages, { role: "assistant", content: answer }]);
      }
    } catch (reason) {
      setChatMessages([...nextMessages, { role: "assistant", content: reason instanceof Error ? reason.message : "Battle Assist could not answer right now." }]);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <main ref={pageRef} className={`battle-v1-page${stage === "dashboard" ? " battle-v1-dashboard-page" : ""}`}>
      <header className="battle-v1-header">
        <Link className="ghost-button" href="/" aria-label="Back to Poke Pane"><ArrowLeft size={16} /> Back</Link>
        {stage === "dashboard"
          ? <div className="battle-v1-header-actions"><span className="battle-v1-live"><i /> Camera live</span><button className="ghost-button" type="button" onClick={() => disconnect(true)}><X size={16} /> End battle</button></div>
          : <span className="eyebrow">BATTLE COMPANION</span>}
      </header>

      {stage === "choose-team" && (
        <section className="battle-v1-card battle-v1-picker" aria-labelledby="battle-title">
          <div className="battle-v1-heading"><span className="battle-v1-icon"><Sparkles size={22} /></span><div><h1 id="battle-title">Choose a team</h1><p>Battle Companion snapshots this team for the full battle.</p></div></div>
          <div className="battle-v1-steps" aria-label="Battle Companion progress"><span className="active">1 Team</span><span>2 Pair</span><span>3 Calibrate</span><span>4 Scan</span><span>5 Assist</span></div>
          {!teamsReady ? <p className="battle-v1-muted"><LoaderCircle className="spin" size={16} /> Loading your teams…</p> : <div className="battle-v1-team-options">
            {teamOptions.map((team) => <button className="battle-v1-team-option" key={team.id} type="button" disabled={!team.count} onClick={() => chooseTeam(team)}>
              <span>{team.kind === "saved" ? <FolderOpen size={18} /> : <Sparkles size={18} />}</span><strong>{team.name}</strong><small>{team.count ? `${team.count} Pokémon · ${team.kind === "saved" ? "Saved team" : "Current build"}` : "No Pokémon yet"}</small><ArrowRight size={18} />
            </button>)}
          </div>}
        </section>
      )}

      {stage === "pair" && <section className="battle-v1-card battle-v1-pair" aria-labelledby="battle-title">
        <video ref={videoRef} className="battle-v1-video-anchor" autoPlay playsInline muted />
        <div className="battle-v1-heading"><span className="battle-v1-icon"><Radio size={22} /></span><div><h1 id="battle-title">Pair your iPhone</h1><p>Open Poke Pane Capture and scan this QR code. The app sends a landscape camera feed only.</p></div></div>
        <div className="battle-v1-qr">{pairingUrl ? <QRCodeSVG value={pairingUrl} size={260} bgColor="#f3f7f8" fgColor="#090d12" level="M" includeMargin /> : <LoaderCircle className="spin" />}</div>
        <div className="battle-v1-pair-status"><i className={connection === "error" ? "error" : ""} />{connection === "connected" ? "Waiting for the phone camera…" : connection === "error" ? "Could not create a room" : "Creating a secure pairing room…"}</div>
        {error && <p className="battle-v1-error">{error}</p>}
        <button className="ghost-button" type="button" onClick={() => disconnect(true)}>Choose another team</button>
      </section>}

      {(stage === "calibrate" || stage === "scan") && <section className="battle-v1-card battle-v1-calibration" aria-labelledby="calibration-title">
        <div className="battle-v1-heading"><span className="battle-v1-icon"><Target size={22} /></span><div><h1 id="calibration-title">{stage === "calibrate" ? "Calibrate the game screen" : "Scan the opposing team"}</h1><p>{stage === "calibrate" ? "Tap the display’s corners in order: top-left, top-right, bottom-right, bottom-left." : "The live phone frame is now locked to the game display. Scan only while the Champions team preview is visible."}</p></div></div>
        {stage === "calibrate" ? <>
          <div className="battle-v1-calibration-stage" ref={calibrationRef} onPointerDown={addCalibrationPoint} role="application" aria-label="Tap the four corners of the game display">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="battle-v1-corner-hint">{["Top-left", "Top-right", "Bottom-right", "Bottom-left"][calibrationPoints.length] ?? "All corners selected"}</div>
            {calibrationPoints.map((point, index) => <span className="battle-v1-point" key={`${point.x}-${point.y}`} style={{ left: `${point.x / (videoRef.current?.videoWidth || 1) * 100}%`, top: `${point.y / (videoRef.current?.videoHeight || 1) * 100}%` }}><b>{index + 1}</b></span>)}
          </div>
          <div className="battle-v1-calibration-actions"><button className="ghost-button" type="button" disabled={!calibrationPoints.length} onClick={() => setCalibrationPoints((points) => points.slice(0, -1))}><Undo2 size={15} /> Undo</button><button className="ghost-button" type="button" disabled={!calibrationPoints.length} onClick={() => setCalibrationPoints([])}><RotateCcw size={15} /> Reset</button><button className="primary-button" type="button" disabled={calibrationPoints.length !== 4} onClick={() => void calibrate()}><Check size={16} /> Continue</button></div>
        </> : <>
          <div className="battle-v1-live-frame battle-v1-scan-live-frame"><video ref={videoRef} className="battle-v1-live-video" style={calibratedVideoStyle(videoDimensions, calibrationPoints)} onLoadedMetadata={(event) => updateVideoDimensions(event.currentTarget)} onCanPlay={(event) => updateVideoDimensions(event.currentTarget)} autoPlay playsInline muted /><span className="battle-live-badge"><i /> LIVE</span></div>
          {scanProgress ? <div className="battle-v1-progress"><div><span style={{ width: `${Math.round(scanProgress.value * 100)}%` }} /></div><strong>{scanProgress.label}</strong><small>This stays on your device. It compares the live portraits with the cached Champions menu-sprite library.</small></div> : <div className="battle-v1-calibration-actions"><button className="ghost-button" type="button" onClick={() => setStage("calibrate")}><ChevronLeft size={16} /> Recalibrate</button><button className="primary-button" type="button" disabled={!correctedFrame || !references.length || !referenceEmbeddings.length} onClick={() => void scanOpponents()}><ScanLine size={16} /> Scan opposing team</button><button className="ghost-button" type="button" onClick={() => setStage("dashboard")}>Enter manually</button></div>}
        </>}
        {error && <p className="battle-v1-error">{error}</p>}
      </section>}

      {stage === "dashboard" && <section className="battle-v1-dashboard" aria-label="Battle Companion workspace">
        <OpponentRoster opponents={opponents} crops={opponentCrops} catalogById={catalogById} referenceById={referenceById} onEdit={setEditingOpponent} />
        <div className="battle-v1-workspace">
          <section className="battle-v1-field-placeholder"><span className="battle-v1-icon"><Maximize2 size={22} /></span><h2>Battle field</h2><p>Active Pokémon, turn results, and damage inference will appear here in the next Battle Companion phase.</p><span className="battle-v1-field-chip">TEAM PREVIEW READY</span></section>
          <aside className="battle-v1-right-rail"><section className="battle-v1-stream-card"><header><span><i /> LIVE VIEW</span><small>Calibrated live feed</small></header><div className="battle-v1-live-frame"><video ref={videoRef} className="battle-v1-live-video" style={calibratedVideoStyle(videoDimensions, calibrationPoints)} onLoadedMetadata={(event) => updateVideoDimensions(event.currentTarget)} onCanPlay={(event) => updateVideoDimensions(event.currentTarget)} autoPlay playsInline muted /></div></section><BattleChat messages={chatMessages} draft={chatDraft} sending={chatSending} onDraft={setChatDraft} onSubmit={submitChat} /></aside>
        </div>
        <PlayerRoster team={selectedTeam} catalog={catalog} />
      </section>}

      {editingOpponent !== null && <OpponentEditor index={editingOpponent} crop={opponentCrops[editingOpponent]} opponent={opponents[editingOpponent]} catalog={catalog} catalogById={catalogById} referenceById={referenceById} onClose={() => setEditingOpponent(null)} onSelect={(speciesId) => updateOpponent(editingOpponent, speciesId)} onClear={() => updateOpponent(editingOpponent, null)} />}
    </main>
  );
}

function CorrectedCanvas({ canvasRef, empty }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; empty: string }) {
  return <div className="battle-v1-corrected-frame"><canvas ref={canvasRef} /><p>{empty}</p><span className="battle-live-badge"><i /> LIVE</span></div>;
}

function CameraCrop({ crop, index, className = "" }: { crop?: ImageBitmap; index: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!crop || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = crop.width;
    canvas.height = crop.height;
    canvas.getContext("2d")?.drawImage(crop, 0, 0);
  }, [crop]);
  return crop ? <canvas ref={canvasRef} className={`battle-v1-camera-crop ${className}`} aria-label={`Camera crop for opponent slot ${index + 1}`} /> : <span className="battle-v1-unknown">?</span>;
}

function OpponentRoster({ opponents, crops, catalogById, referenceById, onEdit }: { opponents: OpponentSlot[]; crops: ImageBitmap[]; catalogById: Map<string, PokemonData>; referenceById: Map<string, Reference>; onEdit: (index: number) => void }) {
  return <section className="battle-v1-roster battle-v1-opponent-roster"><div className="battle-v1-roster-heading"><div><span className="eyebrow">OPPOSING TEAM</span><h2>Camera suggestions</h2></div><small>Tap any slot to correct it</small></div><div className="battle-v1-roster-slots">{opponents.map((slot, index) => {
    const pokemon = slot.speciesId ? catalogById.get(slot.speciesId) : undefined;
    const reference = slot.speciesId ? referenceById.get(slot.speciesId) : undefined;
    return <button key={index} className={`battle-v1-roster-slot${pokemon ? " filled" : ""}`} type="button" onClick={() => onEdit(index)}><span className="battle-v1-slot-number">{index + 1}</span><CameraCrop crop={crops[index]} index={index} />{pokemon && <img src={reference?.assets?.[0] ?? pokemon.sprite} alt="" />}<span><strong>{pokemon?.name ?? "Review this slot"}</strong><small>{slot.source === "detected" ? `${Math.round((slot.confidence ?? 0) * 100)}% camera match` : slot.source === "manual" ? "Manually selected" : slot.candidates.length ? "Low-confidence camera result" : "Select species"}</small></span></button>;
  })}</div></section>;
}

function PlayerRoster({ team, catalog }: { team: PokemonBuild[]; catalog: PokemonData[] }) {
  const lookup = new Map(catalog.map((pokemon) => [pokemon.name, pokemon]));
  return <section className="battle-v1-roster battle-v1-player-roster"><div className="battle-v1-roster-heading"><div><span className="eyebrow">YOUR TEAM</span><h2>Known loadout</h2></div><small>Frozen for this battle</small></div><div className="battle-v1-roster-slots">{Array.from({ length: 6 }, (_, index) => {
    const build = team[index];
    const pokemon = build ? lookup.get(build.species) : undefined;
    return <div className={`battle-v1-roster-slot player${pokemon ? " filled" : ""}`} key={build?.id ?? index}>{pokemon ? <img src={pokemon.sprite} alt="" /> : <span className="battle-v1-unknown">—</span>}<span><strong>{pokemon?.name ?? "Empty slot"}</strong><small>{build?.item || "No item selected"}</small></span></div>;
  })}</div></section>;
}

function OpponentEditor({ index, crop, opponent, catalog, catalogById, referenceById, onClose, onSelect, onClear }: { index: number; crop?: ImageBitmap; opponent: OpponentSlot; catalog: PokemonData[]; catalogById: Map<string, PokemonData>; referenceById: Map<string, Reference>; onClose: () => void; onSelect: (speciesId: string) => void; onClear: () => void }) {
  const [query, setQuery] = useState(opponent.name ?? "");
  const matches = catalog.filter((pokemon) => pokemon.name.toLowerCase().includes(query.toLowerCase())).slice(0, 14);
  return <div className="battle-v1-editor-backdrop" role="presentation" onMouseDown={onClose}><section className="battle-v1-opponent-editor" role="dialog" aria-modal="true" aria-labelledby="opponent-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">OPPONENT SLOT {index + 1}</span><h2 id="opponent-editor-title">Confirm the Pokémon</h2></div><button className="icon-button" type="button" aria-label="Close Pokémon selector" onClick={onClose}><X size={18} /></button></header>{crop && <div className="battle-v1-camera-shot"><CameraCrop crop={crop} index={index} className="large" /><div><span className="eyebrow">WHAT THE CAMERA SAW</span><p>This is the exact portrait crop sent to the matcher.</p></div></div>}{opponent.candidates.length > 0 && <div className="battle-v1-candidates"><span>Champions sprite matches</span>{opponent.candidates.map((candidate) => { const pokemon = catalogById.get(candidate.speciesId); const reference = referenceById.get(candidate.speciesId); return pokemon ? <button key={candidate.speciesId} type="button" onClick={() => onSelect(candidate.speciesId)}><img src={reference?.assets?.[0] ?? pokemon.sprite} alt="" />{pokemon.name}<small>{Math.round(candidate.confidence * 100)}%</small></button> : null; })}</div>}<label className="battle-v1-search"><span>Search all Regulation MB Pokémon</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a Pokémon name" /></label><div className="battle-v1-search-results">{matches.map((pokemon) => <button type="button" key={pokemon.name} onClick={() => onSelect(toReferenceId(pokemon.name))}><img src={pokemon.sprite} alt="" /><span>{pokemon.name}<small>{pokemon.types.join(" · ")}</small></span><Check size={16} /></button>)}</div><footer><button className="ghost-button" type="button" onClick={onClear}>Clear slot</button><button className="ghost-button" type="button" onClick={onClose}>Done</button></footer></section></div>;
}

function BattleChat({ messages, draft, sending, onDraft, onSubmit }: { messages: BattleAssistMessage[]; draft: string; sending: boolean; onDraft: (value: string) => void; onSubmit: (event: FormEvent) => void }) {
  return <section className="battle-v1-chat"><header><span className="battle-v1-icon"><MessageCircle size={18} /></span><div><span className="eyebrow">BATTLE ASSIST</span><h2>Ask about team preview</h2></div></header><div className="battle-v1-chat-thread" aria-live="polite">{messages.length ? messages.map((message, index) => <p key={`${message.role}-${index}`} className={message.role}>{message.content || <LoaderCircle className="spin" size={15} />}</p>) : <p className="empty"><CircleHelp size={17} /> Ask about leads, matchup plans, or threats. It only knows this team preview—not unrevealed battle information.</p>}</div><form onSubmit={onSubmit}><label className="sr-only" htmlFor="battle-assist-question">Ask Battle Assist</label><input id="battle-assist-question" value={draft} onChange={(event) => onDraft(event.target.value)} placeholder="What are my best leads?" disabled={sending} /><button className="primary-button" type="submit" disabled={!draft.trim() || sending} aria-label="Send question"><Send size={16} /></button></form></section>;
}
