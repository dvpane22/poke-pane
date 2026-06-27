"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import {
  BUILD_ASSIST_STARTERS,
  BUILD_ASSIST_VGC_STARTER,
  type BuildAssistAction,
  buildAssistContext,
  formatActionSpread,
  mergeBuildAssistActions,
  normalizeActionSpread,
  parseBuildAssistStream,
  resolveAddPokemonChanges,
  resolveSetChanges,
  sanitizeActionSpread,
  shouldHideAssistProse,
  spreadWasAdjusted,
  streamBuildAssistMessage,
  type BuildAssistMessage,
} from "../../lib/build-assist";
import { CHAMPIONS_STAT_POINT_MAX, CHAMPIONS_STAT_POINT_TOTAL, POKEMON, type PokemonBuild, type StatKey } from "../../lib/pokemon";

const STAT_KEYS: StatKey[] = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

export function BuildAssistBubble({ team, selectedId, mode = "launcher", onAddPokemon, onRemovePokemon, onUpdateSelected }: {
  team: PokemonBuild[];
  selectedId: string | null;
  mode?: "launcher" | "panel";
  onAddPokemon?: (pokemonName: string, changes?: Partial<PokemonBuild>) => string | null;
  onRemovePokemon?: (pokemonId: string) => void;
  onUpdateSelected?: (changes: Partial<PokemonBuild>) => void;
}) {
  const isPanelMode = mode === "panel";
  const [open, setOpen] = useState(isPanelMode);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<BuildAssistMessage[]>([]);
  const [actions, setActions] = useState<BuildAssistPendingAction[]>([]);
  const [streamingActions, setStreamingActions] = useState<BuildAssistPendingAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamReplyRef = useRef("");

  const context = useMemo(() => buildAssistContext(team, selectedId), [selectedId, team]);
  const selectedName = context.pokemon.find((mon) => mon.selected)?.displayName ?? null;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, loading, open, streamingActions, actions]);

  const updateStreamingState = (rawReply: string) => {
    const streamed = parseBuildAssistStream(rawReply);
    const visibleActions = mergeBuildAssistActions(streamed.actions ?? [], streamed.reply, team, selectedId);
    setStreamingActions(visibleActions.map((action, index) => ({ id: `stream-${index}`, action })));
    return streamed;
  };

  const submitMessage = async (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || loading) return;

    const nextMessages: BuildAssistMessage[] = [...messages, { role: "user", content }];
    const assistantIndex = nextMessages.length;
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setDraft("");
    setError(null);
    setActions([]);
    setStreamingActions([]);
    streamReplyRef.current = "";
    setLoading(true);

    try {
      const { reply, actions: proposedActions = [] } = await streamBuildAssistMessage(nextMessages, context, (delta) => {
        streamReplyRef.current += delta;
        const streamed = updateStreamingState(streamReplyRef.current);
        const visibleReply = shouldHideAssistProse(streamed.reply, streamed.actions ?? [])
          ? ""
          : streamed.reply;
        setMessages((current) => current.map((message, index) => (
          index === assistantIndex
            ? { ...message, content: visibleReply }
            : message
        )));
      });
      const visibleActions = mergeBuildAssistActions(proposedActions, reply, team, selectedId);
      const visibleReply = shouldHideAssistProse(reply, visibleActions) ? "" : reply;
      setMessages((current) => current.map((message, index) => (
        index === assistantIndex ? { ...message, content: visibleReply } : message
      )));
      setActions(visibleActions.map((action, index) => ({ id: `${Date.now()}-${index}`, action })));
      setStreamingActions([]);
    } catch (submitError) {
      setMessages((current) => current.filter((_, index) => index !== assistantIndex));
      setStreamingActions([]);
      setError(submitError instanceof Error ? submitError.message : "Build assist failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitMessage(draft);
  };

  const applyAction = (pending: BuildAssistPendingAction) => {
    const selectedBuild = team.find((pokemon) => pokemon.id === selectedId) ?? null;
    const selectedData = POKEMON.find((pokemon) => pokemon.name === selectedBuild?.species) ?? null;
    const action = pending.action;

    if (action.type === "add_pokemon") {
      const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === action.pokemon.toLowerCase());
      const addedId = pokemon ? onAddPokemon?.(pokemon.name, resolveAddPokemonChanges(action, pokemon)) ?? null : null;
      if (addedId) {
        setActions((current) => current.map((entry) => (
          entry.id === pending.id ? { ...entry, appliedPokemonId: addedId } : entry
        )));
      }
      return;
    }
    if (action.type === "update_set") {
      const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === action.pokemon.toLowerCase());
      if (!pokemon) return;
      const onTeam = team.some((entry) => entry.species.toLowerCase() === action.pokemon.toLowerCase());
      if (onTeam && selectedBuild?.species.toLowerCase() === action.pokemon.toLowerCase()) {
        onUpdateSelected?.(resolveSetChanges(action, pokemon));
      } else if (!onTeam) {
        const addedId = onAddPokemon?.(pokemon.name, resolveSetChanges(action, pokemon)) ?? null;
        if (addedId) {
          setActions((current) => current.map((entry) => (
            entry.id === pending.id ? { ...entry, appliedPokemonId: addedId } : entry
          )));
        }
        setActions((current) => current.filter((entry) => entry.id !== pending.id));
        return;
      }
      setActions((current) => current.filter((entry) => entry.id !== pending.id));
      return;
    }
    if (action.type === "set_item") onUpdateSelected?.({ item: action.item });
    if (action.type === "set_ability" && selectedData?.abilities.includes(action.ability)) onUpdateSelected?.({ ability: action.ability });
    if (action.type === "set_nature") onUpdateSelected?.({ nature: action.nature });
    if (action.type === "set_moves" && selectedData) {
      const legalMoves = action.moves.filter((move) => selectedData.moves.includes(move)).slice(0, 4);
      if (legalMoves.length) onUpdateSelected?.({ moves: [...legalMoves, "", "", "", ""].slice(0, 4) });
    }
    if (action.type === "apply_spread" && selectedBuild) {
      const evs = sanitizeActionSpread(action.evs) ?? normalizeActionSpread(action.evs);
      if (evs) onUpdateSelected?.({ evs });
    }

    setActions((current) => current.filter((entry) => entry.id !== pending.id));
  };

  const applyAllAdds = () => {
    const pendingAdds = actions.filter((entry) => entry.action.type === "add_pokemon" && !entry.appliedPokemonId);
    if (!pendingAdds.length) return;

    let slotsLeft = 6 - team.length;
    const nextActions = [...actions];

    for (const pending of pendingAdds) {
      if (slotsLeft <= 0) break;
      const addAction = pending.action;
      if (addAction.type !== "add_pokemon") continue;

      const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === addAction.pokemon.toLowerCase());
      if (!pokemon) continue;
      if (actionDisabledReason(addAction, team, null, false)) continue;

      const addedId = onAddPokemon?.(pokemon.name, resolveAddPokemonChanges(addAction, pokemon)) ?? null;
      if (!addedId) continue;

      slotsLeft -= 1;
      const index = nextActions.findIndex((entry) => entry.id === pending.id);
      if (index >= 0) nextActions[index] = { ...nextActions[index], appliedPokemonId: addedId };
    }

    setActions(nextActions);
  };

  const pendingAddCount = actions.filter((entry) => entry.action.type === "add_pokemon" && !entry.appliedPokemonId).length;
  const canApplyAllAdds = pendingAddCount > 1 && team.length < 6;
  const visibleActions = loading ? streamingActions : actions;
  const starterPrompts = team.length
    ? BUILD_ASSIST_STARTERS
    : ["Build a team around a Pokémon", BUILD_ASSIST_VGC_STARTER, "What should my first pick be?"];

  return (
    <div className={`build-assist-root ${isPanelMode ? "panel-mode" : "launcher-mode"}${open ? " open" : ""}`} aria-live="polite">
      {!isPanelMode ? (
        <button
          className="build-assist-launcher"
          type="button"
          aria-expanded={open}
          aria-label={open ? "Close build assist" : "Open build assist"}
          onClick={() => setOpen((current) => !current)}
        >
          <Sparkles size={18} />
          <span>Build assist</span>
        </button>
      ) : null}

      {open ? (
        <section className="build-assist-panel" aria-label="Build assist chat">
          <header className="build-assist-head">
            <div>
              <span className="eyebrow">Build assist</span>
              <strong>Team notes</strong>
              <p>{selectedName ? `Focused on ${selectedName}` : team.length ? `${team.length}/6 on team` : "Add a Pokémon to start"}</p>
            </div>
            {!isPanelMode ? <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close build assist">
              <X size={16} />
            </button> : null}
          </header>

          <div className="build-assist-messages" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="build-assist-empty">
                <p>Quick suggestions from the current roster.</p>
                <div className="build-assist-starters">
                  {starterPrompts.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => void submitMessage(prompt)} disabled={loading}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => {
                  const isStreamingAssistant = loading
                    && index === messages.length - 1
                    && message.role === "assistant";

                  const content = message.content
                    || (isStreamingAssistant ? "Thinking…" : "");

                  if (message.role === "assistant" && !content) return null;

                  return (
                    <article
                      key={`${message.role}-${index}`}
                      className={`build-assist-message ${message.role}`}
                    >
                      <span>{message.role === "user" ? "You" : "Assist"}</span>
                      {content ? <p>{content}</p> : null}
                    </article>
                  );
                })}
                {visibleActions.map((pending) => (
                  <BuildAssistActionCard
                    key={pending.id}
                    pending={pending}
                    team={team}
                    selectedId={selectedId}
                    streaming={loading && pending.id.startsWith("stream-")}
                    onApply={() => applyAction(pending)}
                    onRemove={pending.appliedPokemonId ? () => {
                      onRemovePokemon?.(pending.appliedPokemonId!);
                      setActions((current) => current.filter((entry) => entry.id !== pending.id));
                    } : undefined}
                    onDismiss={() => setActions((current) => current.filter((entry) => entry.id !== pending.id))}
                  />
                ))}
                {canApplyAllAdds ? (
                  <div className="build-assist-apply-all">
                    <button type="button" onClick={applyAllAdds}>
                      Apply all {pendingAddCount} Pokémon
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {error ? <p className="build-assist-error" role="alert">{error}</p> : null}

          <form className="build-assist-compose" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={team.length ? "Ask how to round out this team…" : "Ask what core to start with…"}
              rows={2}
              disabled={loading}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitMessage(draft);
                }
              }}
            />
            <button type="submit" aria-label="Send build assist message" disabled={loading || !draft.trim()}>
              <ArrowUp size={16} />
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

