"use client";

import { Fragment, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
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
  Sun,
  Swords,
  Trash2,
  Upload,
  Wind,
  Zap,
  RotateCcw,
  X,
} from "lucide-react";
import { answerCoachQuestion, applyCoachRecommendation, CoachAnswer, CoachRecommendation, CoachSearchScope, coachQuestionWithScope } from "../lib/coach";
import {
  CHAMPIONS_STAT_POINT_MAX,
  CHAMPIONS_STAT_POINT_TOTAL,
  calculateStat,
  createBuild,
  exportShowdown,
  getNatureEffect,
  importShowdown,
  POKEMON,
  PokemonBuild,
  PokemonData,
  MegaForm,
  megaFormArtworkUrls,
  StatKey,
  validateTeam,
} from "../lib/pokemon";
import { itemSpriteFallbackUrls } from "../lib/item-sprites";
import optionDetails from "../data/champions-options.json";

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
const THEME_KEY = "poke-pane-theme";
const NATURE_STATS = ["Atk", "Def", "SpA", "SpD", "Spe"] as const;
const NATURE_CHART = [
  ["Hardy", "Lonely", "Adamant", "Naughty", "Brave"],
  ["Bold", "Docile", "Impish", "Lax", "Relaxed"],
  ["Modest", "Mild", "Bashful", "Rash", "Quiet"],
  ["Calm", "Gentle", "Careful", "Quirky", "Sassy"],
  ["Timid", "Hasty", "Jolly", "Naive", "Serious"],
] as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState<"import" | "export" | null>(null);
  const [transferText, setTransferText] = useState("");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [savedTeamsReady, setSavedTeamsReady] = useState(false);
  const [activeSavedTeamId, setActiveSavedTeamId] = useState<string | null>(null);
  const [teamLibraryOpen, setTeamLibraryOpen] = useState(false);
  const [saveTeamOpen, setSaveTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");

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
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const selected = team.find((pokemon) => pokemon.id === selectedId) ?? null;
  const selectedData = POKEMON.find((pokemon) => pokemon.name === selected?.species) ?? null;
  const issues = useMemo(() => validateTeam(team), [team]);

  const addPokemon = (pokemon: PokemonData) => {
    const build = createBuild(pokemon);
    setTeam((current) => [...current, build].slice(0, 6));
    setSelectedId(build.id);
    setPickerOpen(false);
    setQuery("");
  };

  const updateSelected = (changes: Partial<PokemonBuild>) => {
    if (!selectedId) return;
    setTeam((current) =>
      current.map((pokemon) => (pokemon.id === selectedId ? { ...pokemon, ...changes } : pokemon)),
    );
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const next = team.filter((pokemon) => pokemon.id !== selectedId);
    setTeam(next);
    setSelectedId(next[0]?.id ?? null);
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
      setTeam(imported.slice(0, 6));
      setSelectedId(imported[0].id);
      setActiveSavedTeamId(null);
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
      setSavedTeams((current) => [{ id, name, pokemon: snapshot, updatedAt: now }, ...current]);
      setActiveSavedTeamId(id);
    }
    setSaveTeamOpen(false);
  };

  const loadSavedTeam = (savedTeam: SavedTeam) => {
    const loaded = structuredClone(savedTeam.pokemon);
    setTeam(loaded);
    setSelectedId(loaded[0]?.id ?? null);
    setActiveSavedTeamId(savedTeam.id);
    setTeamLibraryOpen(false);
  };

  const startNewTeam = () => {
    setTeam([]);
    setSelectedId(null);
    setActiveSavedTeamId(null);
    setTeamLibraryOpen(false);
  };

  const deleteSavedTeam = (savedTeam: SavedTeam) => {
    if (!window.confirm(`Delete “${savedTeam.name}”? This cannot be undone.`)) return;
    setSavedTeams((current) => current.filter((entry) => entry.id !== savedTeam.id));
    if (activeSavedTeamId === savedTeam.id) setActiveSavedTeamId(null);
  };

  const activeSavedTeam = savedTeams.find((savedTeam) => savedTeam.id === activeSavedTeamId);

  return (
    <main className={`app-shell ${coachOpen ? "coach-open" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <div>
            <strong>POKE PANE</strong>
            <small>Build with clarity. Battle with intent.</small>
          </div>
        </div>
        <div className="format-pill">
          <span className="live-dot" />
          Champions · Regulation MB
          <ChevronDown size={14} />
        </div>
        <div className="header-actions">
          <button
            className="icon-button theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
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
                  onClick={() => setSelectedId(pokemon.id)}
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
                <Plus size={20} />
                <span>Add Pokémon</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-area">
          {!selected || !selectedData ? (
            <EmptyEditor onStart={() => setPickerOpen(true)} />
          ) : (
            <PokemonEditor
              build={selected}
              data={selectedData}
              update={updateSelected}
              remove={removeSelected}
            />
          )}
        </section>
      </div>

      <CoachDrawer
        open={coachOpen}
        setOpen={setCoachOpen}
        issues={issues}
        team={team}
        selectedId={selectedId}
        applySpread={applyCoachSpread}
      />

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

function EmptyEditor({ onStart }: { onStart: () => void }) {
  return (
    <div className="empty-editor">
      <div className="orbit one" />
      <div className="orbit two" />
      <div className="anchor-orb"><Sparkles size={34} /></div>
      <h1>Add Pokémon</h1>
      <button className="primary-button large" onClick={onStart}><Plus size={18} /> Add Pokémon</button>
    </div>
  );
}

function PokemonEditor({
  build,
  data,
  update,
  remove,
}: {
  build: PokemonBuild;
  data: PokemonData;
  update: (changes: Partial<PokemonBuild>) => void;
  remove: () => void;
}) {
  const [choice, setChoice] = useState<{ kind: "item" | "ability" | "move"; moveIndex?: number } | null>(null);
  const [natureOpen, setNatureOpen] = useState(false);
  const megaForm = data.megaForms?.find((form) => form.name === build.megaForm) ?? null;
  const [artworkError, setArtworkError] = useState(false);
  const [showStatPreview, setShowStatPreview] = useState(true);
  const [showBaseStats, setShowBaseStats] = useState(false);
  useEffect(() => setArtworkError(false), [data.name, megaForm?.name]);
  const updateStat = (stat: StatKey, value: number) => {
    const used = Object.entries(build.evs)
      .filter(([key]) => key !== stat)
      .reduce((sum, [, statValue]) => sum + statValue, 0);
    update({ evs: { ...build.evs, [stat]: Math.max(0, Math.min(CHAMPIONS_STAT_POINT_MAX, CHAMPIONS_STAT_POINT_TOTAL - used, Math.round(value))) } });
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
              <span className="ev-budget">{CHAMPIONS_STAT_POINT_TOTAL - Object.values(build.evs).reduce((a, b) => a + b, 0)} Stat Points left</span>
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
      ? megaFormArtworkUrls(megaForm, data)
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

function MegaToggle({ forms, selected, select }: { forms: MegaForm[]; selected: string | null; select: (name: string | null) => void }) {
  const label = (name: string) => name.split("-").slice(1).join(" ").replace("Mega", "Mega") || "Mega";
  const active = selected !== null;
  return (
    <div className="mega-toggle-wrap">
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
        <Sparkles size={11} />
        <span>Mega preview</span>
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
    return [centerX + Math.cos(angle) * radius * ratio, centerY + Math.sin(angle) * radius * ratio];
  };
  const evRatio = (ev: number) => minRatio + (ev / CHAMPIONS_STAT_POINT_MAX) * (1 - minRatio);
  const evRatios = stats.map((stat) => evRatio(build.evs[stat]));
  const polygon = evRatios.map((value, index) => point(index, value).join(",")).join(" ");
  const rawBases = stats.map((stat) => baseStats[stat]);
  const battleStats = stats.map((stat) => calculateStat(baseStats[stat], build.evs[stat], stat, build.nature));
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
    showBaseStats ? baseStats[stat] : calculateStat(baseStats[stat], build.evs[stat], stat, build.nature);
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
        <label className="radar-ev-input">
          <input
            aria-label={`${stat} Stat Points`}
            type="number"
            min="0"
            max={CHAMPIONS_STAT_POINT_MAX}
            step="1"
            value={build.evs[stat]}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => updateStat(stat, Number(event.target.value))}
            onBlur={(event) => updateStat(stat, Number(event.target.value))}
          />
          <span>SP</span>
          <span className="ev-steppers">
            <button type="button" aria-label={`Increase ${stat} Stat Points by 1`} onClick={() => updateStat(stat, build.evs[stat] + 1)}>▲</button>
            <button type="button" aria-label={`Decrease ${stat} Stat Points by 1`} onClick={() => updateStat(stat, build.evs[stat] - 1)}>▼</button>
          </span>
        </label>
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
                aria-valuenow={build.evs[stat]}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowRight") updateStat(stat, build.evs[stat] + 1);
                  if (event.key === "ArrowDown" || event.key === "ArrowLeft") updateStat(stat, build.evs[stat] - 1);
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
  const options = choice.kind === "item" ? data.items : choice.kind === "ability" ? data.abilities : data.moves;
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
  const matchup = mode === "offensive"
    ? `${range.moveName} → ${range.defenderName}`
    : `${range.attackerName}'s ${range.moveName}`;
  return (
    <div className="live-damage-range" aria-label={`Current damage: ${low} to ${high} percent of HP (${damageLow}–${damageHigh} damage)`}>
      <div className="live-damage-copy">
        <span>{matchup}</span>
        <strong className={tone}>{low}–{high}%</strong>
        <p>{damageLow}–{damageHigh} damage · {range.targetHp} HP</p>
      </div>
      <div className="damage-range-visual">
        <div className="damage-range-track" aria-hidden="true"><i style={{ left: `${left}%`, width: `${width}%` }} /></div>
        <div><span>{low}%</span><span>{high}%</span></div>
      </div>
      <div className="live-damage-meta">
        <span><small>{oddsLabel} odds</small><strong>{Math.round(range.outcomeChance * 100)}%</strong></span>
        <span><small>Target HP</small><strong>{range.targetHp}</strong></span>
        <span><small>Rolls</small><strong>16</strong></span>
      </div>
    </div>
  );
}

function CoachDrawer({ open, setOpen, issues, team, selectedId, applySpread }: {
  open: boolean;
  setOpen: (open: boolean) => void;
  issues: ReturnType<typeof validateTeam>;
  team: PokemonBuild[];
  selectedId: string | null;
  applySpread: (buildId: string, answer: CoachAnswer, recommendation: CoachRecommendation) => void;
}) {
  const defensiveExample = "How can I build Staraptor to survive a +SpA nature, max SpA Raichu using Thunderbolt?";
  const offensiveExample = "Can this kill a Raichu with Brave Bird in rain and Electric Terrain?";
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [pinnedQuestions, setPinnedQuestions] = useState<string[]>([]);
  const [conversation, setConversation] = useState<Array<{ prompt: string; resolvedQuestion: string; usedContext: boolean }>>([]);
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
  const runQuestion = (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt) return;
    const previousTurn = conversation[conversation.length - 1];
    const directAnswer = answerCoachQuestion(prompt, team, selectedId);
    const usedContext = directAnswer.assumptions.length === 0 && Boolean(previousTurn);
    const resolvedQuestion = usedContext
      ? `${previousTurn.resolvedQuestion}\nFollow-up constraint: ${prompt}`
      : prompt;
    setConversation((current) => [...current, { prompt, resolvedQuestion, usedContext }]);
    setSubmittedQuestion(resolvedQuestion);
    setQuestion("");
    setOpen(true);
  };
  const submitQuestion = () => runQuestion(question);
  const ask = (event: FormEvent) => {
    event.preventDefault();
    submitQuestion();
  };
  const handleQuestionKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitQuestion();
  };
  const useExample = (example: string) => {
    runQuestion(example);
  };
  const latestTurn = conversation[conversation.length - 1];
  const earlierTurns = conversation.slice(Math.max(0, conversation.length - 4), -1);
  const isPinned = Boolean(submittedQuestion && pinnedQuestions.includes(submittedQuestion));
  const pinSlotsFull = pinnedQuestions.length >= MAX_PINNED_CALCS;
  const pinCurrentCalc = () => {
    if (!submittedQuestion || !answer?.currentRange || isPinned || pinSlotsFull) return;
    setPinnedQuestions((current) => [...current, submittedQuestion]);
  };
  const unpinCalc = (question: string) => {
    setPinnedQuestions((current) => current.filter((entry) => entry !== question));
  };
  const togglePinCurrentCalc = () => {
    if (!submittedQuestion || !answer?.currentRange) return;
    if (isPinned) unpinCalc(submittedQuestion);
    else pinCurrentCalc();
  };
  const applyScope = (scope: CoachSearchScope) => {
    if (!submittedQuestion) return;
    const resolved = coachQuestionWithScope(submittedQuestion, scope);
    const label = {
      stats: "Stat points only",
      nature: "Different nature",
      item: "Held item",
      all: "Search everything",
    }[scope];
    setConversation((current) => [...current, { prompt: label, resolvedQuestion: resolved, usedContext: true }]);
    setSubmittedQuestion(resolved);
    setOpen(true);
  };
  return (
    <section className={`coach-drawer ${open ? "open" : ""}`}>
      <div className="coach-strip">
        <button className="coach-identity" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="coach-avatar"><Sparkles size={17} /></span>
          <span className="sr-only">Pane Coach</span>
        </button>
        <form className="coach-ask-bar" onSubmit={ask}>
          <label className="sr-only" htmlFor="coach-question">Ask Pane Coach about a damage matchup</label>
          <input
            id="coach-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            placeholder={answer ? "Ask a follow-up about this matchup..." : "Ask Pane Coach about this build..."}
            autoComplete="off"
          />
          <button type="submit" aria-label="Ask Pane Coach" disabled={!question.trim()}><ArrowUp size={16} /></button>
        </form>
        {pinnedCalcs.some(({ answer: pinnedAnswer }) => pinnedAnswer.currentRange) && (
          <div className="coach-pin-stack" aria-label={`${pinnedCalcs.length} pinned damage calcs`}>
            {pinnedCalcs.map(({ question, answer: pinnedAnswer }) => pinnedAnswer.currentRange ? (
              <PinnedDamageVis
                key={question}
                range={pinnedAnswer.currentRange}
                mode={pinnedAnswer.mode}
                title={pinnedAnswer.title}
                onUnpin={() => unpinCalc(question)}
              />
            ) : null)}
          </div>
        )}
        {issues.length > 0 && <span className="issue-count"><AlertTriangle size={14} /> {issues.length}</span>}
        <button className="expand-coach" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close Pane Coach" : "Open Pane Coach"}>{open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
      </div>
      <div className="coach-content">
        <div className="coach-column coach-conversation">
          {!answer ? (
            <div className="coach-empty">
              <h3>Let&apos;s talk damage</h3>
              <p>Ask whether you survive a hit or land a KO. Selected abilities and field conditions are included. For spread moves, say “single target” when only one Pokémon will be hit; otherwise Coach assumes multiple targets in doubles.</p>
              <div className="coach-examples">
                <button type="button" onClick={() => useExample(defensiveExample)}>{defensiveExample}</button>
                <button type="button" onClick={() => useExample(offensiveExample)}>{offensiveExample}</button>
              </div>
            </div>
          ) : (
            <div className="coach-answer" aria-live="polite">
              {earlierTurns.length > 0 && (
                <div className="coach-history" aria-label="Earlier questions">
                  <span>Earlier</span>
                  {earlierTurns.map((turn, index) => (
                    <p key={`${turn.resolvedQuestion}-${index}`}>{turn.prompt}</p>
                  ))}
                </div>
              )}

              {latestTurn && (
                <div className="coach-turn user">
                  <span>You asked</span>
                  <p>{latestTurn.prompt}</p>
                  {latestTurn.usedContext && <small>I’m treating this as a follow-up to the previous calc.</small>}
                </div>
              )}

              <div className="coach-turn coach">
                <div className="coach-message">
                  <span className="eyebrow">Pane Coach</span>
                  <h3>{answer.title}</h3>
                  <p>{answer.intro || answer.summary}</p>
                </div>
              </div>

              {answer.currentRange && (
                <CoachCurrentRange range={answer.currentRange} mode={answer.mode} />
              )}

              {answer.awaitingScope && answer.followUps && (
                <div className="coach-turn coach coach-follow-ups">
                  <p>{answer.prompt}</p>
                  <div className="coach-scope-chips">
                    {answer.followUps.map((followUp) => (
                      <button key={followUp.scope} type="button" onClick={() => applyScope(followUp.scope)}>
                        <strong>{followUp.label}</strong>
                        <small>{followUp.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {answer.currentRange && (
                <div className="coach-pin-actions">
                  <button
                    className={`coach-pin-button ${isPinned ? "active" : ""}`}
                    type="button"
                    onClick={togglePinCurrentCalc}
                    disabled={!isPinned && pinSlotsFull}
                  >
                    <Pin size={12} />
                    {isPinned
                      ? "Pinned to strip"
                      : pinSlotsFull
                        ? `Strip full (${MAX_PINNED_CALCS}/${MAX_PINNED_CALCS})`
                        : pinnedQuestions.length
                          ? `Pin calc to strip (${pinnedQuestions.length}/${MAX_PINNED_CALCS})`
                          : "Pin calc to strip"}
                  </button>
                  {pinSlotsFull && !isPinned && (
                    <small>Unpin a calc from the strip to pin another (max {MAX_PINNED_CALCS}).</small>
                  )}
                  {pinnedQuestions.length > 0 && !isPinned && !pinSlotsFull && (
                    <small>{pinnedQuestions.length} calc{pinnedQuestions.length === 1 ? "" : "s"} pinned — add this one too.</small>
                  )}
                </div>
              )}

              {!answer.awaitingScope && answer.summary && answer.intro && (
                <p className="coach-result-summary">{answer.summary}</p>
              )}

              {!answer.awaitingScope && answer.recommendations.length > 0 && (
                <div className="survival-grid">
                  {answer.recommendations.map((recommendation) => (
                    <article className="survival-card" key={`${recommendation.nature}-${recommendation.item}-${recommendation.hpPoints}-${recommendation.defensePoints}-${recommendation.attackPoints}`}>
                      <div className="survival-card-heading">
                        <span>{recommendation.label}</span>
                        <strong>{recommendation.damagePercent[0]}–{recommendation.damagePercent[1]}%</strong>
                      </div>
                      {answer.mode === "offensive" ? (
                        <>
                          <h4>{coachRecommendationHeadline(answer, recommendation)}</h4>
                          <p>{coachRecommendationDetail(answer, recommendation)}</p>
                          <dl>
                            <div><dt>Damage</dt><dd>{recommendation.damage[0]}–{recommendation.damage[1]}</dd></div>
                            <div><dt>Target HP</dt><dd>{answer.targetHp}</dd></div>
                            <div><dt>KO odds</dt><dd>{Math.round(recommendation.outcomeChance * 100)}%</dd></div>
                          </dl>
                        </>
                      ) : (
                        <>
                          <h4>{coachRecommendationHeadline(answer, recommendation)}</h4>
                          <p>{coachRecommendationDetail(answer, recommendation)}</p>
                          <dl>
                            <div><dt>Damage</dt><dd>{recommendation.damage[0]}–{recommendation.damage[1]}</dd></div>
                            <div><dt>Your HP</dt><dd>{recommendation.hp}</dd></div>
                            <div><dt>Survive odds</dt><dd>{Math.round(recommendation.outcomeChance * 100)}%</dd></div>
                          </dl>
                        </>
                      )}
                      {answer.targetBuildId && (
                        <button className="apply-spread" type="button" onClick={() => applySpread(answer.targetBuildId!, answer, recommendation)}>
                          Apply this spread
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {!answer.awaitingScope && answer.recommendations.length === 0 && answer.followUps && (
                <div className="coach-turn coach coach-follow-ups">
                  <p>Want to try a different approach?</p>
                  <div className="coach-scope-chips">
                    {answer.followUps.map((followUp) => (
                      <button key={followUp.scope} type="button" onClick={() => applyScope(followUp.scope)}>
                        <strong>{followUp.label}</strong>
                        <small>{followUp.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <details className="coach-assumptions">
                <summary>What I assumed for this calc</summary>
                <ul>{answer.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
              </details>
            </div>
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

function PinnedDamageVis({ range, mode, title, onUnpin }: {
  range: NonNullable<CoachAnswer["currentRange"]>;
  mode: CoachAnswer["mode"];
  title: string;
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
    <div className="coach-pin-vis" aria-label={`${title}: ${low} to ${high} percent of HP`}>
      <div className="coach-pin-topline">
        <span className="coach-pin-label" title={matchupLabel}>{matchupLabel}</span>
        {onUnpin && (
          <button className="coach-pin-unpin" type="button" onClick={onUnpin} aria-label="Unpin damage calc">
            <X size={11} />
          </button>
        )}
      </div>
      <strong className={tone}>{low}–{high}%</strong>
      <div className="coach-pin-track" aria-hidden="true"><i style={{ left: `${left}%`, width: `${width}%` }} /></div>
      <small>{Math.round(range.outcomeChance * 100)}% {oddsLabel}</small>
    </div>
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
