"use client";

import { Fragment, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BarChart2,
  Bug,
  Circle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Download,
  Droplets,
  Eye,
  Flame,
  FlaskConical,
  FolderOpen,
  Gem,
  Ghost,
  Layers,
  Leaf,
  Mountain,
  Moon,
  Orbit,
  Pin,
  Package,
  Plus,
  Search,
  Save,
  Shield,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Swords,
  Trash2,
  Upload,
  Wind,
  Zap,
  RotateCcw,
  X,
} from "lucide-react";
import { answerCoachQuestion, applyCoachRecommendation, baseCoachQuestion, CoachAnswer, CoachRecommendation, moveIsSpread } from "../../lib/coach";
import { BuildAssistBubble } from "../components/BuildAssistBubble";
import { PokeballMark } from "../components/PokeballMark";
import { useBuildAssistSession, type BuildAssistSessionControls, buildTeamAssistKey, createDraftTeamSessionId, migrateAssistTeamKey, readDraftTeamSessionId, writeDraftTeamSessionId } from "../../lib/build-assist-session";
import {
  CHAMPIONS_STAT_POINT_MAX,
  CHAMPIONS_STAT_POINT_TOTAL,
  calculateStat,
  calculateEffectiveStat,
  createBuild,
  exportShowdown,
  getNatureEffect,
  importShowdown,
  POKEMON,
  PokemonBuild,
  PokemonData,
  MegaForm,
  formatMegaDisplayName,
  megaFormArtworkUrls,
  resolvePokemonFromDisplayName,
  StatKey,
  BattleStatContext,
  validateTeam,
} from "../../lib/pokemon";
import { itemSpriteFallbackUrls } from "../../lib/item-sprites";
import optionDetails from "../../data/champions-options.json";

type OptionDetail = {
  description: string;
  type?: string;
  category?: string;
  power?: number | null;
  accuracy?: number | boolean;
  priority?: number;
};
const OPTION_DETAILS = optionDetails as {
  items: Record<string, OptionDetail>;
  abilities: Record<string, OptionDetail>;
  moves: Record<string, OptionDetail>;
};

const STORAGE_KEY = "poke-pane-team-v3";
const SAVED_TEAMS_KEY = "poke-pane-saved-teams-v1";
const ACTIVE_SAVED_TEAM_KEY = "poke-pane-active-saved-team-v1";
const NATURE_STATS = ["Atk", "Def", "SpA", "SpD", "Spe"] as const;
const NATURE_CHART = [
  ["Hardy", "Lonely", "Adamant", "Naughty", "Brave"],
  ["Bold", "Docile", "Impish", "Lax", "Relaxed"],
  ["Modest", "Mild", "Bashful", "Rash", "Quiet"],
  ["Calm", "Gentle", "Careful", "Quirky", "Sassy"],
  ["Timid", "Hasty", "Jolly", "Naive", "Serious"],
] as const;
const STAT_KEYS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const satisfies readonly StatKey[];

function sanitizeStatPointDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function normalizeSuggestedEvs(evs?: Partial<Record<StatKey, number>>): PokemonBuild["evs"] | null {
  if (!evs) return null;
  const next = { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 } satisfies PokemonBuild["evs"];
  for (const stat of STAT_KEYS) {
    const value = evs[stat] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > CHAMPIONS_STAT_POINT_MAX) return null;
    next[stat] = Math.round(value);
  }
  const total = Object.values(next).reduce((sum, value) => sum + value, 0);
  return total <= CHAMPIONS_STAT_POINT_TOTAL ? next : null;
}

function buildFromSuggestion(data: PokemonData, changes?: Partial<PokemonBuild>) {
  const base = createBuild(data);
  const suggestedMoves = changes?.moves?.filter(Boolean).slice(0, 4) ?? [];
  const suggestedEvs = normalizeSuggestedEvs(changes?.evs);

  return {
    ...base,
    item: typeof changes?.item === "string" ? changes.item : base.item,
    ability: typeof changes?.ability === "string" ? changes.ability : base.ability,
    nature: typeof changes?.nature === "string" ? changes.nature : base.nature,
    megaForm: typeof changes?.megaForm === "string" ? changes.megaForm : base.megaForm,
    moves: suggestedMoves.length ? [...suggestedMoves, "", "", "", ""].slice(0, 4) : base.moves,
    evs: suggestedEvs ?? base.evs,
  } satisfies PokemonBuild;
}

function RadarStatPointInput({ stat, value, onCommit }: {
  stat: StatKey;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const safeValue = Number.isFinite(value) ? value : 0;

  const commit = (raw: string) => {
    const digits = sanitizeStatPointDigits(raw);
    const parsed = digits === "" ? 0 : Number(digits);
    onCommit(Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <label className="radar-ev-input">
      <input
        aria-label={`${stat} Stat Points`}
        type="text"
        inputMode="numeric"
        value={focused ? draft : String(safeValue)}
        onFocus={(event) => {
          setDraft(safeValue > 0 ? String(safeValue) : "");
          setFocused(true);
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(sanitizeStatPointDigits(event.target.value))}
        onBlur={() => {
          commit(draft);
          setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
            event.currentTarget.blur();
          }
        }}
      />
      <span>SP</span>
      <span className="ev-steppers">
        <button type="button" aria-label={`Increase ${stat} Stat Points by 1`} onClick={() => onCommit(safeValue + 1)}>▲</button>
        <button type="button" aria-label={`Decrease ${stat} Stat Points by 1`} onClick={() => onCommit(safeValue - 1)}>▼</button>
      </span>
    </label>
  );
}

type SavedTeam = {
  id: string;
  name: string;
  pokemon: PokemonBuild[];
  updatedAt: number;
};

function useEnterToSelectHovered<T>(select: (value: T) => void) {
  const hoveredRef = useRef<T | null>(null);
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || event.repeat) return;
      const hovered = hoveredRef.current;
      if (hovered === null) return;
      event.preventDefault();
      select(hovered);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [select]);
  return (value: T | null) => {
    hoveredRef.current = value;
  };
}