type BuildAssistPendingAction = {
  id: string;
  action: BuildAssistAction;
  appliedPokemonId?: string;
};

function BuildAssistActionCard({ pending, team, selectedId, streaming = false, onApply, onRemove, onDismiss }: {
  pending: BuildAssistPendingAction;
  team: PokemonBuild[];
  selectedId: string | null;
  streaming?: boolean;
  onApply: () => void;
  onRemove?: () => void;
  onDismiss: () => void;
}) {
  const selectedBuild = team.find((pokemon) => pokemon.id === selectedId) ?? null;
  const selectedData = POKEMON.find((pokemon) => pokemon.name === selectedBuild?.species) ?? null;
  const action = pending.action;
  const setCardAction = action.type === "add_pokemon" || action.type === "update_set" ? action : null;
  const pokemon = setCardAction
    ? POKEMON.find((entry) => entry.name.toLowerCase() === setCardAction.pokemon.toLowerCase()) ?? null
    : null;
  const isApplied = Boolean(pending.appliedPokemonId);
  const disabledReason = actionDisabledReason(action, team, selectedData, Boolean(selectedBuild), isApplied);
  const isSetCard = Boolean(setCardAction);

  return (
    <article className={`build-assist-action-card${isApplied ? " applied" : ""}${streaming ? " streaming" : ""}`}>
      <div className={`build-assist-action-layout${isSetCard ? " add-pokemon" : ""}`}>
        {isSetCard && setCardAction ? (
          <>
            <div className="build-assist-action-art">
              {pokemon ? <img src={pokemon.sprite} alt="" /> : <Sparkles size={24} />}
              <div className="build-assist-action-title">
                <small>{isApplied ? "Applied to team" : streaming ? "Building set…" : "Suggested change"}</small>
                <strong>{actionLabel(action)}</strong>
              </div>
            </div>
            <div className="build-assist-action-body">
              <SetPreview action={setCardAction} />
            </div>
          </>
        ) : (
          <div className="build-assist-action-main">
            <Sparkles size={18} />
            <span>
              <small>{isApplied ? "Added to team" : "Suggested change"}</small>
              <strong>{actionLabel(action)}</strong>
            </span>
          </div>
        )}
      </div>
      {action.reason ? <p className="build-assist-action-reason">{action.reason}</p> : null}
      {disabledReason ? <p className="build-assist-action-note">{disabledReason}</p> : null}
      {action.type === "apply_spread" ? (
        <div className="build-assist-set-preview compact">
          <div className="build-assist-set-stats">
            {STAT_KEYS.map((stat) => (
              <span key={stat} className={(action.evs[stat] ?? 0) > 0 ? "invested" : ""}>
                <small>{stat}</small>
                <strong>{action.evs[stat] ?? 0}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {action.type === "set_moves" ? (
        <ul className="build-assist-set-moves">
          {action.moves.map((move) => <li key={move}>{move}</li>)}
        </ul>
      ) : null}
      <div className="build-assist-action-buttons">
        {!streaming ? (
          <>
            <button type="button" onClick={onDismiss}>Dismiss</button>
            {isApplied ? (
              <button className="danger-action" type="button" onClick={onRemove}>Remove</button>
            ) : (
              <button type="button" onClick={onApply} disabled={Boolean(disabledReason)}>Apply</button>
            )}
          </>
        ) : null}
      </div>
    </article>
  );
}

function SetPreview({ action }: {
  action: Extract<BuildAssistAction, { type: "add_pokemon" | "update_set" }>;
}) {
  const rawEvs = action.evs ?? {};
  const evs: Record<StatKey, number> = sanitizeActionSpread(rawEvs)
    ?? normalizeActionSpread(rawEvs)
    ?? { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 };
  const moves = action.moves?.filter(Boolean).slice(0, 4) ?? [];
  const adjustedSpread = spreadWasAdjusted(action.evs);

  return (
    <div className="build-assist-set-preview">
      <dl className="build-assist-set-meta">
        <div><dt>Ability</dt><dd>{action.ability || "—"}</dd></div>
        <div><dt>Item</dt><dd>{action.item || "—"}</dd></div>
        <div><dt>Nature</dt><dd>{action.nature || "—"}</dd></div>
      </dl>
      <div className="build-assist-set-moves-label">Moves</div>
      <ul className="build-assist-set-moves">
        {(moves.length ? moves : ["—", "—", "—", "—"]).slice(0, 4).map((move, index) => (
          <li key={`${move}-${index}`}>{move}</li>
        ))}
      </ul>
      <div className="build-assist-set-stats">
        {STAT_KEYS.map((stat) => (
          <span key={stat} className={(evs[stat] ?? 0) > 0 ? "invested" : ""}>
            <small>{stat}</small>
            <strong>{evs[stat] ?? 0}</strong>
          </span>
        ))}
      </div>
      {adjustedSpread ? <p className="build-assist-action-note">Spread adjusted to fit 32 per stat and 66 total.</p> : null}
    </div>
  );
}

function actionLabel(action: BuildAssistAction) {
  if (action.type === "add_pokemon") return `Add ${action.pokemon}`;
  if (action.type === "update_set") return `Apply set to ${action.pokemon}`;
  if (action.type === "apply_spread") return `Apply ${formatActionSpread(action.evs)}`;
  if (action.type === "set_item") return `Set item: ${action.item}`;
  if (action.type === "set_ability") return `Set ability: ${action.ability}`;
  if (action.type === "set_nature") return `Set nature: ${action.nature}`;
  return `Set moves: ${action.moves.join(", ")}`;
}

function actionDisabledReason(
  action: BuildAssistAction,
  team: PokemonBuild[],
  selectedData: typeof POKEMON[number] | null,
  hasSelected: boolean,
  isApplied = false,
) {
  if (isApplied) return "";
  if (action.type === "add_pokemon") {
    if (team.length >= 6) return "Team is already full.";
    const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === action.pokemon.toLowerCase());
    if (!pokemon) return "That Pokémon is not in this catalog.";
    if (action.evs && !sanitizeActionSpread(action.evs)) return "Spread could not be parsed.";
    return "";
  }
  if (action.type === "update_set") {
    const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === action.pokemon.toLowerCase());
    if (!pokemon) return "That Pokémon is not in this catalog.";
    const onTeam = team.some((entry) => entry.species.toLowerCase() === action.pokemon.toLowerCase());
    if (!onTeam) {
      if (team.length >= 6) return "Team is already full.";
      if (action.evs && !sanitizeActionSpread(action.evs)) return "Spread could not be parsed.";
      return "";
    }
    if (!hasSelected) return "Select a Pokémon first.";
    if (!selectedData || selectedData.name.toLowerCase() !== action.pokemon.toLowerCase()) {
      return `Select ${action.pokemon} first.`;
    }
    if (action.evs && !sanitizeActionSpread(action.evs)) return "Spread could not be parsed.";
    return "";
  }
  if (!hasSelected) return "Select a Pokémon first.";
  if (action.type === "set_ability" && selectedData && !selectedData.abilities.includes(action.ability)) return "Ability is not legal for the selected Pokémon.";
  if (action.type === "set_moves" && selectedData && !action.moves.some((move) => selectedData.moves.includes(move))) return "No suggested moves are legal for the selected Pokémon.";
  if (action.type === "apply_spread" && !sanitizeActionSpread(action.evs)) return "Spread could not be parsed.";
  return "";
}