export default function Home() {
  const [team, setTeam] = useState<PokemonBuild[]>([]);
  const teamRef = useRef<PokemonBuild[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState<"import" | "export" | null>(null);
  const [transferText, setTransferText] = useState("");
  const [query, setQuery] = useState("");
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [savedTeamsReady, setSavedTeamsReady] = useState(false);
  const [activeSavedTeamId, setActiveSavedTeamId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_SAVED_TEAM_KEY);
  });
  const [teamLibraryOpen, setTeamLibraryOpen] = useState(false);
  const [saveTeamOpen, setSaveTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [draftTeamSessionId, setDraftTeamSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    if (localStorage.getItem(ACTIVE_SAVED_TEAM_KEY)) return null;
    return readDraftTeamSessionId();
  });
  const teamAssistKey = useMemo(
    () => buildTeamAssistKey(activeSavedTeamId, draftTeamSessionId),
    [activeSavedTeamId, draftTeamSessionId],
  );
  const {
    turns: assistTurns,
    setTurns: setAssistTurns,
    open: assistOpen,
    setOpen: setAssistOpen,
    draft: assistDraft,
    setDraft: setAssistDraft,
    clearChat: clearAssistChat,
    resetForTeamKey: resetAssistForTeamKey,
  } = useBuildAssistSession(teamAssistKey, savedTeamsReady);
  const assistSession: BuildAssistSessionControls = {
    turns: assistTurns,
    setTurns: setAssistTurns,
    open: assistOpen,
    setOpen: setAssistOpen,
    draft: assistDraft,
    setDraft: setAssistDraft,
    clearChat: clearAssistChat,
  };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as PokemonBuild[];
      setTeam(parsed);
      setSelectedId(parsed[0]?.id ?? null);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(team));
    teamRef.current = team;
  }, [team]);

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_TEAMS_KEY);
    const activeId = localStorage.getItem(ACTIVE_SAVED_TEAM_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedTeam[];
        if (Array.isArray(parsed)) setSavedTeams(parsed);
      } catch {
        localStorage.removeItem(SAVED_TEAMS_KEY);
      }
    }
    setActiveSavedTeamId(activeId);
    setSavedTeamsReady(true);
  }, []);

  useEffect(() => {
    if (!savedTeamsReady) return;
    localStorage.setItem(SAVED_TEAMS_KEY, JSON.stringify(savedTeams));
  }, [savedTeams, savedTeamsReady]);

  useEffect(() => {
    if (!savedTeamsReady) return;
    if (activeSavedTeamId) localStorage.setItem(ACTIVE_SAVED_TEAM_KEY, activeSavedTeamId);
    else localStorage.removeItem(ACTIVE_SAVED_TEAM_KEY);
  }, [activeSavedTeamId, savedTeamsReady]);

  useEffect(() => {
    if (!savedTeamsReady) return;
    if (activeSavedTeamId) {
      if (draftTeamSessionId) setDraftTeamSessionId(null);
      return;
    }
    let draftId = draftTeamSessionId ?? readDraftTeamSessionId();
    if (team.length > 0 && !draftId) {
      draftId = createDraftTeamSessionId();
      migrateAssistTeamKey("empty", buildTeamAssistKey(null, draftId));
      writeDraftTeamSessionId(draftId);
    }
    if (draftId !== draftTeamSessionId) setDraftTeamSessionId(draftId);
  }, [activeSavedTeamId, draftTeamSessionId, savedTeamsReady, team.length]);

  const closeBuildAssist = () => setAssistOpen(false);

  const selectPokemon = (pokemonId: string) => {
    closeBuildAssist();
    if (selectedId !== pokemonId) setSelectedId(pokemonId);
  };

  const previousSelectedIdForAssistRef = useRef(selectedId);
  useEffect(() => {
    if (previousSelectedIdForAssistRef.current === selectedId) return;
    previousSelectedIdForAssistRef.current = selectedId;
    if (selectedId) setAssistOpen(false);
  }, [selectedId, setAssistOpen]);

  const selected = team.find((pokemon) => pokemon.id === selectedId) ?? null;
  const selectedData = POKEMON.find((pokemon) => pokemon.name === selected?.species) ?? null;
  const showCoachBar = Boolean(selected && selectedData);
  const issues = useMemo(() => validateTeam(team), [team]);

  useEffect(() => {
    if (!showCoachBar && coachOpen) setCoachOpen(false);
  }, [showCoachBar, coachOpen]);

  const addPokemon = (pokemon: PokemonData) => {
    const build = createBuild(pokemon);
    setTeam((current) => [...current, build].slice(0, 6));
    setSelectedId(build.id);
    setPickerOpen(false);
    setQuery("");
  };

  const addPokemonByName = (
    pokemonName: string,
    changes?: Partial<PokemonBuild>,
    options?: { replacePokemonId?: string | null },
  ) => {
    const data = POKEMON.find((pokemon) => pokemon.name.toLowerCase() === pokemonName.toLowerCase());
    if (!data) return null;
    const build = buildFromSuggestion(data, changes);
    let roster = teamRef.current;
    if (options?.replacePokemonId) {
      roster = roster.filter((pokemon) => pokemon.id !== options.replacePokemonId);
    }
    if (roster.length >= 6) return null;
    if (roster.some((pokemon) => pokemon.species.toLowerCase() === data.name.toLowerCase())) return null;

    const nextTeam = [...roster, build];
    teamRef.current = nextTeam;
    setTeam(nextTeam);
    setSelectedId(build.id);
    setPickerOpen(false);
    setQuery("");
    return build.id;
  };

  const updateSelected = (changes: Partial<PokemonBuild>) => {
    if (!selectedId) return;
    setTeam((current) =>
      current.map((pokemon) => (pokemon.id === selectedId ? { ...pokemon, ...changes } : pokemon)),
    );
  };

  const updatePokemonById = (pokemonId: string, changes: Partial<PokemonBuild>) => {
    setTeam((current) =>
      current.map((pokemon) => (pokemon.id === pokemonId ? { ...pokemon, ...changes } : pokemon)),
    );
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const next = team.filter((pokemon) => pokemon.id !== selectedId);
    setTeam(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const removePokemonById = (pokemonId: string) => {
    const next = team.filter((pokemon) => pokemon.id !== pokemonId);
    setTeam(next);
    if (selectedId === pokemonId) setSelectedId(next[0]?.id ?? null);
  };

  const applyCoachSpread = (buildId: string, answer: CoachAnswer, recommendation: CoachRecommendation) => {
    setTeam((current) => current.map((build) => build.id === buildId ? applyCoachRecommendation(build, answer, recommendation) : build));
    setSelectedId(buildId);
  };

  const openExport = () => {
    setTransferText(exportShowdown(team));
    setTransferOpen("export");
  };

  const applyImport = () => {
    const imported = importShowdown(transferText);
    if (imported.length) {
      const nextDraftId = createDraftTeamSessionId();
      writeDraftTeamSessionId(nextDraftId);
      setDraftTeamSessionId(nextDraftId);
      setActiveSavedTeamId(null);
      resetAssistForTeamKey(buildTeamAssistKey(null, nextDraftId));
      setTeam(imported.slice(0, 6));
      setSelectedId(imported[0].id);
      setTransferOpen(null);
    }
  };

  const openSaveTeam = () => {
    const activeSavedTeam = savedTeams.find((savedTeam) => savedTeam.id === activeSavedTeamId);
    setTeamName(activeSavedTeam?.name ?? `Team ${savedTeams.length + 1}`);
    setSaveTeamOpen(true);
  };

  const saveCurrentTeam = () => {
    const name = teamName.trim();
    if (!name || !team.length) return;
    const now = Date.now();
    const snapshot = structuredClone(team);
    if (activeSavedTeamId && savedTeams.some((savedTeam) => savedTeam.id === activeSavedTeamId)) {
      setSavedTeams((current) => current.map((savedTeam) =>
        savedTeam.id === activeSavedTeamId ? { ...savedTeam, name, pokemon: snapshot, updatedAt: now } : savedTeam,
      ));
    } else {
      const id = `team-${now}-${Math.random().toString(16).slice(2)}`;
      const fromKey = buildTeamAssistKey(activeSavedTeamId, draftTeamSessionId);
      migrateAssistTeamKey(fromKey, buildTeamAssistKey(id, null));
      writeDraftTeamSessionId(null);
      setDraftTeamSessionId(null);
      setSavedTeams((current) => [{ id, name, pokemon: snapshot, updatedAt: now }, ...current]);
      setActiveSavedTeamId(id);
    }
    setSaveTeamOpen(false);
  };

  const loadSavedTeam = (savedTeam: SavedTeam) => {
    const loaded = structuredClone(savedTeam.pokemon);
    writeDraftTeamSessionId(null);
    setDraftTeamSessionId(null);
    setTeam(loaded);
    setSelectedId(loaded[0]?.id ?? null);
    setActiveSavedTeamId(savedTeam.id);
    setTeamLibraryOpen(false);
  };

  const startNewTeam = () => {
    const nextDraftId = createDraftTeamSessionId();
    writeDraftTeamSessionId(nextDraftId);
    setDraftTeamSessionId(nextDraftId);
    setTeam([]);
    setSelectedId(null);
    setActiveSavedTeamId(null);
    resetAssistForTeamKey(buildTeamAssistKey(null, nextDraftId));
    setTeamLibraryOpen(false);
  };

  const deleteSavedTeam = (savedTeam: SavedTeam) => {
    if (!window.confirm(`Delete “${savedTeam.name}”? This cannot be undone.`)) return;
    setSavedTeams((current) => current.filter((entry) => entry.id !== savedTeam.id));
    if (activeSavedTeamId === savedTeam.id) setActiveSavedTeamId(null);
  };

  const activeSavedTeam = savedTeams.find((savedTeam) => savedTeam.id === activeSavedTeamId);

  return (
    <main className={`app-shell${showCoachBar ? " has-coach-strip" : ""}${coachOpen ? " coach-open" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/pokepane-logo.png?v=3" alt="" aria-hidden="true" />
          <div>
            <strong>POKE PANE</strong>
          </div>
        </div>
        <div className="format-pill">
          <span className="live-dot" />
          Champions · Regulation MB
          <ChevronDown size={14} />
        </div>
        <div className="header-actions">
          <button className="ghost-button library-button" type="button" onClick={() => setTeamLibraryOpen(true)}>
            <FolderOpen size={16} /> My teams
            {savedTeams.length > 0 && <span className="saved-team-count">{savedTeams.length}</span>}
          </button>
          <button className="ghost-button save-team-button" type="button" onClick={openSaveTeam} disabled={!team.length}>
            <Save size={16} /> {activeSavedTeam ? "Save" : "Save team"}
          </button>
          <button className="ghost-button import-button" onClick={() => { setTransferText(""); setTransferOpen("import"); }}>
            <Upload size={16} /> Import
          </button>
          <button className="primary-button export-button" onClick={openExport} disabled={!team.length}>
            <Download size={16} /> Export team
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="team-pane" aria-label="Team roster">
          <div className="pane-heading">
            <h2>Pokémon</h2>
            <span className="team-count">{team.length}/6</span>
          </div>

          <div className="team-list">
            {team.map((pokemon) => {
              const data = POKEMON.find((entry) => entry.name === pokemon.species)!;
              const megaForm = data.megaForms?.find((form) => form.name === pokemon.megaForm);
              return (
                <button
                  className={`team-card ${selectedId === pokemon.id ? "selected" : ""}`}
                  key={pokemon.id}
                  onPointerDown={closeBuildAssist}
                  onClick={() => selectPokemon(pokemon.id)}
                >
                  <PokemonArtImage data={data} megaForm={megaForm} variant="sprite" />
                  <span className="team-card-copy">
                    <strong>{megaForm ? formatMegaFormName(megaForm.name) : pokemon.species}</strong>
                  </span>
                </button>
              );
            })}

            {Array.from({ length: 6 - team.length }).map((_, index) => (
              <button className="empty-slot" key={index} onClick={() => setPickerOpen(true)}>
                <PokeballMark size={18} />
                <span>Add Pokémon</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-area">
          {!selected || !selectedData ? (
            <EmptyEditor
              onStart={() => setPickerOpen(true)}
              team={team}
              assistSession={assistSession}
              onAddPokemon={addPokemonByName}
              onRemovePokemon={removePokemonById}
              onSelectPokemon={selectPokemon}
            />
          ) : (
            <PokemonEditor
              build={selected}
              data={selectedData}
              team={team}
              selectedId={selectedId}
              assistSession={assistSession}
              update={updateSelected}
              remove={removeSelected}
              onAddPokemon={addPokemonByName}
              onRemovePokemon={removePokemonById}
              onSelectPokemon={selectPokemon}
              onUpdatePokemon={updatePokemonById}
            />
          )}
        </section>
      </div>

      {showCoachBar ? (
        <CoachDrawer
          open={coachOpen}
          setOpen={setCoachOpen}
          team={team}
          selectedId={selectedId}
          applySpread={applyCoachSpread}
        />
      ) : null}

      {pickerOpen && (
        <PokemonPicker
          query={query}
          setQuery={setQuery}
          close={() => setPickerOpen(false)}
          add={addPokemon}
          team={team}
        />
      )}

      {transferOpen && (
        <TransferModal
          mode={transferOpen}
          text={transferText}
          setText={setTransferText}
          close={() => setTransferOpen(null)}
          applyImport={applyImport}
        />
      )}

      {teamLibraryOpen && (
        <TeamLibraryModal
          savedTeams={savedTeams}
          activeSavedTeamId={activeSavedTeamId}
          close={() => setTeamLibraryOpen(false)}
          load={loadSavedTeam}
          remove={deleteSavedTeam}
          startNew={startNewTeam}
        />
      )}

      {saveTeamOpen && (
        <SaveTeamModal
          name={teamName}
          setName={setTeamName}
          isUpdate={Boolean(activeSavedTeam)}
          close={() => setSaveTeamOpen(false)}
          save={saveCurrentTeam}
        />
      )}

    </main>
  );
}

function EmptyEditor({ onStart, team, assistSession, onAddPokemon, onRemovePokemon, onSelectPokemon }: {
  onStart: () => void;
  team: PokemonBuild[];
  assistSession: BuildAssistSessionControls;
  onAddPokemon: (pokemonName: string, changes?: Partial<PokemonBuild>, options?: { replacePokemonId?: string | null }) => string | null;
  onRemovePokemon: (pokemonId: string) => void;
  onSelectPokemon: (pokemonId: string) => void;
}) {
  return (
    <div className="empty-editor">
      <div className="orbit one" />
      <div className="orbit two" />
      <div className="anchor-orb"><PokeballMark size={34} /></div>
      <h1>Add Pokémon</h1>
      <div className="empty-editor-actions">
        <button className="primary-button large" onClick={onStart}><Plus size={18} /> Add Pokémon</button>
        <BuildAssistBubble
          team={team}
          selectedId={null}
          session={assistSession}
          onAddPokemon={onAddPokemon}
          onRemovePokemon={onRemovePokemon}
          onSelectPokemon={onSelectPokemon}
        />
      </div>
    </div>
  );
}

function PokemonEditor({
  build,
  data,
  team,
  selectedId,
  assistSession,
  update,
  remove,
  onAddPokemon,
  onRemovePokemon,
  onSelectPokemon,
  onUpdatePokemon,
}: {
  build: PokemonBuild;
  data: PokemonData;
  team: PokemonBuild[];
  selectedId: string | null;
  assistSession: BuildAssistSessionControls;
  update: (changes: Partial<PokemonBuild>) => void;
  remove: () => void;
  onAddPokemon: (pokemonName: string, changes?: Partial<PokemonBuild>, options?: { replacePokemonId?: string | null }) => string | null;
  onRemovePokemon: (pokemonId: string) => void;
  onSelectPokemon: (pokemonId: string) => void;
  onUpdatePokemon: (pokemonId: string, changes: Partial<PokemonBuild>) => void;
}) {
  const [choice, setChoice] = useState<{ kind: "item" | "ability" | "move"; moveIndex?: number } | null>(null);
  const [natureOpen, setNatureOpen] = useState(false);
  const megaForm = data.megaForms?.find((form) => form.name === build.megaForm) ?? null;
  const [artworkError, setArtworkError] = useState(false);
  const [showStatPreview, setShowStatPreview] = useState(true);
  const [showBaseStats, setShowBaseStats] = useState(false);
  useEffect(() => setArtworkError(false), [data.name, megaForm?.name]);
  useEffect(() => {
    if (Object.values(build.evs).every((statValue) => Number.isFinite(statValue))) return;
    update({
      evs: Object.fromEntries(
        Object.entries(build.evs).map(([stat, statValue]) => [stat, Number.isFinite(statValue) ? statValue : 0]),
      ) as PokemonBuild["evs"],
    });
  }, [build.evs, update]);
  const updateStat = (stat: StatKey, rawValue: number) => {
    const nextValue = Number.isFinite(rawValue) ? Math.round(rawValue) : 0;
    const used = Object.entries(build.evs)
      .filter(([key]) => key !== stat)
      .reduce((sum, [, statValue]) => sum + (Number.isFinite(statValue) ? statValue : 0), 0);
    update({
      evs: {
        ...build.evs,
        [stat]: Math.max(0, Math.min(CHAMPIONS_STAT_POINT_MAX, CHAMPIONS_STAT_POINT_TOTAL - used, nextValue)),
      },
    });
  };

  return (
    <div className="pokemon-editor">
      <div className="editor-grid">
        <div className="identity-panel">
          <button className="icon-button danger identity-remove" onClick={remove} title="Remove Pokémon" aria-label={`Remove ${build.species}`}><Trash2 size={18} /></button>
          <div className="identity-art">
            <div className={`aura aura-${data.types[0].toLowerCase()}`} />
            {!artworkError ? (
              <PokemonArtImage
                key={megaForm?.name ?? data.name}
                data={data}
                megaForm={megaForm}
                variant="artwork"
                alt={megaForm ? formatMegaFormName(megaForm.name) : data.name}
                onError={() => setArtworkError(true)}
              />
            ) : (
              <Sparkles size={26} aria-label={`${megaForm?.name ?? data.name} artwork unavailable`} />
            )}
          </div>
          <div className="identity-copy">
            <h1>{megaForm ? formatMegaFormName(megaForm.name) : build.species}</h1>
            <div className="type-row">{(megaForm?.types ?? data.types).map((type) => <span className={`type type-${type.toLowerCase()}`} key={type}>{type}</span>)}</div>
          </div>
        </div>
        <div className="stats-panel">
          <div className="section-title stat-panel-header">
            <h3>Stat Web</h3>
            <div className="stat-actions">
              {!!data.megaForms?.length && (
                <MegaToggle forms={data.megaForms} selected={megaForm?.name ?? null} select={(name) => update({ megaForm: name ?? undefined })} />
              )}
              <button
                type="button"
                className={`stat-view-toggle ${showStatPreview ? "active" : ""}`}
                aria-pressed={showStatPreview}
                onClick={() => setShowStatPreview((value) => !value)}
              >
                <Layers size={12} />
                <span>Stat preview</span>
              </button>
              <BaseStatsToggle active={showBaseStats} onToggle={() => setShowBaseStats((value) => !value)} />
              <span className="ev-budget">{CHAMPIONS_STAT_POINT_TOTAL - Object.values(build.evs).reduce((sum, statValue) => sum + (Number.isFinite(statValue) ? statValue : 0), 0)} Stat Points left</span>
              <button
                className="reset-stats"
                type="button"
                disabled={Object.values(build.evs).every((value) => value === 0)}
                onClick={() => update({ evs: { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 } })}
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
          </div>
          <StatRadar data={data} megaForm={megaForm} build={build} updateStat={updateStat} showStatPreview={showStatPreview} showBaseStats={showBaseStats} />
        </div>

        <div className="loadout-panel">
          <section className="loadout-section moves-section" aria-labelledby="moves-heading">
            <h3 id="moves-heading">Moves</h3>
            <div className="moves-grid">
              {build.moves.map((move, index) => (
                <MoveChoiceCard key={index} index={index} value={move} onClick={() => setChoice({ kind: "move", moveIndex: index })} />
              ))}
            </div>
          </section>

          <div className="loadout-details">
            <section className="loadout-section" aria-labelledby="ability-heading">
              <h3 id="ability-heading">Ability</h3>
              <AbilityField value={build.ability} onClick={() => setChoice({ kind: "ability" })} />
            </section>
            <section className="loadout-section" aria-labelledby="item-heading">
              <h3 id="item-heading">Held Item</h3>
              <ItemField value={build.item} onClick={() => setChoice({ kind: "item" })} />
            </section>
          </div>

          <section className="loadout-section nature-section" aria-labelledby="nature-heading">
            <h3 id="nature-heading">Nature</h3>
            <NatureField value={build.nature} onClick={() => setNatureOpen(true)} />
          </section>

          <BuildAssistBubble
            team={team}
            selectedId={selectedId}
            session={assistSession}
            onAddPokemon={onAddPokemon}
            onRemovePokemon={onRemovePokemon}
            onUpdateSelected={update}
            onSelectPokemon={onSelectPokemon}
            onUpdatePokemon={onUpdatePokemon}
          />
        </div>
      </div>
      {choice && (
        <LoadoutChoiceSheet
          choice={choice}
          data={data}
          build={build}
          close={() => setChoice(null)}
          select={(value) => {
            if (choice.kind === "item") update({ item: value });
            if (choice.kind === "ability") update({ ability: value });
            if (choice.kind === "move" && choice.moveIndex !== undefined) {
              const duplicateIndex = build.moves.findIndex((entry, index) => entry === value && index !== choice.moveIndex);
              if (duplicateIndex >= 0) return;
              const moves = [...build.moves];
              moves[choice.moveIndex] = value;
              update({ moves });
            }
            setChoice(null);
          }}
        />
      )}
      {natureOpen && (
        <NatureChoiceSheet
          value={build.nature}
          close={() => setNatureOpen(false)}
          select={(nature) => {
            update({ nature });
            setNatureOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BaseStatsToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`base-stats-toggle ${active ? "active" : ""}`}
      aria-pressed={active}
      onClick={onToggle}
    >
      <BarChart2 size={11} />
      <span>Base stats</span>
      <i aria-hidden="true"><b /></i>
    </button>
  );
}

function formatMegaFormName(name: string) {
  const [species, suffix = ""] = name.split("-Mega");
  return `Mega ${species}${suffix ? ` ${suffix.replace(/-/g, " ").trim()}` : ""}`;
}

function PokemonArtImage({ data, megaForm, variant, alt, onError }: {
  data: PokemonData;
  megaForm?: MegaForm | null;
  variant: "sprite" | "artwork";
  alt?: string;
  onError?: () => void;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(
    () => megaForm
      ? megaFormArtworkUrls(megaForm, data, variant)
      : [variant === "sprite" ? data.sprite : data.artwork],
    [data, megaForm, variant],
  );
  useEffect(() => setSourceIndex(0), [sources]);
  useEffect(() => {
    if (!sources.length) onError?.();
  }, [sources, onError]);
  const src = sources[sourceIndex];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt ?? data.name}
      onError={() => {
        if (sourceIndex < sources.length - 1) setSourceIndex((index) => index + 1);
        else onError?.();
      }}
    />
  );
}

function applyOpponentFormToQuestion(
  question: string,
  originalOpponentName: string,
  nextDisplayName: string,
  baseSpecies?: string,
) {
  if (originalOpponentName === nextDisplayName) return question;
  const escaped = originalOpponentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "gi");
  if (pattern.test(question)) return question.replace(pattern, nextDisplayName);
  if (baseSpecies && baseSpecies !== nextDisplayName) {
    const basePattern = new RegExp(`\\b${baseSpecies.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    if (basePattern.test(question)) return question.replace(basePattern, nextDisplayName);
  }
  return question;
}

function MegaToggle({ forms, selected, select, compact = false }: { forms: MegaForm[]; selected: string | null; select: (name: string | null) => void; compact?: boolean }) {
  const label = (name: string) => name.split("-").slice(1).join(" ").replace("Mega", "Mega") || "Mega";
  const active = selected !== null;
  return (
    <div className={`mega-toggle-wrap ${compact ? "compact" : ""}`}>
      {active && forms.length > 1 && (
        <div className="mega-variants" role="group" aria-label="Choose Mega Evolution">
          {forms.map((form) => (
            <button
              type="button"
              className={selected === form.name ? "active" : ""}
              aria-pressed={selected === form.name}
              onClick={() => select(form.name)}
              key={form.name}
            >
              {label(form.name)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`mega-toggle ${active ? "active" : ""}`}
        aria-pressed={active}
        onClick={() => select(active ? null : forms[0].name)}
      >
        <Sparkles size={compact ? 10 : 11} />
        {!compact && <span>Mega preview</span>}
        <i aria-hidden="true"><b /></i>
      </button>
    </div>
  );
}

function StatRadar({ data, megaForm, build, updateStat, showStatPreview, showBaseStats }: { data: PokemonData; megaForm: MegaForm | null; build: PokemonBuild; updateStat: (stat: StatKey, value: number) => void; showStatPreview: boolean; showBaseStats: boolean }) {
  const stats: StatKey[] = ["HP", "Atk", "Def", "Spe", "SpD", "SpA"];
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const labels: Record<StatKey, string> = compact
    ? { HP: "HP", Atk: "Atk", Def: "Def", SpA: "SpA", SpD: "SpD", Spe: "Spe" }
    : { HP: "HP", Atk: "Attack", Def: "Defense", SpA: "Sp. Atk", SpD: "Sp. Def", Spe: "Speed" };
  const baseStats = megaForm?.stats ?? data.stats;
  const pad = compact ? 38 : 56;
  const viewSize = 240 + pad * 2;
  const centerX = 120 + pad;
  const centerY = 120 + pad;
  const radius = compact ? 86 : 114;
  const minRatio = 0.34;
  const nodeOffset = compact ? 7 : 14;
  const topNodeOffset = compact ? 4 : 10;
  const handleRadius = compact ? 4.5 : 5.5;
  const nodeTransforms = [
    `translate(-50%, calc(-100% - ${topNodeOffset}px))`,
    `translate(${nodeOffset}px, -50%)`,
    `translate(${nodeOffset}px, -50%)`,
    `translate(-50%, ${nodeOffset}px)`,
    `translate(calc(-100% - ${nodeOffset}px), -50%)`,
    `translate(calc(-100% - ${nodeOffset}px), -50%)`,
  ];
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 6;
    const safeRatio = Number.isFinite(ratio) ? ratio : minRatio;
    return [centerX + Math.cos(angle) * radius * safeRatio, centerY + Math.sin(angle) * radius * safeRatio];
  };
  const safeEv = (stat: StatKey) => {
    const ev = build.evs[stat];
    return Number.isFinite(ev) ? ev : 0;
  };
  const evRatio = (ev: number) => minRatio + ((Number.isFinite(ev) ? ev : 0) / CHAMPIONS_STAT_POINT_MAX) * (1 - minRatio);
  const evRatios = stats.map((stat) => evRatio(safeEv(stat)));
  const polygon = evRatios.map((value, index) => point(index, value).join(",")).join(" ");
  const rawBases = stats.map((stat) => baseStats[stat]);
  const battleStats = stats.map((stat) => calculateStat(baseStats[stat], safeEv(stat), stat, build.nature));
  const chartMin = Math.min(...rawBases);
  const chartMax = Math.max(
    ...stats.map((stat) => calculateStat(baseStats[stat], CHAMPIONS_STAT_POINT_MAX, stat, build.nature)),
  );
  const chartSpan = chartMax - chartMin || 1;
  const scaleRatio = (value: number) => minRatio + 0.06 + ((value - chartMin) / chartSpan) * (1 - minRatio - 0.09);
  const baseRatios = rawBases.map(scaleRatio);
  const profileRatios = battleStats.map(scaleRatio);
  const previewRatios = showBaseStats ? baseRatios : profileRatios;
  const previewPolygon = previewRatios.map((value, index) => point(index, value).join(",")).join(" ");
  const displayStat = (stat: StatKey) =>
    showBaseStats ? baseStats[stat] : calculateStat(baseStats[stat], safeEv(stat), stat, build.nature);
  const dragStat = (event: React.PointerEvent<SVGCircleElement>, stat: StatKey, index: number) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * viewSize;
    const y = ((event.clientY - bounds.top) / bounds.height) * viewSize;
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 6;
    const projected = ((x - centerX) * Math.cos(angle) + (y - centerY) * Math.sin(angle)) / radius;
    const raw = ((projected - minRatio) / (1 - minRatio)) * CHAMPIONS_STAT_POINT_MAX;
    updateStat(stat, Math.max(0, Math.min(CHAMPIONS_STAT_POINT_MAX, Math.round(raw))));
  };
  const statNode = (stat: StatKey, index: number) => {
    const effect = getNatureEffect(build.nature, stat);
    const [x, y] = point(index, 1);
    return (
      <div
        className="radar-stat-node"
        key={stat}
        style={{ left: `${(x / viewSize) * 100}%`, top: `${(y / viewSize) * 100}%`, transform: nodeTransforms[index] }}
      >
        <span className={`radar-stat-label ${effect > 1 ? "boosted" : effect < 1 ? "lowered" : ""}`}>
          {labels[stat]}{effect > 1 ? " ↑" : effect < 1 ? " ↓" : ""}
        </span>
        <div className={`radar-stat-bubble${showBaseStats ? " is-base" : ""}`}>
          <strong>{displayStat(stat)}</strong>
        </div>
        <RadarStatPointInput
          stat={stat}
          value={safeEv(stat)}
          onCommit={(value) => updateStat(stat, value)}
        />
      </div>
    );
  };

  return (
    <div className={`stat-radar-layout${compact ? " stat-radar-layout-compact" : ""}`}>
      <div className={`radar-stage${compact ? " radar-stage-compact" : ""}`}>
        <svg className="radar" viewBox={`0 0 ${viewSize} ${viewSize}`} role="img" aria-label="Stat Point allocation radar chart">
          <defs>
            <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#82f7c9" /><stop offset="1" stopColor="#7b8cff" /></linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((ring) => <polygon key={ring} className="radar-ring" points={stats.map((_, index) => point(index, ring).join(",")).join(" ")} />)}
          {stats.map((stat, index) => {
            const [x, y] = point(index, 1);
            return <line key={stat} className="radar-axis" x1={centerX} y1={centerY} x2={x} y2={y} />;
          })}
          {showStatPreview && (
            <>
              <polygon className={`radar-shape-preview${showBaseStats ? " is-base" : ""}`} points={previewPolygon} />
              {previewRatios.map((ratio, index) => {
                const [x, y] = point(index, ratio);
                return (
                  <circle
                    className={`radar-preview-node${showBaseStats ? " is-base" : ""}`}
                    key={`preview-${stats[index]}`}
                    cx={x}
                    cy={y}
                    r={handleRadius - 1}
                  />
                );
              })}
            </>
          )}
          <polygon className="radar-shape" points={polygon} />
          {stats.map((stat, index) => {
            const [x, y] = point(index, evRatios[index]);
            return (
              <circle
                className="radar-handle"
                key={stat}
                cx={x}
                cy={y}
                r={handleRadius}
                role="slider"
                tabIndex={0}
                aria-label={`${labels[stat]} Stat Points`}
                aria-valuemin={0}
                aria-valuemax={CHAMPIONS_STAT_POINT_MAX}
                aria-valuenow={safeEv(stat)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowRight") updateStat(stat, safeEv(stat) + 1);
                  if (event.key === "ArrowDown" || event.key === "ArrowLeft") updateStat(stat, safeEv(stat) - 1);
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragStat(event, stat, index);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) dragStat(event, stat, index);
                }}
              />
            );
          })}
        </svg>
        <div className="radar-stat-overlay">
          {stats.map((stat, index) => statNode(stat, index))}
        </div>
      </div>
    </div>
  );
}

function NatureChart({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const setEnterHovered = useEnterToSelectHovered(onChange);
  return (
    <div className="nature-chart-wrap">
      <div className="nature-chart-heading">
        <span>Nature</span>
        <div className="nature-chart-actions">
          <small><i className="nature-up" /> Raises <i className="nature-down" /> Lowers</small>
          {value && <button className="clear-choice" type="button" onClick={() => onChange("")}><X size={13} /> Clear nature</button>}
        </div>
      </div>
      <div className="nature-chart" role="group" aria-label="Pokémon nature chart">
        <div className="nature-corner"><span>Raises</span><small>Lowers →</small></div>
        {NATURE_STATS.map((stat) => <div className="nature-stat nature-stat-column" key={`down-${stat}`}>-{stat}</div>)}
        {NATURE_CHART.map((row, rowIndex) => (
          <Fragment key={NATURE_STATS[rowIndex]}>
            <div className="nature-stat nature-stat-row">+{NATURE_STATS[rowIndex]}</div>
            {row.map((nature, columnIndex) => {
              const neutral = rowIndex === columnIndex;
              return (
                <button
                  className={`nature-cell ${neutral ? "neutral" : ""} ${value === nature ? "selected" : ""}`}
                  key={nature}
                  type="button"
                  title={neutral ? `${nature}: neutral nature` : `${nature}: raises ${NATURE_STATS[rowIndex]}, lowers ${NATURE_STATS[columnIndex]}`}
                  aria-pressed={value === nature}
                  onClick={() => onChange(nature)}
                  onPointerEnter={() => setEnterHovered(nature)}
                  onPointerLeave={() => setEnterHovered(null)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    onChange(nature);
                  }}
                >
                  {nature}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function natureSummary(nature: string) {
  if (!nature) return "";
  for (let rowIndex = 0; rowIndex < NATURE_CHART.length; rowIndex += 1) {
    const columnIndex = NATURE_CHART[rowIndex].findIndex((entry) => entry === nature);
    if (columnIndex < 0) continue;
    if (rowIndex === columnIndex) return "Neutral stats";
    return `+${NATURE_STATS[rowIndex]}  ·  −${NATURE_STATS[columnIndex]}`;
  }
  return "";
}

function MoveCategoryIcon({ category, size = 18 }: { category?: string; size?: number }) {
  const normalized = category?.toLowerCase() || "status";
  const label = normalized === "physical" ? "Physical move" : normalized === "special" ? "Special move" : "Status move";
  return (
    <span className={`move-category-icon category-${normalized}`} role="img" aria-label={label} title={label} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {normalized === "physical" ? (
          <path d="M12 2.5l2.1 5 5.3-2-2.1 5.1 4.2 1.8-4.7 2 2 5.2-5.1-2.2-1.8 4.1-1.9-4.2-5.3 2.1 2.1-5-4.3-1.9 4.8-2-2-5.2 5.1 2.1L12 2.5z" />
        ) : normalized === "special" ? (
          <>
            <circle cx="12" cy="12" r="2.2" />
            <path d="M7.6 8.1a5.6 5.6 0 010 7.8M10 5.2a9.4 9.4 0 010 13.6M16.4 8.1a5.6 5.6 0 000 7.8M14 5.2a9.4 9.4 0 000 13.6" fill="none" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="8" fill="none" />
            <path d="M12 4a4 4 0 010 8 4 4 0 000 8" fill="none" />
            <circle cx="12" cy="8" r="1.2" />
            <circle cx="12" cy="16" r="1.2" className="status-cutout" />
          </>
        )}
      </svg>
    </span>
  );
}

function MoveTypeIcon({ type, size = 36 }: { type?: string; size?: number }) {
  const normalized = type?.toLowerCase() || "normal";
  const iconSize = Math.round(size * 0.52);
  const icon = (() => {
    switch (normalized) {
      case "fire": return <Flame size={iconSize} />;
      case "water": return <Droplets size={iconSize} />;
      case "electric": return <Zap size={iconSize} />;
      case "grass": return <Leaf size={iconSize} />;
      case "ice": return <Snowflake size={iconSize} />;
      case "fighting": return <Swords size={iconSize} />;
      case "poison": return <FlaskConical size={iconSize} />;
      case "ground": return <Mountain size={iconSize} />;
      case "flying": return <Wind size={iconSize} />;
      case "psychic": return <Eye size={iconSize} />;
      case "bug": return <Bug size={iconSize} />;
      case "rock": return <Gem size={iconSize} />;
      case "ghost": return <Ghost size={iconSize} />;
      case "dragon": return <Orbit size={iconSize} />;
      case "dark": return <Moon size={iconSize} />;
      case "steel": return <Shield size={iconSize} />;
      case "fairy": return <Sparkles size={iconSize} />;
      default: return <Circle size={iconSize} />;
    }
  })();
  return (
    <span className={`move-type-icon type-${normalized}`} role="img" aria-label={`${type || "Normal"} type`} title={`${type || "Normal"} type`} style={{ width: size, height: size }}>
      {icon}
    </span>
  );
}

function MoveChoiceCard({ index, value, onClick }: { index: number; value: string; onClick: () => void }) {
  const details = value ? OPTION_DETAILS.moves[value] : undefined;
  const powerLabel = details?.power ? `${details.power} BP` : "Status";
  return (
    <button className={`move-card ${value ? "selected" : ""}`} type="button" onClick={onClick} aria-label={`${value ? "Change" : "Choose"} move ${index + 1}`}>
      {value && details?.type ? (
        <MoveTypeIcon type={details.type} size={28} />
      ) : (
        <span className="loadout-slot-empty" aria-hidden="true" />
      )}
      <span className="move-card-body">
        <strong className={!value ? "placeholder" : ""}>{value || "Choose move"}</strong>
        {value && details && (
          <small>
            {details.type}
            <i>·</i>
            {details.category}
            <i>·</i>
            {powerLabel}
          </small>
        )}
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

function AbilityField({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <button className="loadout-slot" type="button" onClick={onClick} aria-label={value ? `Change ability ${value}` : "Choose an ability"}>
      <span className="loadout-slot-body">
        <strong className={!value ? "placeholder" : ""}>{value || "Choose ability"}</strong>
        {value && <small>{OPTION_DETAILS.abilities[value]?.description || "No description available."}</small>}
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

function ItemField({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <button className="loadout-slot" type="button" onClick={onClick} aria-label={value ? `Change held item ${value}` : "Choose a held item"}>
      {value ? <ItemSprite name={value} size={28} /> : <span className="loadout-slot-empty" aria-hidden="true" />}
      <span className="loadout-slot-body">
        <strong className={!value ? "placeholder" : ""}>{value || "Choose item"}</strong>
        {value && <small>{itemCategory(value)}</small>}
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

function NatureField({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <button className="nature-field" type="button" onClick={onClick} aria-label={value ? `Change nature ${value}` : "Choose a nature"}>
      <span>
        <strong className={!value ? "placeholder" : ""}>{value || "Choose a nature"}</strong>
        {value && <small>{natureSummary(value)}</small>}
      </span>
      <ChevronRight size={14} />
    </button>
  );
}

function ChoiceField({ label, value, placeholder, compact, onClick }: { label?: string; value: string; placeholder: string; compact?: boolean; onClick: () => void }) {
  return (
    <label className={`choice-field ${compact ? "compact" : ""}`}>
      {label && <span>{label}</span>}
      <button type="button" onClick={onClick} aria-label={value ? `Change ${value}` : placeholder}>
        <strong className={!value ? "placeholder" : ""}>{value || placeholder}</strong>
        <ChevronRight size={14} />
      </button>
    </label>
  );
}

function NatureChoiceSheet({ value, close, select }: { value: string; close: () => void; select: (nature: string) => void }) {
  return (
    <div className="modal-backdrop loadout-backdrop" onMouseDown={close}>
      <section className="choice-sheet nature-choice-sheet" onMouseDown={(event) => event.stopPropagation()} aria-label="Choose a nature">
        <button className="modal-close" onClick={close} aria-label="Close nature picker"><X size={18} /></button>
        <div className="nature-choice-content">
          <NatureChart value={value} onChange={select} />
        </div>
      </section>
    </div>
  );
}

const MOVE_UTILITY_PRIORITY = new Set(["Protect", "Fake Out", "Tailwind", "Trick Room", "Icy Wind", "Wide Guard", "Follow Me", "Rage Powder", "Helping Hand", "Snarl", "Will-O-Wisp", "Thunder Wave", "Swords Dance", "Nasty Plot"]);
const ITEM_RECOMMENDATIONS = ["Focus Sash", "Sitrus Berry", "Leftovers", "Life Orb", "Choice Scarf", "Choice Band", "Choice Specs", "Assault Vest", "Clear Amulet", "Covert Cloak", "Safety Goggles", "Rocky Helmet", "Booster Energy"];
const ITEM_CATEGORIES = ["Offense & Boosters", "Recovery & Defense", "Choice Gear", "Berries", "Utility", "Mega Stones"] as const;

function moveUsefulness(move: string, pokemon: PokemonData) {
  const detail = OPTION_DETAILS.moves[move];
  if (!detail) return 0;
  let score = MOVE_UTILITY_PRIORITY.has(move) ? 120 : 0;
  if (detail.type && pokemon.types.includes(detail.type)) score += 38;
  if (detail.priority && detail.priority > 0) score += detail.priority * 24;
  if (detail.power) score += detail.power * (detail.accuracy === true ? 1 : (typeof detail.accuracy === "number" ? detail.accuracy / 100 : 0.75));
  if (detail.category === "Status" && !MOVE_UTILITY_PRIORITY.has(move)) score += 18;
  return score;
}

function itemCategory(item: string) {
  const description = OPTION_DETAILS.items[item]?.description.toLowerCase() || "";
  if (description.includes("mega evolve")) return "Mega Stones";
  if (item.includes("Berry")) return "Berries";
  if (item.startsWith("Choice ")) return "Choice Gear";
  if (/orb|belt|policy|booster|gem|seed|herb|coal|magnet|plate|glasses|fang|beak|spoon|incense/i.test(item)) return "Offense & Boosters";
  if (/vest|sash|leftovers|helmet|eviolite|cloak|goggles|boots|bulb|sludge/i.test(item) || /recover|heals|damage taken|defense|special defense/i.test(description)) return "Recovery & Defense";
  return "Utility";
}

function itemRole(category: string) {
  if (category === "Offense & Boosters" || category === "Choice Gear") return "Offense";
  if (category === "Recovery & Defense" || category === "Berries") return "Defense";
  if (category === "Mega Stones") return "Mega";
  return "Utility";
}

function ItemCategoryIcon({ category, size = 18 }: { category?: string; size?: number }) {
  const iconSize = Math.round(size * 0.58);
  const icon = (() => {
    switch (category) {
      case "Offense & Boosters": return <Swords size={iconSize} />;
      case "Recovery & Defense": return <Shield size={iconSize} />;
      case "Choice Gear": return <Package size={iconSize} />;
      case "Berries": return <Leaf size={iconSize} />;
      case "Mega Stones": return <Gem size={iconSize} />;
      case "Recommended": return <Sparkles size={iconSize} />;
      default: return <FlaskConical size={iconSize} />;
    }
  })();
  const slug = category?.toLowerCase().replace(/[^\w]+/g, "-") || "utility";
  return (
    <span className={`item-category-icon category-${slug}`} role="img" aria-label={category || "Utility"} title={category || "Utility"} style={{ width: size, height: size }}>
      {icon}
    </span>
  );
}

function ItemSprite({ name, category, size = 38 }: { name: string; category?: string; size?: number }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => itemSpriteFallbackUrls(name), [name]);
  const categoryLabel = category || itemCategory(name);
  const src = sources[sourceIndex];
  if (!name.trim() || !src) {
    return <ItemCategoryIcon category={categoryLabel} size={size} />;
  }
  return (
    <span className="item-sprite" style={{ width: size, height: size }} role="img" aria-label={name} title={name}>
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setSourceIndex((index) => index + 1)}
      />
    </span>
  );
}

function LoadoutChoiceSheet({ choice, data, build, close, select }: {
  choice: { kind: "item" | "ability" | "move"; moveIndex?: number };
  data: PokemonData;
  build: PokemonBuild;
  close: () => void;
  select: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState("");
  const [pinned, setPinned] = useState("");
  const [moveTab, setMoveTab] = useState("Recommended");
  const [itemTab, setItemTab] = useState("Recommended");
  const title = choice.kind === "item" ? "Choose a held item" : choice.kind === "ability" ? "Choose an ability" : `Choose move ${(choice.moveIndex ?? 0) + 1}`;
  const current = choice.kind === "item" ? build.item : choice.kind === "ability" ? build.ability : build.moves[choice.moveIndex ?? 0];
  const options = choice.kind === "item"
    ? data.items
    : choice.kind === "ability"
      ? data.abilities
      : data.moves.filter((move) => {
        const duplicateIndex = build.moves.findIndex((entry, index) => entry === move && index !== (choice.moveIndex ?? -1));
        return duplicateIndex < 0;
      });
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  const pinnedActive = pinned && filtered.includes(pinned) ? pinned : "";
  const active = pinnedActive || focused || (current && filtered.includes(current) ? current : "");
  const details = choice.kind === "item"
    ? OPTION_DETAILS.items[active]
    : choice.kind === "ability"
      ? OPTION_DETAILS.abilities[active]
      : OPTION_DETAILS.moves[active];
  const moveDetails = choice.kind === "move" ? details : undefined;
  const itemDetails = choice.kind === "item" ? details : undefined;
  const activeItemCategory = choice.kind === "item" && active ? itemCategory(active) : "Utility";
  const moveType = moveDetails?.type?.toLowerCase();
  const accuracy = moveDetails?.accuracy === true
    ? "Always"
    : typeof moveDetails?.accuracy === "number"
      ? `${moveDetails.accuracy}%`
      : "--";
  const recommended = choice.kind === "move"
    ? [...filtered].sort((a, b) => moveUsefulness(b, data) - moveUsefulness(a, data)).slice(0, 6)
    : ITEM_RECOMMENDATIONS.filter((item) => filtered.includes(item)).slice(0, 6);
  const moveTabs = [
    { name: "Recommended", count: recommended.length },
    ...["Physical", "Special", "Status"].map((category) => ({ name: category, count: filtered.filter((option) => OPTION_DETAILS.moves[option]?.category === category).length })),
  ];
  const itemTabs = [
    { name: "Recommended", count: recommended.length },
    ...ITEM_CATEGORIES.map((category) => ({ name: category, count: filtered.filter((option) => itemCategory(option) === category).length })),
  ];
  const getMoveTabOptions = (tab: string) => tab === "Recommended"
    ? recommended
    : filtered.filter((option) => OPTION_DETAILS.moves[option]?.category === tab).sort((a, b) => moveUsefulness(b, data) - moveUsefulness(a, data));
  const getItemTabOptions = (tab: string) => tab === "Recommended"
    ? recommended
    : filtered.filter((option) => itemCategory(option) === tab);
  const searching = query.trim().length > 0;
  const moveTabOptions = searching
    ? [...filtered].sort((a, b) => moveUsefulness(b, data) - moveUsefulness(a, data))
    : getMoveTabOptions(moveTab);
  const itemTabOptions = searching
    ? [...filtered].sort((a, b) => a.localeCompare(b))
    : getItemTabOptions(itemTab);
  const confirmOptionOnEnter = (event: KeyboardEvent<HTMLButtonElement>, option: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    select(option);
  };
  const previewOption = (option: string) => {
    setPinned(option);
    setFocused(option);
  };

  return (
    <div className="modal-backdrop loadout-backdrop" onMouseDown={close}>
      <section className={`choice-sheet ${choice.kind}-choice-sheet`} onMouseDown={(event) => event.stopPropagation()} aria-label={title}>
        <button className="modal-close" onClick={close} aria-label="Close selector"><X size={18} /></button>
        {choice.kind === "ability" ? (
          <div className="ability-choice-content">
            <div className="ability-option-list">
              {options.map((option) => (
                <button
                  className={`ability-option ${current === option ? "selected" : ""} ${active === option ? "previewing" : ""}`}
                  key={option}
                  type="button"
                  aria-pressed={active === option}
                  onClick={() => previewOption(option)}
                  onFocus={() => setFocused(option)}
                  onKeyDown={(event) => confirmOptionOnEnter(event, option)}
                >
                  <span className="ability-option-copy">
                    <strong>{option}</strong>
                    <small>{OPTION_DETAILS.abilities[option]?.description || "No description available."}</small>
                  </span>
                  {current === option ? <ShieldCheck size={16} aria-label="Currently selected" /> : <ChevronRight size={16} />}
                </button>
              ))}
              {!!data.megaForms?.some((form) => form.ability) && (
                <div className="mega-ability-section" aria-label="Mega Evolution abilities">
                  <div className="mega-ability-heading">
                    <span>Mega Evolution</span>
                    <small>Reference only</small>
                  </div>
                  {data.megaForms.filter((form) => form.ability).map((form) => (
                    <div className="mega-ability-reference" key={form.name}>
                      <span className="mega-ability-icon"><Sparkles size={16} /></span>
                      <span className="ability-option-copy">
                        <small>{formatMegaFormName(form.name)}</small>
                        <strong>{form.ability}</strong>
                        <small>{OPTION_DETAILS.abilities[form.ability]?.description || "This ability becomes active after Mega Evolution."}</small>
                      </span>
                      <span className="mega-only-badge">Mega only</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="ability-choice-action">
              <span><small>Ready to use</small><strong>{active}</strong></span>
              {current && <button className="clear-choice" type="button" onClick={() => select("")}>Clear ability</button>}
              <button className="primary-button" type="button" onClick={() => select(active)} disabled={!active}>{current === active ? "Keep" : "Choose"} {active}</button>
            </div>
          </div>
        ) : choice.kind === "item" ? (
          <div className="move-browser item-browser">
              <div className="move-browser-controls">
              <div className="search-box"><Search size={17} /><input autoFocus placeholder="Search items..." value={query} onChange={(event) => { setQuery(event.target.value); setFocused(""); }} onKeyDown={(event) => { if (event.key === "Enter" && active) { event.preventDefault(); event.stopPropagation(); select(active); } }} /></div>
              <div className={`move-category-tabs${searching ? " is-dimmed" : ""}`} role="tablist" aria-label="Item categories">
                {itemTabs.map((tab) => (
                  <button
                    key={tab.name}
                    type="button"
                    role="tab"
                    aria-selected={itemTab === tab.name}
                    className={itemTab === tab.name ? "active" : ""}
                    onClick={() => {
                      setItemTab(tab.name);
                    }}
                  >
                    {tab.name === "Recommended" ? <Sparkles size={14} /> : <ItemCategoryIcon category={tab.name} size={18} />}
                    <span>{tab.name === "Recommended" ? "Recommended" : tab.name.replace(" & ", " ")}</span>
                    <small>{tab.count}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="move-browser-results" role="tabpanel">
              <div className="move-browser-heading">
                <span>{searching ? "Search results" : itemTab}</span>
                <small>{itemTabOptions.length} items</small>
              </div>
              <div className="move-browser-grid">
                {itemTabOptions.map((option) => {
                  const category = itemCategory(option);
                  return (
                    <button
                      className={`move-browser-card ${current === option ? "selected" : ""} ${active === option ? "previewing" : ""}`}
                      key={option}
                      type="button"
                      aria-pressed={active === option}
                      onClick={() => previewOption(option)}
                      onFocus={() => setFocused(option)}
                      onKeyDown={(event) => confirmOptionOnEnter(event, option)}
                    >
                      <ItemSprite name={option} category={category} size={38} />
                      <span className="move-browser-card-copy">
                        <strong>{option}</strong>
                        <small>
                          {category}
                          <i>·</i>
                          {itemRole(category)}
                        </small>
                      </span>
                      {current === option ? <ShieldCheck size={16} aria-label="Currently selected" /> : <ChevronRight size={16} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="move-preview-footer">
              <div className="move-preview-identity">
                <ItemSprite name={active} category={activeItemCategory} size={44} />
                <span>
                  <small>Item preview</small>
                  <strong>{active || "Choose an item"}</strong>
                  <em>{activeItemCategory}{active ? ` · ${itemRole(activeItemCategory)}` : ""}</em>
                </span>
              </div>
              <p>{itemDetails?.description || "Click an item to preview what it does."}</p>
              <div className="move-preview-stats">
                <span><small>Category</small><strong>{active ? activeItemCategory.split(" ")[0] : "--"}</strong></span>
                <span><small>Role</small><strong>{active ? itemRole(activeItemCategory) : "--"}</strong></span>
                <span><small>Slot</small><strong>Held</strong></span>
              </div>
              <div className="move-preview-actions">
                {current && <button className="clear-choice" type="button" onClick={() => select("")}><X size={14} /> Clear item</button>}
                <button className="primary-button" type="button" onClick={() => select(active)} disabled={!active}>{current === active ? "Keep" : "Choose"} {active}</button>
              </div>
            </div>
          </div>
        ) : choice.kind === "move" ? (
          <div className={`move-browser move-detail-${moveType || "normal"}`}>
            <div className="move-browser-controls">
              <div className="search-box"><Search size={17} /><input autoFocus placeholder="Search moves..." value={query} onChange={(event) => { setQuery(event.target.value); setFocused(""); }} onKeyDown={(event) => { if (event.key === "Enter" && active) { event.preventDefault(); event.stopPropagation(); select(active); } }} /></div>
              <div className={`move-category-tabs${searching ? " is-dimmed" : ""}`} role="tablist" aria-label="Move categories">
                {moveTabs.map((tab) => (
                  <button
                    key={tab.name}
                    type="button"
                    role="tab"
                    aria-selected={moveTab === tab.name}
                    className={moveTab === tab.name ? "active" : ""}
                    onClick={() => {
                      setMoveTab(tab.name);
                    }}
                  >
                    {tab.name === "Recommended" ? <Sparkles size={14} /> : <MoveCategoryIcon category={tab.name} size={18} />}
                    <span>{tab.name}</span>
                    <small>{tab.count}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="move-browser-results" role="tabpanel">
              <div className="move-browser-heading">
                <span>{searching ? "Search results" : moveTab}</span>
                <small>{moveTabOptions.length} moves</small>
              </div>
              <div className="move-browser-grid">
                {moveTabOptions.map((option) => {
                  const optionDetails = OPTION_DETAILS.moves[option];
                  return (
                    <button
                      className={`move-browser-card ${current === option ? "selected" : ""} ${active === option ? "previewing" : ""}`}
                      key={option}
                      type="button"
                      aria-pressed={active === option}
                      onClick={() => previewOption(option)}
                      onDoubleClick={() => select(option)}
                      onFocus={() => setFocused(option)}
                      onKeyDown={(event) => confirmOptionOnEnter(event, option)}
                    >
                      <MoveTypeIcon type={optionDetails?.type} size={38} />
                      <span className="move-browser-card-copy">
                        <strong>{option}</strong>
                        <small>
                          {optionDetails?.type || "Move"}
                          <i>·</i>
                          <MoveCategoryIcon category={optionDetails?.category} size={13} />
                          {optionDetails?.category || "Move"}
                          {optionDetails?.power ? <><i>·</i>{optionDetails.power} power</> : null}
                        </small>
                      </span>
                      {current === option ? <ShieldCheck size={16} aria-label="Currently selected" /> : <ChevronRight size={16} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="move-preview-footer">
              <div className="move-preview-identity">
                <MoveTypeIcon type={moveDetails?.type} size={44} />
                <span>
                  <small>Move preview</small>
                  <strong>{active || "Choose a move"}</strong>
                  <em>{moveDetails?.type || ""} {moveDetails?.category ? `· ${moveDetails.category}` : ""}</em>
                </span>
              </div>
              <p>{details?.description || "Click a move to preview its effect."}</p>
              <div className="move-preview-stats">
                <span><small>Power</small><strong>{moveDetails?.power || "--"}</strong></span>
                <span><small>Accuracy</small><strong>{accuracy}</strong></span>
                <span><small>Priority</small><strong>{typeof moveDetails?.priority === "number" ? (moveDetails.priority > 0 ? `+${moveDetails.priority}` : moveDetails.priority) : "0"}</strong></span>
              </div>
              <div className="move-preview-actions">
                {current && <button className="clear-choice" type="button" onClick={() => select("")}><X size={14} /> Clear move</button>}
                <button className="primary-button" type="button" onClick={() => select(active)} disabled={!active}>{current === active ? "Keep" : "Choose"} {active}</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

const MAX_PINNED_CALCS = 3;
type GuidedCoachIntent = "ko" | "survive" | "speed";

type InspectorLayoutState = {
  terrain: string;
  weather: string;
  targeting: string;
  heldItem: string;
  ability: string;
  comparedNature: string;
  criticalHit: string;
  comparedMegaForm: string | null;
  comparedStatPoints: PokemonBuild["evs"];
  trickRoom: string;
  yourTailwind: string;
  theirTailwind: string;
  yourStatStage: string;
  theirStatStage: string;
};

function parseStatStage(value: string): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(-6, Math.min(6, parsed)) : 0;
}

function inspectorCalcStats(
  answer: CoachAnswer,
  range: CoachAnswer["currentRange"] | undefined,
  moveDetail: OptionDetail | undefined,
  speedContext: CoachAnswer["speedContext"],
) {
  if (speedContext) {
    return { subjectRelevantStat: "Spe" as StatKey, opponentRelevantStat: "Spe" as StatKey };
  }
  const isSpecial = moveDetail?.category === "Special";
  const attackStat: StatKey = answer.attackStat ?? (isSpecial ? "SpA" : "Atk");
  const defenseStat: StatKey = answer.defenseStat ?? (isSpecial ? "SpD" : "Def");
  if (answer.mode === "offensive") {
    return { subjectRelevantStat: attackStat, opponentRelevantStat: defenseStat };
  }
  return { subjectRelevantStat: defenseStat, opponentRelevantStat: attackStat };
}

function inspectorComparedContext(answer: CoachAnswer, team: PokemonBuild[]) {
  const range = answer.currentRange;
  const comparedName = range
    ? (answer.mode === "offensive" ? range.defenderName : range.attackerName)
    : answer.speedContext?.opponentName;
  if (!comparedName) return null;
  const resolvedCompared = resolvePokemonFromDisplayName(comparedName);
  if (!resolvedCompared) return null;
  const comparedBuild = team.find((build) => build.species === resolvedCompared.data.name);
  const defaultComparedEvs: PokemonBuild["evs"] = {
    HP: comparedBuild?.evs.HP ?? 0,
    Atk: comparedBuild?.evs.Atk ?? 0,
    Def: comparedBuild?.evs.Def ?? 0,
    SpA: comparedBuild?.evs.SpA ?? 0,
    SpD: comparedBuild?.evs.SpD ?? 0,
    Spe: comparedBuild?.evs.Spe ?? 0,
  };
  return {
    comparedName,
    resolvedCompared,
    comparedData: resolvedCompared.data,
    comparedBuild,
    defaultComparedEvs,
    opponentKey: resolvedCompared.megaForm?.name ?? resolvedCompared.data.name,
    opponentLabel: resolvedCompared.megaForm
      ? formatMegaDisplayName(resolvedCompared.data.name, resolvedCompared.megaForm.name)
      : resolvedCompared.data.name,
  };
}

function buildDefaultInspectorLayout(answer: CoachAnswer, team: PokemonBuild[]): InspectorLayoutState | null {
  const context = inspectorComparedContext(answer, team);
  if (!context) return null;
  const defaultStatPoints = { ...context.defaultComparedEvs };
  return {
    terrain: "",
    weather: "",
    targeting: "",
    heldItem: "",
    ability: "",
    comparedNature: "",
    criticalHit: "",
    comparedMegaForm: context.resolvedCompared.megaForm?.name ?? null,
    comparedStatPoints: defaultStatPoints,
    trickRoom: "",
    yourTailwind: "",
    theirTailwind: "",
    yourStatStage: "",
    theirStatStage: "",
  };
}

function getOpponentLayoutKey(answer: CoachAnswer, team: PokemonBuild[]) {
  return inspectorComparedContext(answer, team)?.opponentKey ?? null;
}

function buildInspectorLiveQuestion(
  question: string,
  answer: CoachAnswer,
  team: PokemonBuild[],
  selectedId: string | null,
  layout: InspectorLayoutState,
): string {
  const context = inspectorComparedContext(answer, team);
  if (!context?.comparedData) return baseCoachQuestion(question);

  const {
    terrain,
    weather,
    targeting,
    heldItem,
    ability,
    comparedNature,
    criticalHit,
    comparedMegaForm,
    comparedStatPoints,
    trickRoom,
    yourTailwind,
    theirTailwind,
    yourStatStage,
    theirStatStage,
  } = layout;
  const comparedData = context.comparedData;
  const comparedBuild = context.comparedBuild;
  const defaultComparedEvs = context.defaultComparedEvs;
  const activeMegaForm = comparedData.megaForms?.find((form) => form.name === comparedMegaForm) ?? null;
  const comparedDisplayName = activeMegaForm
    ? formatMegaDisplayName(comparedData.name, activeMegaForm.name)
    : comparedData.name;
  const range = answer.currentRange;
  const speedContext = answer.speedContext;
  const moveDetail = range ? OPTION_DETAILS.moves[range.moveName] : undefined;
  const speedOpponentDefaults = speedContext
    ? parseSpeedOpponentDefaults(answer, comparedData.name)
    : null;
  const assumedDefaults = parseInspectorDefaults(answer, comparedDisplayName);
  const assumedNature = speedOpponentDefaults?.nature
    ?? assumedDefaults.nature
    ?? comparedBuild?.nature
    ?? "Hardy";
  const selectedBuild = selectedId ? team.find((build) => build.id === selectedId) : undefined;
  const subjectName = selectedBuild?.species ?? speedContext?.subjectName ?? "My Pokémon";
  const { subjectRelevantStat, opponentRelevantStat } = inspectorCalcStats(answer, range, moveDetail, speedContext);
  const additions: string[] = [];
  if (terrain) additions.push(terrain === "none" ? "no terrain" : `${terrain} Terrain`);
  if (weather === "none") additions.push("no weather");
  else if (weather === "Sun") additions.push("sunny day");
  else if (weather === "Rain") additions.push("rain dance");
  else if (weather === "Sand") additions.push("sandstorm");
  else if (weather === "Snow") additions.push("snow");
  if (targeting) additions.push(targeting === "single" ? "single target" : "multiple targets");
  if (criticalHit === "yes") additions.push("on a critical hit");
  if (comparedNature && comparedNature !== assumedNature) {
    additions.push(`${comparedData.name} has ${comparedNature} nature`);
  }
  if (heldItem) additions.push(`${comparedData.name} holds ${heldItem}`);
  if (ability) additions.push(`${comparedData.name} has ${ability}`);
  const changedStats = (["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as StatKey[])
    .filter((stat) => comparedStatPoints[stat] !== defaultComparedEvs[stat]);
  if (changedStats.length) {
    additions.push(`${comparedData.name} has ${changedStats.map((stat) => `${comparedStatPoints[stat]} ${stat} Stat Points`).join(", ")}`);
  }
  if (speedContext) {
    if (trickRoom === "yes") additions.push("under Trick Room");
    if (yourTailwind === "yes") additions.push("Tailwind on my side");
    if (theirTailwind === "yes") additions.push(`Tailwind on ${comparedData.name}'s side`);
    if (yourStatStage) additions.push(`${subjectName} has ${yourStatStage} Spe`);
    if (theirStatStage) additions.push(`${comparedData.name} has ${theirStatStage} Spe`);
  } else {
    if (yourStatStage) additions.push(`${subjectName} has ${yourStatStage} ${subjectRelevantStat}`);
    if (theirStatStage) additions.push(`${comparedData.name} has ${theirStatStage} ${opponentRelevantStat}`);
  }
  const adjustedBaseQuestion = context.comparedName
    ? applyOpponentFormToQuestion(
      baseCoachQuestion(question),
      context.comparedName,
      comparedDisplayName,
      comparedData.name,
    )
    : baseCoachQuestion(question);
  if (!additions.length) return adjustedBaseQuestion;
  return `${adjustedBaseQuestion}. ${additions.join(". ")}.`;
}

function resolvePinnedCoachCheck(
  question: string,
  answer: CoachAnswer,
  team: PokemonBuild[],
  selectedId: string | null,
  layout: InspectorLayoutState | null | undefined,
) {
  if (!answer.currentCheck || !layout) return answer.currentCheck;
  const liveQuestion = buildInspectorLiveQuestion(question, answer, team, selectedId, layout);
  const liveAnswer = answerCoachQuestion(liveQuestion, team, selectedId);
  return liveAnswer.currentCheck ?? answer.currentCheck;
}

function resolvePinnedCoachRange(
  question: string,
  answer: CoachAnswer,
  team: PokemonBuild[],
  selectedId: string | null,
  layout: InspectorLayoutState | null | undefined,
) {
  if (!answer.currentRange || !layout) return answer.currentRange;
  const liveQuestion = buildInspectorLiveQuestion(question, answer, team, selectedId, layout);
  const liveAnswer = answerCoachQuestion(liveQuestion, team, selectedId);
  return liveAnswer.currentRange ?? answer.currentRange;
}

function coachRecommendationHeadline(answer: CoachAnswer, recommendation: CoachRecommendation) {
  const scope = answer.searchScope ?? "all";
  if (answer.mode === "offensive" && answer.attackStat) {
    const parts = [`${recommendation.attackPoints} ${answer.attackStat} stat points`];
    if (scope !== "stats" && scope !== "item" && recommendation.nature !== "Hardy") parts.push(`${recommendation.nature} nature`);
    if (scope !== "stats" && scope !== "nature" && recommendation.item) parts.push(recommendation.item);
    return parts.join(" · ");
  }
  if (answer.defenseStat) {
    const parts = [`${recommendation.hpPoints} HP / ${recommendation.defensePoints} ${answer.defenseStat}`];
    if (scope !== "stats" && scope !== "item" && recommendation.nature !== "Hardy") parts.push(`${recommendation.nature} nature`);
    if (scope !== "stats" && scope !== "nature" && recommendation.item) parts.push(recommendation.item);
    return parts.join(" · ");
  }
  return recommendation.label;
}

function coachRecommendationDetail(answer: CoachAnswer, recommendation: CoachRecommendation) {
  if (answer.mode === "offensive" && answer.attackStat) {
    return `${recommendation.pointsUsed}/66 stat points used · ${recommendation.attack} ${answer.attackStat} after nature`;
  }
  if (answer.defenseStat) {
    return `${recommendation.pointsUsed}/66 stat points used · ${recommendation.hp} HP · ${recommendation.defense} ${answer.defenseStat}`;
  }
  return `${recommendation.pointsUsed}/66 stat points used`;
}

function CoachCurrentRange({ range, mode }: { range: NonNullable<CoachAnswer["currentRange"]>; mode: CoachAnswer["mode"] }) {
  const [low, high] = range.damagePercent;
  const [damageLow, damageHigh] = range.damage;
  const scaleMax = Math.max(100, Math.ceil(high / 25) * 25);
  const left = Math.min(100, low / scaleMax * 100);
  const width = Math.max(1.5, Math.min(100 - left, (high - low) / scaleMax * 100));
  const oddsLabel = mode === "defensive" ? "Survive" : "KO";
  const tone = range.outcomeChance >= 1 ? "pass" : range.outcomeChance >= 0.5 ? "warn" : "fail";
  const outcomeCopy = mode === "defensive"
    ? range.outcomeChance >= 1 ? "Your current build lives every roll." : range.outcomeChance > 0 ? "There are rolls where you hang on." : "This build goes down to every roll."
    : range.outcomeChance >= 1 ? "This always KOs from here." : range.outcomeChance > 0 ? "Some rolls pick up the KO." : "This never KOs from here.";
  const matchup = mode === "offensive"
    ? `${range.moveName} → ${range.defenderName}`
    : `${range.attackerName}'s ${range.moveName}`;
  return (
    <div className="live-damage-range" aria-label={`Current damage: ${low} to ${high} percent of HP (${damageLow}–${damageHigh} damage)`}>
      <div className="live-damage-copy">
        <span>Live calc</span>
        <p>{matchup}</p>
        <strong className={tone}>{low}–{high}%</strong>
        <em>{outcomeCopy}</em>
      </div>
      <div className="damage-range-visual">
        <div className="damage-range-track" aria-hidden="true"><i style={{ left: `${left}%`, width: `${width}%` }} /></div>
        <div><span>{low}%</span><span>{high}%</span></div>
      </div>
      <div className="live-damage-meta">
        <span><small>{oddsLabel} odds</small><strong>{Math.round(range.outcomeChance * 100)}%</strong></span>
        <span><small>Damage</small><strong>{damageLow}–{damageHigh}</strong></span>
        <span><small>HP</small><strong>{range.targetHp}</strong></span>
      </div>
    </div>
  );
}

function speedOutcomeTone(outcomeLabel?: NonNullable<CoachAnswer["currentCheck"]>["outcomeLabel"]) {
  if (outcomeLabel === "Faster") return "pass";
  if (outcomeLabel === "Slower") return "fail";
  if (outcomeLabel === "Tie") return "warn";
  return "pass";
}

function CoachQuickCheckBubble({ check }: { check: NonNullable<CoachAnswer["currentCheck"]> }) {
  const tone = speedOutcomeTone(check.outcomeLabel);
  return (
    <div className="quick-check-card" aria-label={`${check.label}: ${check.title}`}>
      <div className="quick-check-copy">
        <span>{check.label}</span>
        <p>{check.title}</p>
        <strong className={tone}>{check.outcomeLabel ?? check.value}</strong>
        {check.outcomeLabel ? <small className="quick-check-speed-stats">{check.value}</small> : null}
        <em>{check.verdict}</em>
      </div>
      <div className="live-damage-meta">
        {check.meta.map((entry) => (
          <span key={entry.label}><small>{entry.label}</small><strong>{entry.value}</strong></span>
        ))}
      </div>
    </div>
  );
}

function InspectorStatSliders({ data, megaForm, nature, statPoints, setStatPoint, battleContext = {}, getStatStage }: {
  data: PokemonData;
  megaForm?: MegaForm | null;
  nature: string;
  statPoints: Record<StatKey, number>;
  setStatPoint: (stat: StatKey, value: number) => void;
  battleContext?: BattleStatContext;
  getStatStage?: (stat: StatKey) => number;
}) {
  const stats: StatKey[] = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
  const baseStats = megaForm?.stats ?? data.stats;
  const labelMap: Record<StatKey, string> = { HP: "HP", Atk: "Atk", Def: "Def", SpA: "SpA", SpD: "SpD", Spe: "Spe" };
  return (
    <div className="inspector-stat-sliders" aria-label={`${data.name} stat sliders`}>
      {stats.map((stat) => {
        const baseValue = calculateStat(baseStats[stat], statPoints[stat], stat, nature);
        const statStage = getStatStage?.(stat) ?? 0;
        const value = calculateEffectiveStat(baseStats[stat], statPoints[stat], stat, nature, {
          ...battleContext,
          statStage: statStage || undefined,
        });
        const boosted = value !== baseValue;
        const pointPercent = (statPoints[stat] / CHAMPIONS_STAT_POINT_MAX) * 100;
        return (
          <label key={stat} className="inspector-stat-slider">
            <span>{labelMap[stat]}</span>
            <strong className={boosted ? "boosted" : undefined} title={boosted ? `Base ${baseValue} before item, ability, and field effects` : undefined}>{value}</strong>
            <div className="inspector-stat-track">
              <input
                className="inspector-stat-range"
                aria-label={`Adjust ${stat} Stat Points`}
                type="range"
                min="0"
                max={CHAMPIONS_STAT_POINT_MAX}
                value={statPoints[stat]}
                onChange={(event) => setStatPoint(stat, Number(event.target.value))}
                style={{ ["--stat-fill" as string]: `${pointPercent}%` }}
              />
            </div>
            <div className="inspector-stat-sp">
              <input
                aria-label={`${stat} Stat Points`}
                type="number"
                min="0"
                max={CHAMPIONS_STAT_POINT_MAX}
                value={statPoints[stat]}
                onChange={(event) => setStatPoint(stat, Number(event.target.value))}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          </label>
        );
      })}
    </div>
  );
}

function parseSpeedOpponentDefaults(answer: CoachAnswer, opponentName: string) {
  const line = answer.assumptions.find((entry) => entry.startsWith(`${opponentName}:`));
  const natureMatch = line?.match(/,\s*(\w+)\s+nature/i);
  const pointsMatch = line?.match(/:\s*(\d+)\s+Spe/i);
  return {
    nature: natureMatch?.[1] || "Hardy",
    spePoints: pointsMatch ? Number(pointsMatch[1]) : 0,
  };
}

function parseInspectorDefaults(answer: CoachAnswer, comparedName: string) {
  const assumptions = answer.assumptions;
  const conditionsLine = assumptions.find((entry) => entry.includes("Weather:")) ?? "";
  const weatherMatch = conditionsLine.match(/Weather:\s*(\w+)/i);
  const weatherRaw = weatherMatch?.[1]?.toLowerCase() ?? "none";
  const weather = weatherRaw === "none" ? "none" : weatherRaw.charAt(0).toUpperCase() + weatherRaw.slice(1);
  const terrainMatch = conditionsLine.match(/Terrain:\s*(?:(\w+) Terrain|none)/i);
  const terrain = terrainMatch?.[1]
    ? terrainMatch[1].charAt(0).toUpperCase() + terrainMatch[1].slice(1).toLowerCase()
    : "none";
  const targetingLine = assumptions.find((entry) => entry.startsWith("Targeting:")) ?? "";
  const targeting = targetingLine.includes("multiple Pokémon") ? "multiple" : "single";
  const pokemonLine = assumptions.find((entry) => entry.includes(comparedName) && entry.includes("Stat Points"));
  let item = "None";
  if (pokemonLine) {
    if (/required Mega Stone/i.test(pokemonLine)) item = "Mega Stone";
    else if (/no held item/i.test(pokemonLine) || /recommendations may include/i.test(pokemonLine)) item = "None";
    else {
      const match = pokemonLine.match(/Stat Points,\s*([^.]+)\./);
      item = match?.[1]?.trim() || "None";
    }
  }
  const abilityLine = assumptions.find((entry) => entry.startsWith("Abilities:")) ?? "";
  const abilitySegment = abilityLine.split(";").find((part) => part.includes(comparedName));
  const abilityMatch = abilitySegment?.match(/—\s*(.+?)\.?\s*$/);
  const abilityRaw = abilityMatch?.[1]?.trim() || "None";
  const ability = /^none(\s+specified)?$/i.test(abilityRaw) ? "None" : abilityRaw;
  const natureMatch = pokemonLine?.match(/Level 50[^:]+:\s*(\w+),/);
  const nature = natureMatch?.[1] || "Hardy";
  return { weather, terrain, targeting, item, ability, nature };
}

function natureModifierHint(nature: string) {
  for (let rowIndex = 0; rowIndex < NATURE_CHART.length; rowIndex += 1) {
    const columnIndex = NATURE_CHART[rowIndex].findIndex((entry) => entry === nature);
    if (columnIndex < 0) continue;
    if (rowIndex === columnIndex) return "";
    return `(+${NATURE_STATS[rowIndex]}, -${NATURE_STATS[columnIndex]})`;
  }
  return "";
}

function inspectorNatureLabel(nature: string) {
  const hint = natureModifierHint(nature);
  return hint ? `${nature} ${hint}` : nature;
}

const INSPECTOR_NATURE_OPTIONS = NATURE_CHART.flat().map((nature) => ({
  value: nature,
  label: inspectorNatureLabel(nature),
}));

function SpeedSidePanel({ label, tailwind, trickRoom, onTailwind, onTrickRoom }: {
  label: string;
  tailwind: boolean;
  trickRoom: boolean;
  onTailwind: (checked: boolean) => void;
  onTrickRoom: (checked: boolean) => void;
}) {
  return (
    <div className="modifier-stat-stage speed-side-panel">
      <span>{label}</span>
      <div className="speed-effect-pills" role="group" aria-label={`${label} speed effects`}>
        <button
          type="button"
          className={`speed-effect-pill${tailwind ? " active" : ""}`}
          aria-pressed={tailwind}
          onClick={() => onTailwind(!tailwind)}
        >
          Tailwind
        </button>
        <button
          type="button"
          className={`speed-effect-pill${trickRoom ? " active" : ""}`}
          aria-pressed={trickRoom}
          onClick={() => onTrickRoom(!trickRoom)}
        >
          Trick Room
        </button>
      </div>
    </div>
  );
}

function StatStageField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === "0" || trimmed === "+0" || trimmed === "-0") {
      onChange("");
      setDraft("");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(value);
      return;
    }
    const clamped = Math.max(-6, Math.min(6, Math.round(parsed)));
    const next = clamped === 0 ? "" : clamped > 0 ? `+${clamped}` : `${clamped}`;
    onChange(next);
    setDraft(next);
  };
  return (
    <label className="modifier-stat-stage">
      <span>{label}</span>
      <div className="modifier-stat-stage-box">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder="0"
          aria-label={`${label} stat stage`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
    </label>
  );
}

function ModifierPicker({ label, value, defaultLabel, options, onChange, disabled = false, mode = "search", menuPlacement = "bottom" }: {
  label: string;
  value: string;
  defaultLabel: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  mode?: "select" | "search";
  menuPlacement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const [inputValue, setInputValue] = useState(value === "" ? "" : (selected?.label ?? ""));
  useEffect(() => {
    setInputValue(value === "" ? "" : (selected?.label ?? ""));
  }, [selected?.label, value]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const isShowingDefault = value === "" && !inputValue.trim();
  const filterQuery = mode === "select" || isShowingDefault ? "" : inputValue.trim().toLowerCase();
  const visibleOptions = (mode === "select"
    ? options
    : filterQuery
      ? options.filter((option) =>
        option.label.toLowerCase().includes(filterQuery)
        || option.value.toLowerCase().includes(filterQuery),
      )
      : options
  )
    .filter((option) => mode === "select" || !(value === "" && option.label.toLowerCase() === defaultLabel.toLowerCase()))
    .slice(0, mode === "select" ? options.length : 24);
  const openPicker = () => {
    if (!disabled) setOpen(true);
  };
  const togglePicker = () => {
    if (!disabled) setOpen((current) => !current);
  };
  const resetToDefault = () => {
    setInputValue("");
    onChange("");
    setOpen(false);
  };
  const showResetOption = value !== "";
  const listOptions = showResetOption
    ? visibleOptions.filter((option) => option.label.trim().toLowerCase() !== defaultLabel.trim().toLowerCase())
    : visibleOptions;
  return (
    <div className={`modifier-picker ${disabled ? "disabled" : ""} ${mode === "select" ? "select-mode" : ""}`}>
      <span>{label}</span>
      <div className="modifier-input-wrap">
        <input
          value={inputValue}
          placeholder={defaultLabel}
          disabled={disabled}
          readOnly={disabled || mode === "select"}
          onFocus={() => {
            if (disabled) return;
            if (value === "") setInputValue("");
            openPicker();
          }}
          onClick={mode === "select" ? openPicker : undefined}
          onBlur={() => window.setTimeout(() => {
            setOpen(false);
            if (value === "") setInputValue("");
          }, 120)}
          onChange={(event) => {
            if (disabled || mode === "select") return;
            const next = event.target.value;
            setInputValue(next);
            setOpen(true);
            const exact = options.find((option) =>
              option.label.toLowerCase() === next.trim().toLowerCase()
              || option.value.toLowerCase() === next.trim().toLowerCase(),
            );
            if (exact && !exact.disabled) onChange(exact.value);
            else if (!next.trim()) onChange("");
          }}
        />
        <button
          type="button"
          className="modifier-toggle"
          disabled={disabled}
          aria-label={`Show ${label} options`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={togglePicker}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {open && !disabled && (
        <div className={`modifier-option-list ${menuPlacement === "top" ? "drop-up" : "drop-down"}`} role="listbox">
          {showResetOption && (
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={resetToDefault}>
              {defaultLabel}
            </button>
          )}
          {listOptions.map((option) => (
            <button
              key={option.value}
              className={[option.value === value ? "selected" : "", option.disabled ? "disabled" : ""].filter(Boolean).join(" ")}
              type="button"
              disabled={option.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (option.disabled) return;
                setInputValue(option.label);
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CoachCalcInspector({ question, answer, team, selectedId, layout, onLayoutChange, opponentTemplateLabel, showApplyTemplatePrompt, onApplyOpponentTemplate, onDismissApplyTemplatePrompt, onApplySpread, onLivePreview }: {
  question: string;
  answer: CoachAnswer;
  team: PokemonBuild[];
  selectedId: string | null;
  layout: InspectorLayoutState;
  onLayoutChange: (update: Partial<InspectorLayoutState> | ((current: InspectorLayoutState) => InspectorLayoutState)) => void;
  opponentTemplateLabel?: string;
  showApplyTemplatePrompt?: boolean;
  onApplyOpponentTemplate?: () => void;
  onDismissApplyTemplatePrompt?: () => void;
  onApplySpread: (buildId: string, answer: CoachAnswer, recommendation: CoachRecommendation) => void;
  onLivePreview?: (preview: {
    question: string;
    range?: NonNullable<CoachAnswer["currentRange"]>;
    check?: NonNullable<CoachAnswer["currentCheck"]>;
    mode: CoachAnswer["mode"];
  } | null) => void;
}) {
  const {
    terrain,
    weather,
    targeting,
    heldItem,
    ability,
    comparedNature,
    criticalHit,
    comparedMegaForm,
    comparedStatPoints,
    trickRoom,
    yourTailwind,
    theirTailwind,
    yourStatStage,
    theirStatStage,
  } = layout;
  const patchLayout = (patch: Partial<InspectorLayoutState>) => onLayoutChange((current) => ({ ...current, ...patch }));
  const range = answer.currentRange;
  const speedContext = answer.speedContext;
  const comparedContext = useMemo(() => inspectorComparedContext(answer, team), [answer, team]);
  const comparedData = comparedContext?.comparedData;
  const comparedBuild = comparedContext?.comparedBuild;
  const defaultComparedEvs = comparedContext?.defaultComparedEvs ?? { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 };
  const activeMegaForm = comparedData?.megaForms?.find((form) => form.name === comparedMegaForm) ?? null;
  const comparedDisplayName = activeMegaForm
    ? formatMegaDisplayName(comparedData!.name, activeMegaForm.name)
    : comparedData?.name ?? "";
  const selectedBuild = team.find((build) => build.id === selectedId);
  const selectedData = POKEMON.find((pokemon) => pokemon.name === selectedBuild?.species);
  const moveDetail = range ? OPTION_DETAILS.moves[range.moveName] : undefined;
  const spreadMove = range ? moveIsSpread(range.moveName, moveDetail) : false;
  const itemOptions = comparedData?.items ?? [];
  const abilityOptions = useMemo(() => {
    const options = [...(comparedData?.abilities ?? [])];
    if (activeMegaForm?.ability && !options.includes(activeMegaForm.ability)) {
      options.unshift(activeMegaForm.ability);
    }
    return options;
  }, [activeMegaForm?.ability, comparedData?.abilities]);
  const terrainOptions = [
    { value: "none", label: "No terrain" },
    { value: "Electric", label: "Electric" },
    { value: "Grassy", label: "Grassy" },
    { value: "Psychic", label: "Psychic" },
    { value: "Misty", label: "Misty" },
  ];
  const weatherOptions = [
    { value: "none", label: "No weather" },
    { value: "Sun", label: "Sun" },
    { value: "Rain", label: "Rain" },
    { value: "Sand", label: "Sand" },
    { value: "Snow", label: "Snow" },
  ];
  const targetingOptions = [
    { value: "single", label: "Solo target", disabled: !spreadMove },
    { value: "multiple", label: "Doubles spread", disabled: !spreadMove },
  ];
  const criticalHitOptions = [
    { value: "no", label: "No crit" },
    { value: "yes", label: "Critical hit" },
  ];
  useEffect(() => {
    if (!spreadMove && targeting) onLayoutChange((current) => ({ ...current, targeting: "" }));
  }, [onLayoutChange, spreadMove, targeting]);
  const setComparedStatPoint = (stat: StatKey, value: number) => {
    onLayoutChange((current) => ({
      ...current,
      comparedStatPoints: {
        ...current.comparedStatPoints,
        [stat]: Math.max(0, Math.min(CHAMPIONS_STAT_POINT_MAX, Math.round(value))),
      },
    }));
  };
  const assumedDefaults = useMemo(
    () => parseInspectorDefaults(answer, comparedDisplayName),
    [answer, comparedDisplayName],
  );
  const speedOpponentDefaults = speedContext && comparedData
    ? parseSpeedOpponentDefaults(answer, comparedData.name)
    : null;
  const assumedNature = speedOpponentDefaults?.nature
    ?? assumedDefaults.nature
    ?? comparedBuild?.nature
    ?? "Hardy";
  const effectiveComparedNature = comparedNature || assumedNature;
  const subjectName = selectedBuild?.species ?? speedContext?.subjectName ?? selectedData?.name ?? "My Pokémon";
  const { subjectRelevantStat, opponentRelevantStat } = inspectorCalcStats(answer, range, moveDetail, speedContext);
  const getOpponentStatStage = (stat: StatKey) => {
    if (stat !== opponentRelevantStat) return 0;
    let stage = parseStatStage(theirStatStage);
    if (speedContext && stat === "Spe" && theirTailwind === "yes") stage += 2;
    return stage;
  };
  const modifierAdditions = useMemo(() => {
    if (!comparedData) return [];
    const additions: string[] = [];
    if (terrain) additions.push(terrain === "none" ? "no terrain" : `${terrain} Terrain`);
    if (weather === "none") additions.push("no weather");
    else if (weather === "Sun") additions.push("sunny day");
    else if (weather === "Rain") additions.push("rain dance");
    else if (weather === "Sand") additions.push("sandstorm");
    else if (weather === "Snow") additions.push("snow");
    if (targeting) additions.push(targeting === "single" ? "single target" : "multiple targets");
    if (criticalHit === "yes") additions.push("on a critical hit");
    if (comparedNature && comparedNature !== assumedNature) {
      additions.push(`${comparedData.name} has ${comparedNature} nature`);
    }
    if (heldItem) additions.push(`${comparedData.name} holds ${heldItem}`);
    if (ability) additions.push(`${comparedData.name} has ${ability}`);
    const changedStats = (["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as StatKey[])
      .filter((stat) => comparedStatPoints[stat] !== defaultComparedEvs[stat]);
    if (changedStats.length) {
      additions.push(`${comparedData.name} has ${changedStats.map((stat) => `${comparedStatPoints[stat]} ${stat} Stat Points`).join(", ")}`);
    }
    if (speedContext) {
      if (trickRoom === "yes") additions.push("under Trick Room");
      if (yourTailwind === "yes") additions.push("Tailwind on my side");
      if (theirTailwind === "yes") additions.push(`Tailwind on ${comparedData.name}'s side`);
      if (yourStatStage) additions.push(`${subjectName} has ${yourStatStage} Spe`);
      if (theirStatStage) additions.push(`${comparedData.name} has ${theirStatStage} Spe`);
    } else {
      if (yourStatStage) additions.push(`${subjectName} has ${yourStatStage} ${subjectRelevantStat}`);
      if (theirStatStage) additions.push(`${comparedData.name} has ${theirStatStage} ${opponentRelevantStat}`);
    }
    return additions;
  }, [ability, assumedNature, comparedData, comparedNature, comparedStatPoints, criticalHit, defaultComparedEvs, heldItem, opponentRelevantStat, speedContext, subjectName, subjectRelevantStat, targeting, terrain, theirStatStage, theirTailwind, trickRoom, weather, yourStatStage, yourTailwind]);
  const adjustedBaseQuestion = useMemo(() => {
    if (!comparedData || !comparedContext?.comparedName) return baseCoachQuestion(question);
    return applyOpponentFormToQuestion(
      baseCoachQuestion(question),
      comparedContext.comparedName,
      comparedDisplayName,
      comparedData.name,
    );
  }, [comparedContext?.comparedName, comparedData, comparedDisplayName, question]);
  const liveQuestion = modifierAdditions.length
    ? `${adjustedBaseQuestion}. ${modifierAdditions.join(". ")}.`
    : adjustedBaseQuestion;
  const liveAnswer = useMemo(
    () => answerCoachQuestion(liveQuestion, team, selectedId),
    [liveQuestion, selectedId, team],
  );
  const liveRange = liveAnswer.currentRange ?? range;
  const liveCheck = liveAnswer.currentCheck ?? answer.currentCheck;
  useEffect(() => {
    if (!onLivePreview) return;
    if (liveCheck && liveAnswer.ok) {
      onLivePreview({ question, check: liveCheck, mode: liveAnswer.mode });
    } else if (liveRange && liveAnswer.ok) {
      onLivePreview({ question, range: liveRange, mode: liveAnswer.mode });
    } else {
      onLivePreview(null);
    }
  }, [
    liveAnswer.currentCheck,
    liveAnswer.mode,
    liveAnswer.ok,
    liveCheck,
    liveRange,
    onLivePreview,
    question,
  ]);
  const assumedWeatherLabel = weatherOptions.find((option) => option.value === assumedDefaults.weather)?.label ?? "No weather";
  const assumedTerrainLabel = terrainOptions.find((option) => option.value === assumedDefaults.terrain)?.label ?? "No terrain";
  const assumedTargetingLabel = targetingOptions.find((option) => option.value === assumedDefaults.targeting)?.label ?? "Solo target";
  const inspectorBattleContext = useMemo((): BattleStatContext => {
    if (!comparedData) return {};
    return {
      item: heldItem || (assumedDefaults.item !== "None" ? assumedDefaults.item : ""),
      ability: ability || (assumedDefaults.ability !== "None" ? assumedDefaults.ability : activeMegaForm?.ability ?? comparedData.abilities[0] ?? ""),
      weather: weather ? (weather === "none" ? "" : weather) : (assumedDefaults.weather === "none" ? "" : assumedDefaults.weather),
      terrain: terrain ? (terrain === "none" ? "" : terrain) : (assumedDefaults.terrain === "none" ? "" : assumedDefaults.terrain),
    };
  }, [ability, activeMegaForm?.ability, assumedDefaults, comparedData, heldItem, terrain, weather]);

  if (!comparedData || (!range && !speedContext)) {
    return (
      <div className="coach-empty">
        <h3>Select a pinned calc</h3>
        <p>Pin or select a damage or speed result to inspect the opposing Pokémon, assumptions, and calc modifiers.</p>
      </div>
    );
  }

  const inspectorTitle = speedContext
    ? `${selectedData?.name ?? "Your Pokémon"} vs ${comparedDisplayName}`
    : answer.mode === "offensive"
      ? `${selectedData?.name ?? "Your Pokémon"} into ${comparedDisplayName}`
      : `${comparedDisplayName} into ${selectedData?.name ?? "your Pokémon"}`;

  return (
    <div className="calc-inspector" aria-live="polite">
      {showApplyTemplatePrompt && opponentTemplateLabel ? (
        <div className="inspector-template-strip" role="status">
          <p>Apply your saved {opponentTemplateLabel} setup from another calc?</p>
          <div className="inspector-template-strip-actions">
            <button type="button" className="ghost-button" onClick={onDismissApplyTemplatePrompt}>Keep defaults</button>
            <button type="button" className="primary-button" onClick={onApplyOpponentTemplate}>Apply setup</button>
          </div>
        </div>
      ) : null}
      <section className="inspector-row">
        <div className="inspector-copy">
          <span className="eyebrow">{speedContext ? "Speed Inspector" : "Damage Inspector"}</span>
          <h3>{inspectorTitle}</h3>
          <p>{liveAnswer.intro || liveAnswer.summary}</p>
          {liveCheck ? (
            <CoachQuickCheckBubble check={liveCheck} />
          ) : liveRange ? (
            <CoachCurrentRange range={liveRange} mode={liveAnswer.mode} />
          ) : null}
        </div>

        <div className="inspector-pokemon-card">
          <div className="inspector-art-wrap">
            <PokemonArtImage
              data={comparedData}
              megaForm={activeMegaForm}
              variant="artwork"
              alt={comparedDisplayName}
            />
          </div>
          <div className="inspector-pokemon-body">
            <div className="inspector-pokemon-head">
              <span className="eyebrow">Opposing Pokémon</span>
              <div className="inspector-pokemon-main-row">
                <div className="inspector-pokemon-title-row">
                  <h4 title={comparedDisplayName}>{comparedDisplayName}</h4>
                  {comparedData.megaForms?.length ? (
                    <MegaToggle
                      forms={comparedData.megaForms}
                      selected={comparedMegaForm}
                      select={(megaForm) => patchLayout({ comparedMegaForm: megaForm })}
                      compact
                    />
                  ) : null}
                </div>
                <div className="inspector-build-pickers">
                  <ModifierPicker label="Nature" value={comparedNature} defaultLabel={inspectorNatureLabel(assumedNature)} options={INSPECTOR_NATURE_OPTIONS} onChange={(value) => patchLayout({ comparedNature: value })} />
                  <ModifierPicker label="Item" value={heldItem} defaultLabel={assumedDefaults.item} options={itemOptions.map((item) => ({ value: item, label: item }))} onChange={(value) => patchLayout({ heldItem: value })} />
                  <ModifierPicker label="Ability" value={ability} defaultLabel={assumedDefaults.ability} options={abilityOptions.map((option) => ({ value: option, label: option }))} onChange={(value) => patchLayout({ ability: value })} />
                </div>
              </div>
              <div className="inspector-type-row">
                {(activeMegaForm?.types ?? comparedData.types).map((type) => (
                  <span className="inspector-type-chip" key={type}>{type}</span>
                ))}
              </div>
            </div>
            <InspectorStatSliders
              data={comparedData}
              megaForm={activeMegaForm}
              nature={effectiveComparedNature}
              statPoints={comparedStatPoints}
              setStatPoint={setComparedStatPoint}
              battleContext={inspectorBattleContext}
              getStatStage={getOpponentStatStage}
            />
          </div>
        </div>

        <div className="inspector-modifiers">
          <div className="inspector-panel-head">
            <span className="eyebrow">Try Modifiers</span>
            <strong>Live</strong>
          </div>
          <div className="modifier-grid">
            <ModifierPicker label="Weather" value={weather} defaultLabel={assumedWeatherLabel} options={weatherOptions} onChange={(value) => patchLayout({ weather: value })} mode="select" />
            <ModifierPicker label="Terrain" value={terrain} defaultLabel={assumedTerrainLabel} options={terrainOptions} onChange={(value) => patchLayout({ terrain: value })} mode="select" />
            {!speedContext ? (
              <>
                <ModifierPicker label="Targeting" value={targeting} defaultLabel={assumedTargetingLabel} options={targetingOptions} onChange={(value) => patchLayout({ targeting: value })} disabled={!spreadMove} mode="select" />
                <ModifierPicker label="Critical hit" value={criticalHit} defaultLabel="No crit" options={criticalHitOptions} onChange={(value) => patchLayout({ criticalHit: value })} mode="select" />
              </>
            ) : null}
          </div>
          {speedContext ? (
            <div className="modifier-section">
              <span className="modifier-section-label">Speed</span>
              <div className="modifier-grid modifier-grid-speed-block">
                <SpeedSidePanel
                  label="Your side"
                  tailwind={yourTailwind === "yes"}
                  trickRoom={trickRoom === "yes"}
                  onTailwind={(checked) => patchLayout({ yourTailwind: checked ? "yes" : "" })}
                  onTrickRoom={(checked) => patchLayout({ trickRoom: checked ? "yes" : "" })}
                />
                <SpeedSidePanel
                  label="Their side"
                  tailwind={theirTailwind === "yes"}
                  trickRoom={trickRoom === "yes"}
                  onTailwind={(checked) => patchLayout({ theirTailwind: checked ? "yes" : "" })}
                  onTrickRoom={(checked) => patchLayout({ trickRoom: checked ? "yes" : "" })}
                />
                <StatStageField
                  label="Your Spe"
                  value={yourStatStage}
                  onChange={(value) => patchLayout({ yourStatStage: value })}
                />
                <StatStageField
                  label="Their Spe"
                  value={theirStatStage}
                  onChange={(value) => patchLayout({ theirStatStage: value })}
                />
              </div>
            </div>
          ) : (
            <div className="modifier-section">
              <span className="modifier-section-label">Stat stages</span>
              <div className="modifier-grid modifier-grid-stages">
                <StatStageField
                  label={`Your ${subjectRelevantStat}`}
                  value={yourStatStage}
                  onChange={(value) => patchLayout({ yourStatStage: value })}
                />
                <StatStageField
                  label={`Their ${opponentRelevantStat}`}
                  value={theirStatStage}
                  onChange={(value) => patchLayout({ theirStatStage: value })}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {!liveAnswer.awaitingScope && liveAnswer.recommendations.length > 0 && (
        <div className="inspector-recommendations">
          <div className="inspector-panel-head">
            <span className="eyebrow">Recommended Builds</span>
            <strong>Ways to change your side</strong>
          </div>
          <div className="survival-grid">
            {liveAnswer.recommendations.map((recommendation) => (
              <article className="survival-card" key={`${recommendation.nature}-${recommendation.item}-${recommendation.hpPoints}-${recommendation.defensePoints}-${recommendation.attackPoints}`}>
                <div className="survival-card-heading">
                  <span>{recommendation.label}</span>
                  <strong>{Math.round(recommendation.outcomeChance * 100)}%</strong>
                </div>
                <h4>{coachRecommendationHeadline(liveAnswer, recommendation)}</h4>
                <p>{coachRecommendationDetail(liveAnswer, recommendation)}</p>
                {liveAnswer.targetBuildId && (
                  <button className="apply-spread" type="button" onClick={() => onApplySpread(liveAnswer.targetBuildId!, liveAnswer, recommendation)}>
                    Apply this spread
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoachDrawer({ open, setOpen, team, selectedId, applySpread }: {
  open: boolean;
  setOpen: (open: boolean) => void;
  team: PokemonBuild[];
  selectedId: string | null;
  applySpread: (buildId: string, answer: CoachAnswer, recommendation: CoachRecommendation) => void;
}) {
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [pinnedQuestions, setPinnedQuestions] = useState<string[]>([]);
  const [selectedPinnedQuestion, setSelectedPinnedQuestion] = useState("");
  const [guidedIntent, setGuidedIntent] = useState<GuidedCoachIntent>("ko");
  const [guidedOpponent, setGuidedOpponent] = useState("");
  const [guidedMove, setGuidedMove] = useState("");
  const [focusedGuideField, setFocusedGuideField] = useState<"opponent" | "move" | null>(null);
  const selectedBuild = team.find((build) => build.id === selectedId);
  const selectedPokemon = POKEMON.find((pokemon) => pokemon.name === selectedBuild?.species);
  const guidedOpponentResolved = useMemo(
    () => (guidedOpponent.trim() ? resolvePokemonFromDisplayName(guidedOpponent.trim()) : null),
    [guidedOpponent],
  );
  const guidedOpponentData = guidedOpponentResolved?.data ?? null;
  const guidedOpponentName = guidedOpponentResolved
    ? guidedOpponentResolved.megaForm
      ? formatMegaDisplayName(guidedOpponentResolved.data.name, guidedOpponentResolved.megaForm.name)
      : guidedOpponentResolved.data.name
    : "";
  const selectedMoveOptions = useMemo(() => {
    const seen = new Set<string>();
    return (selectedBuild?.moves.filter(Boolean) ?? []).filter((move) => {
      if (seen.has(move)) return false;
      seen.add(move);
      return true;
    });
  }, [selectedBuild]);
  const selectedMoveSet = useMemo(() => new Set(selectedMoveOptions), [selectedMoveOptions]);
  const currentMoveOptions = useMemo(() => {
    const learnedMoves = selectedPokemon?.moves ?? [];
    return [
      ...selectedMoveOptions,
      ...learnedMoves.filter((move) => !selectedMoveSet.has(move)),
    ];
  }, [selectedMoveOptions, selectedMoveSet, selectedPokemon]);
  const opponentMoveOptions = guidedOpponentData?.moves ?? [];
  const guidedMoveOptions = guidedIntent === "survive" ? opponentMoveOptions : currentMoveOptions;
  const guidedNeedsMove = guidedIntent !== "speed";
  const guidedMoveIsValid = !guidedNeedsMove || guidedMoveOptions.some((move) => move.toLowerCase() === guidedMove.trim().toLowerCase());
  const guidedCanAsk = Boolean(selectedPokemon && guidedOpponentData && guidedMoveIsValid);
  const selectedGuidedMove = guidedMoveOptions.find((move) => move.toLowerCase() === guidedMove.trim().toLowerCase());
  const opponentSuggestions = useMemo(() => {
    const query = guidedOpponent.trim().toLowerCase();
    if (!query) return [];
    const results: Array<{ key: string; label: string }> = [];
    for (const pokemon of POKEMON) {
      if (pokemon.name.toLowerCase().includes(query)) {
        results.push({ key: pokemon.name, label: pokemon.name });
      }
      for (const form of pokemon.megaForms ?? []) {
        const label = formatMegaDisplayName(pokemon.name, form.name);
        if (label.toLowerCase().includes(query) || pokemon.name.toLowerCase().includes(query)) {
          results.push({ key: form.name, label });
        }
      }
    }
    return results.slice(0, 10);
  }, [guidedOpponent]);
  const moveSuggestions = useMemo(() => {
    const query = guidedMove.trim().toLowerCase();
    if (!guidedNeedsMove) return [];
    return guidedMoveOptions
      .filter((move) => !query || move.toLowerCase().includes(query));
  }, [guidedMove, guidedMoveOptions, guidedNeedsMove]);
  const showOpponentSuggestions = opponentSuggestions.length > 0 && !guidedOpponentResolved && (focusedGuideField === "opponent" || Boolean(guidedOpponent.trim()));
  const showMoveSuggestions = moveSuggestions.length > 0 && (focusedGuideField === "move" || (Boolean(guidedMove.trim()) && !selectedGuidedMove));
  useEffect(() => {
    if (!guidedNeedsMove) setGuidedMove("");
  }, [guidedNeedsMove]);
  useEffect(() => {
    setGuidedMove("");
  }, [guidedIntent, guidedOpponentName, selectedId]);
  const answer = useMemo(
    () => submittedQuestion ? answerCoachQuestion(submittedQuestion, team, selectedId) : null,
    [submittedQuestion, team, selectedId],
  );
  const pinnedCalcs = useMemo(
    () => pinnedQuestions.map((question) => ({
      question,
      answer: answerCoachQuestion(question, team, selectedId),
    })),
    [pinnedQuestions, team, selectedId],
  );
  const selectedPinnedCalc = useMemo(
    () => pinnedCalcs.find((calc) => calc.question === selectedPinnedQuestion),
    [pinnedCalcs, selectedPinnedQuestion],
  );
  const inspectorQuestion = selectedPinnedCalc?.question ?? submittedQuestion;
  const inspectorAnswer = selectedPinnedCalc?.answer ?? answer;
  const [layoutByQuestion, setLayoutByQuestion] = useState<Record<string, InspectorLayoutState>>({});
  const [templateByOpponent, setTemplateByOpponent] = useState<Record<string, InspectorLayoutState>>({});
  const [dismissedTemplateForQuestion, setDismissedTemplateForQuestion] = useState<Record<string, boolean>>({});
  const [inspectorLivePreview, setInspectorLivePreview] = useState<{
    question: string;
    range?: NonNullable<CoachAnswer["currentRange"]>;
    check?: NonNullable<CoachAnswer["currentCheck"]>;
    mode: CoachAnswer["mode"];
  } | null>(null);
  const inspectorDefaultLayout = useMemo(
    () => (inspectorAnswer ? buildDefaultInspectorLayout(inspectorAnswer, team) : null),
    [inspectorAnswer, team],
  );
  const inspectorOpponentKey = useMemo(
    () => (inspectorAnswer ? getOpponentLayoutKey(inspectorAnswer, team) : null),
    [inspectorAnswer, team],
  );
  const inspectorLayout = useMemo(
    () => (inspectorQuestion && inspectorDefaultLayout
      ? layoutByQuestion[inspectorQuestion] ?? inspectorDefaultLayout
      : null),
    [inspectorDefaultLayout, inspectorQuestion, layoutByQuestion],
  );
  const showApplyTemplatePrompt = Boolean(
    inspectorQuestion
    && inspectorOpponentKey
    && inspectorDefaultLayout
    && !layoutByQuestion[inspectorQuestion]
    && templateByOpponent[inspectorOpponentKey]
    && !dismissedTemplateForQuestion[inspectorQuestion]
    && pinnedCalcs.filter((calc) => getOpponentLayoutKey(calc.answer, team) === inspectorOpponentKey).length > 1,
  );
  const inspectorOpponentLabel = useMemo(
    () => (inspectorAnswer ? inspectorComparedContext(inspectorAnswer, team)?.opponentLabel : undefined),
    [inspectorAnswer, team],
  );
  const handleInspectorLayoutChange = (
    update: Partial<InspectorLayoutState> | ((current: InspectorLayoutState) => InspectorLayoutState),
  ) => {
    if (!inspectorQuestion || !inspectorDefaultLayout || !inspectorOpponentKey) return;
    setLayoutByQuestion((current) => {
      const previous = current[inspectorQuestion] ?? inspectorDefaultLayout;
      const next = typeof update === "function" ? update(previous) : { ...previous, ...update };
      setTemplateByOpponent((templates) => ({ ...templates, [inspectorOpponentKey]: next }));
      return { ...current, [inspectorQuestion]: next };
    });
  };
  const applyOpponentTemplate = () => {
    if (!inspectorQuestion || !inspectorOpponentKey || !templateByOpponent[inspectorOpponentKey] || !inspectorDefaultLayout) return;
    const template = templateByOpponent[inspectorOpponentKey];
    setLayoutByQuestion((current) => ({
      ...current,
      [inspectorQuestion]: {
        ...template,
        comparedMegaForm: template.comparedMegaForm ?? inspectorDefaultLayout.comparedMegaForm,
      },
    }));
    setDismissedTemplateForQuestion((current) => ({ ...current, [inspectorQuestion]: true }));
  };
  useEffect(() => {
    setInspectorLivePreview(null);
  }, [inspectorQuestion]);
  const pinResolvedQuestion = (resolvedQuestion: string, replaceOldest = false) => {
    const pinnedAnswer = answerCoachQuestion(resolvedQuestion, team, selectedId);
    if (!pinnedAnswer.currentRange && !pinnedAnswer.currentCheck) return false;
    setPinnedQuestions((current) => {
      if (current.includes(resolvedQuestion)) return current;
      const next = replaceOldest && current.length >= MAX_PINNED_CALCS
        ? current.slice(1)
        : current;
      if (next.length >= MAX_PINNED_CALCS) return next;
      return [...next, resolvedQuestion];
    });
    setSelectedPinnedQuestion(resolvedQuestion);
    return true;
  };
  const askGuidedQuestion = () => {
    if (!selectedPokemon || !guidedOpponentData) return;
    let resolvedQuestion: string;
    if (guidedIntent === "ko") {
      const move = guidedMoveOptions.find((option) => option.toLowerCase() === guidedMove.trim().toLowerCase());
      if (!move) return;
      resolvedQuestion = `Can ${selectedPokemon.name} KO ${guidedOpponentName} with ${move}?`;
    } else if (guidedIntent === "survive") {
      const move = guidedMoveOptions.find((option) => option.toLowerCase() === guidedMove.trim().toLowerCase());
      if (!move) return;
      resolvedQuestion = `Can ${selectedPokemon.name} survive ${guidedOpponentName}'s ${move}?`;
    } else {
      resolvedQuestion = `Can ${selectedPokemon.name} outspeed ${guidedOpponentName}?`;
    }
    pinResolvedQuestion(resolvedQuestion, true);
  };
  const submitGuidedQuestion = (event: FormEvent) => {
    event.preventDefault();
    askGuidedQuestion();
  };
  const unpinCalc = (question: string) => {
    setPinnedQuestions((current) => current.filter((entry) => entry !== question));
    if (selectedPinnedQuestion === question) setSelectedPinnedQuestion("");
    setLayoutByQuestion((current) => {
      const { [question]: removed, ...rest } = current;
      void removed;
      return rest;
    });
    setDismissedTemplateForQuestion((current) => {
      const { [question]: removed, ...rest } = current;
      void removed;
      return rest;
    });
  };
  const inspectPinnedCalc = (question: string) => {
    setSelectedPinnedQuestion(question);
    setSubmittedQuestion(question);
    setOpen(true);
  };
  return (
    <section className={`coach-drawer ${open ? "open" : ""}`}>
      <div className="coach-strip">
        <button className="coach-identity" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="coach-avatar"><Swords size={17} /></span>
          <span className="sr-only">Pane Coach</span>
        </button>
        <form className="coach-strip-guide" data-intent={guidedIntent} onSubmit={submitGuidedQuestion} aria-label="Guided Pane Coach question builder">
          <div className="coach-strip-intents" role="group" aria-label="Choose what Pane Coach should check">
            {([
              ["ko", "KO"],
              ["survive", "Survive"],
              ["speed", "Speed"],
            ] as const).map(([intent, label]) => (
              <button
                key={intent}
                className={guidedIntent === intent ? "active" : ""}
                type="button"
                onClick={() => setGuidedIntent(intent)}
                aria-pressed={guidedIntent === intent}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="coach-strip-field coach-autocomplete-field">
            <span>Opponent</span>
            <input
              value={guidedOpponent}
              onChange={(event) => {
                setGuidedOpponent(event.target.value);
                setFocusedGuideField("opponent");
              }}
              onFocus={() => setFocusedGuideField("opponent")}
              onBlur={() => setFocusedGuideField(null)}
              placeholder="Choose..."
              autoComplete="off"
            />
            {showOpponentSuggestions && (
              <div className="coach-suggest-list" role="listbox">
                {opponentSuggestions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setGuidedOpponent(option.label);
                      setFocusedGuideField(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </label>
          {guidedNeedsMove ? (
            <label className="coach-strip-field coach-autocomplete-field">
              <span>{guidedIntent === "survive" ? "Their move" : "Your move"}</span>
              <input
                value={guidedMove}
                onChange={(event) => {
                  setGuidedMove(event.target.value);
                  setFocusedGuideField("move");
                }}
                onFocus={(event) => {
                  setFocusedGuideField("move");
                  event.currentTarget.select();
                }}
                onBlur={() => setFocusedGuideField(null)}
                placeholder={
                  !guidedMoveOptions.length
                    ? (guidedIntent === "survive" ? "Pick foe first" : "No move")
                    : (guidedIntent === "survive" ? "Type foe move..." : "Type move...")
                }
                disabled={!guidedMoveOptions.length}
                autoComplete="off"
              />
              {showMoveSuggestions && (
                <div className="coach-suggest-list coach-move-suggest-list" role="listbox">
                  {moveSuggestions.map((move) => (
                    <button
                      key={move}
                      className={guidedIntent !== "survive" && selectedMoveSet.has(move) ? "pinned" : ""}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setGuidedMove(move);
                        setFocusedGuideField(null);
                      }}
                    >
                      <span>{move}</span>
                      {guidedIntent !== "survive" && selectedMoveSet.has(move) && <small>Set</small>}
                    </button>
                  ))}
                </div>
              )}
            </label>
          ) : null}
          <button className="coach-strip-submit" type="submit" aria-label="Ask Pane Coach" disabled={!guidedCanAsk}><ArrowUp size={16} /></button>
        </form>
        <div className={`coach-pin-stack ${pinnedCalcs.some(({ answer: pinnedAnswer }) => pinnedAnswer.currentRange || pinnedAnswer.currentCheck) ? "" : "empty"}`} aria-label={`${pinnedCalcs.length} pinned coach results`}>
          {pinnedCalcs.some(({ answer: pinnedAnswer }) => pinnedAnswer.currentRange || pinnedAnswer.currentCheck) ? (
            pinnedCalcs.map(({ question, answer: pinnedAnswer }) => {
              const pinLayout = layoutByQuestion[question] ?? buildDefaultInspectorLayout(pinnedAnswer, team);
              return pinnedAnswer.currentRange ? (
                <PinnedDamageVis
                  key={question}
                  range={
                    (question === inspectorQuestion && inspectorLivePreview?.question === question && inspectorLivePreview.range)
                      ? inspectorLivePreview.range
                      : resolvePinnedCoachRange(question, pinnedAnswer, team, selectedId, pinLayout)
                      ?? pinnedAnswer.currentRange!
                  }
                  mode={
                    question === inspectorQuestion && inspectorLivePreview?.question === question
                      ? inspectorLivePreview.mode
                      : pinnedAnswer.mode
                  }
                  title={pinnedAnswer.title}
                  selected={question === inspectorQuestion}
                  onSelect={() => inspectPinnedCalc(question)}
                  onUnpin={() => unpinCalc(question)}
                />
              ) : pinnedAnswer.currentCheck ? (
                <PinnedCheckVis
                  key={question}
                  check={
                    (question === inspectorQuestion && inspectorLivePreview?.question === question && inspectorLivePreview.check)
                      ? inspectorLivePreview.check
                      : resolvePinnedCoachCheck(question, pinnedAnswer, team, selectedId, pinLayout)
                      ?? pinnedAnswer.currentCheck
                  }
                  selected={question === inspectorQuestion}
                  onSelect={() => inspectPinnedCalc(question)}
                  onUnpin={() => unpinCalc(question)}
                />
              ) : null;
            })
          ) : (
            <span className="coach-pin-empty">Pinned calcs</span>
          )}
        </div>
        <button className="expand-coach" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close Pane Coach" : "Open Pane Coach"}>{open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
      </div>
      <div className="coach-content">
        <div className="coach-column coach-conversation">
          {!inspectorAnswer || !inspectorQuestion ? (
            <div className="coach-empty">
              <h3>Select a pinned calc</h3>
              <p>Click a pinned damage or speed result in the strip to inspect the opposing Pokémon, assumptions, and extra modifiers.</p>
            </div>
          ) : (
            <CoachCalcInspector
              question={inspectorQuestion}
              answer={inspectorAnswer}
              team={team}
              selectedId={selectedId}
              layout={inspectorLayout ?? inspectorDefaultLayout!}
              onLayoutChange={handleInspectorLayoutChange}
              opponentTemplateLabel={inspectorOpponentLabel}
              showApplyTemplatePrompt={showApplyTemplatePrompt}
              onApplyOpponentTemplate={applyOpponentTemplate}
              onDismissApplyTemplatePrompt={() => {
                if (!inspectorQuestion) return;
                setDismissedTemplateForQuestion((current) => ({ ...current, [inspectorQuestion]: true }));
              }}
              onApplySpread={applySpread}
              onLivePreview={setInspectorLivePreview}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function pinnedMatchupLabel(mode: CoachAnswer["mode"], range: NonNullable<CoachAnswer["currentRange"]>) {
  return mode === "offensive"
    ? `${range.moveName} vs ${range.defenderName}`
    : `${range.moveName} from ${range.attackerName}`;
}

function PinnedDamageVis({ range, mode, title, selected, onSelect, onUnpin }: {
  range: NonNullable<CoachAnswer["currentRange"]>;
  mode: CoachAnswer["mode"];
  title: string;
  selected?: boolean;
  onSelect?: () => void;
  onUnpin?: () => void;
}) {
  const [low, high] = range.damagePercent;
  const scaleMax = Math.max(100, Math.ceil(high / 25) * 25);
  const left = Math.min(100, low / scaleMax * 100);
  const width = Math.max(1.5, Math.min(100 - left, (high - low) / scaleMax * 100));
  const oddsLabel = mode === "defensive" ? "survive" : "KO";
  const tone = range.outcomeChance >= 1 ? "pass" : range.outcomeChance >= 0.5 ? "warn" : "fail";
  const matchupLabel = pinnedMatchupLabel(mode, range);
  return (
    <button className={`coach-pin-vis ${selected ? "selected" : ""}`} type="button" onClick={onSelect} aria-label={`${title}: ${low} to ${high} percent of HP`}>
      <div className="coach-pin-topline">
        <span className="coach-pin-label" title={matchupLabel}>{matchupLabel}</span>
        {onUnpin && (
          <span
            className="coach-pin-unpin"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onUnpin();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onUnpin();
            }}
            aria-label="Unpin damage calc"
          >
            <X size={11} />
          </span>
        )}
      </div>
      <div className="coach-pin-body">
        <strong className={tone}>{low}–{high}%</strong>
        <div className="coach-pin-track" aria-hidden="true"><i style={{ left: `${left}%`, width: `${width}%` }} /></div>
        <small>{Math.round(range.outcomeChance * 100)}% {oddsLabel}</small>
      </div>
    </button>
  );
}

function PinnedCheckVis({ check, selected, onSelect, onUnpin }: {
  check: NonNullable<CoachAnswer["currentCheck"]>;
  selected?: boolean;
  onSelect?: () => void;
  onUnpin?: () => void;
}) {
  const tone = speedOutcomeTone(check.outcomeLabel);
  const headline = check.outcomeLabel ?? check.value;
  const pinTitle = check.title;
  return (
    <button className={`coach-pin-vis coach-pin-check ${selected ? "selected" : ""}`} type="button" onClick={onSelect} title={check.verdict} aria-label={`${pinTitle}: ${headline}. ${check.value}. ${check.verdict}`}>
      <div className="coach-pin-topline">
        <span className="coach-pin-label" title={pinTitle}>{pinTitle}</span>
        {onUnpin && (
          <span
            className="coach-pin-unpin"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onUnpin();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onUnpin();
            }}
            aria-label="Unpin coach check"
          >
            <X size={11} />
          </span>
        )}
      </div>
      <div className="coach-pin-body">
        <strong className={tone}>{headline}</strong>
        {check.outcomeLabel ? (
          <small className="coach-pin-speed-stats">{check.value}</small>
        ) : (
          <small>{check.label}</small>
        )}
      </div>
    </button>
  );
}

function PokemonPicker({ query, setQuery, close, add, team }: { query: string; setQuery: (query: string) => void; close: () => void; add: (pokemon: PokemonData) => void; team: PokemonBuild[] }) {
  const results = POKEMON.filter((pokemon) => pokemon.name.toLowerCase().includes(query.toLowerCase()));
  const firstAvailableResult = results.find((pokemon) => !team.some((entry) => entry.species === pokemon.name));
  const setEnterHovered = useEnterToSelectHovered(add);
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="picker modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={close}><X size={18} /></button>
        <span className="eyebrow">ADD POKÉMON</span>
        <h2>{team.length ? "Who joins the plan?" : "Start with someone you love."}</h2>
        <div className="search-box"><Search size={18} /><input autoFocus placeholder="Search Pokémon..." value={query} onChange={(event) => { setQuery(event.target.value); setEnterHovered(null); }} onKeyDown={(event) => { if (event.key === "Enter" && firstAvailableResult) { event.preventDefault(); event.stopPropagation(); add(firstAvailableResult); } }} /></div>
        <div className="pokemon-grid">
          {results.map((pokemon) => (
            <button
              key={pokemon.name}
              onClick={() => add(pokemon)}
              disabled={team.some((entry) => entry.species === pokemon.name)}
              onPointerEnter={() => setEnterHovered(team.some((entry) => entry.species === pokemon.name) ? null : pokemon)}
              onPointerLeave={() => setEnterHovered(null)}
            >
              <div className={`picker-art aura-${pokemon.types[0].toLowerCase()}`}><img src={pokemon.sprite} alt="" /></div>
              <strong>{pokemon.name}</strong>
              <small>{pokemon.role}</small>
              <div className="type-row">{pokemon.types.map((type) => <span className={`type type-${type.toLowerCase()}`} key={type}>{type}</span>)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamLibraryModal({ savedTeams, activeSavedTeamId, close, load, remove, startNew }: {
  savedTeams: SavedTeam[];
  activeSavedTeamId: string | null;
  close: () => void;
  load: (team: SavedTeam) => void;
  remove: (team: SavedTeam) => void;
  startNew: () => void;
}) {
  const sortedTeams = [...savedTeams].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="team-library modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={close} aria-label="Close saved teams"><X size={18} /></button>
        <div className="team-library-heading">
          <div>
            <span className="eyebrow">TEAM LIBRARY</span>
            <h2>Your saved teams</h2>
            <p>Load a team to keep building exactly where you left off.</p>
          </div>
          <button className="ghost-button" type="button" onClick={startNew}><Plus size={16} /> New team</button>
        </div>
        {sortedTeams.length ? (
          <div className="saved-team-grid">
            {sortedTeams.map((savedTeam) => (
              <article className={`saved-team-card ${savedTeam.id === activeSavedTeamId ? "active" : ""}`} key={savedTeam.id}>
                <div className="saved-team-card-heading">
                  <div>
                    <strong>{savedTeam.name}</strong>
                    <small>{savedTeam.pokemon.length} Pokémon · Saved {new Date(savedTeam.updatedAt).toLocaleDateString()}</small>
                  </div>
                  {savedTeam.id === activeSavedTeamId && <span>Open</span>}
                </div>
                <div className="saved-team-roster" aria-label={`${savedTeam.name} roster`}>
                  {savedTeam.pokemon.map((build) => {
                    const pokemon = POKEMON.find((entry) => entry.name === build.species);
                    return pokemon ? <img key={build.id} src={pokemon.sprite} alt={build.species} title={build.species} /> : null;
                  })}
                </div>
                <div className="saved-team-actions">
                  <button className="primary-button" type="button" onClick={() => load(savedTeam)}>
                    <FolderOpen size={15} /> {savedTeam.id === activeSavedTeamId ? "Reload" : "Open team"}
                  </button>
                  <button className="icon-button danger" type="button" onClick={() => remove(savedTeam)} aria-label={`Delete ${savedTeam.name}`} title="Delete saved team">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="saved-team-empty">
            <FolderOpen size={30} />
            <h3>No saved teams yet</h3>
            <p>Build a team, then use Save team in the header to keep it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveTeamModal({ name, setName, isUpdate, close, save }: {
  name: string;
  setName: (name: string) => void;
  isUpdate: boolean;
  close: () => void;
  save: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form className="save-team-modal modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={close} aria-label="Close save team"><X size={18} /></button>
        <span className="eyebrow">{isUpdate ? "UPDATE SAVED TEAM" : "SAVE TO LIBRARY"}</span>
        <h2>{isUpdate ? "Save your latest changes." : "Give this team a name."}</h2>
        <label htmlFor="team-name">Team name</label>
        <input id="team-name" autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Rain offense" />
        <div className="save-team-actions">
          <button className="ghost-button" type="button" onClick={close}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!name.trim()}><Save size={16} /> {isUpdate ? "Update team" : "Save team"}</button>
        </div>
      </form>
    </div>
  );
}

function TransferModal({ mode, text, setText, close, applyImport }: { mode: "import" | "export"; text: string; setText: (text: string) => void; close: () => void; applyImport: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="transfer-modal modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={close}><X size={18} /></button>
        <span className="eyebrow">SHOWDOWN TEXT</span>
        <h2>{mode === "export" ? "Your team is ready to travel." : "Bring in a team."}</h2>
        <p>{mode === "export" ? "Paste this into Pokémon Showdown’s Pokémon Champions team builder." : "Paste a Pokémon Showdown team below. Supported Pokémon will become editable cards."}</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} readOnly={mode === "export"} placeholder="Paste Showdown team text..." />
        <button className="primary-button" onClick={mode === "export" ? () => navigator.clipboard.writeText(text) : applyImport}>
          {mode === "export" ? <><Clipboard size={16} /> Copy team</> : <><Upload size={16} /> Import team</>}
        </button>
      </div>
    </div>
  );
}
