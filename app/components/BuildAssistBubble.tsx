"use client";

import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import {
  BUILD_ASSIST_STARTERS,
  BUILD_ASSIST_VGC_STARTER,
  type BuildAssistAction,
  type BuildAssistMessage,
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
  teamHasWeatherSetter,
} from "../../lib/build-assist";
import type { BuildAssistPendingAction, BuildAssistSessionControls, BuildAssistTurn } from "../../lib/build-assist-session";
import { CHAMPIONS_STAT_POINT_MAX, CHAMPIONS_STAT_POINT_TOTAL, formatMegaDisplayName, POKEMON, type PokemonBuild, type StatKey } from "../../lib/pokemon";

const STAT_KEYS: StatKey[] = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

function collectPriorSuggestedSpecies(turns: BuildAssistTurn[], beforeIndex = turns.length) {
  const species: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < beforeIndex; index += 1) {
    for (const pending of turns[index]?.actions ?? []) {
      const action = pending.action;
      if (action.type !== "add_pokemon" && action.type !== "update_set") continue;
      const key = action.pokemon.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      species.push(action.pokemon);
    }
  }
  return species;
}

function buildMergeOptions(team: PokemonBuild[], turns: BuildAssistTurn[], beforeIndex = turns.length) {
  const excluded = new Set(team.map((pokemon) => pokemon.species.toLowerCase()));
  for (const species of collectPriorSuggestedSpecies(turns, beforeIndex)) {
    excluded.add(species.toLowerCase());
  }
  const conversationText = turns.slice(0, beforeIndex).map((turn) => turn.content).filter(Boolean).join("\n");
  return {
    excludedSpecies: excluded,
    blockWeatherSetters: teamHasWeatherSetter(team),
    conversationText,
  };
}

export function BuildAssistBubble({
  team,
  selectedId,
  mode = "launcher",
  session,
  onAddPokemon,
  onRemovePokemon,
  onUpdateSelected,
}: {
  team: PokemonBuild[];
  selectedId: string | null;
  mode?: "launcher" | "panel";
  session: BuildAssistSessionControls;
  onAddPokemon?: (pokemonName: string, changes?: Partial<PokemonBuild>) => string | null;
  onRemovePokemon?: (pokemonId: string) => void;
  onUpdateSelected?: (changes: Partial<PokemonBuild>) => void;
}) {
  const isPanelMode = mode === "panel";
  const { turns, setTurns, open, setOpen, draft, setDraft, clearChat } = session;
  const [streamingActions, setStreamingActions] = useState<BuildAssistPendingAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamReplyRef = useRef("");

  const context = useMemo(
    () => buildAssistContext(team, selectedId, { priorSuggestedSpecies: collectPriorSuggestedSpecies(turns) }),
    [selectedId, team, turns],
  );
  const selectedName = context.pokemon.find((mon) => mon.selected)?.displayName ?? null;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [turns, loading, open, streamingActions]);

  const updateStreamingState = (rawReply: string, mergeBeforeIndex: number) => {
    const mergeOptions = buildMergeOptions(team, turns, mergeBeforeIndex);
    try {
      const streamed = parseBuildAssistStream(rawReply);
      const visibleActions = mergeBuildAssistActions(streamed.actions ?? [], streamed.reply, team, selectedId, mergeOptions);
      setStreamingActions(visibleActions.map((action, index) => ({ id: `stream-${index}`, action })));
      return streamed;
    } catch {
      const streamed = parseBuildAssistStream(rawReply);
      const fallbackActions = (streamed.actions ?? []).filter((action) => {
        if (action.type !== "add_pokemon" && action.type !== "update_set") return true;
        return Boolean(action.pokemon.trim());
      });
      setStreamingActions(fallbackActions.map((action, index) => ({ id: `stream-${index}`, action })));
      return streamed;
    }
  };

  const submitMessage = async (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || loading) return;

    const nextTurns: BuildAssistTurn[] = [...turns, { role: "user", content }, { role: "assistant", content: "" }];
    const assistantIndex = nextTurns.length - 1;
    const requestMessages: BuildAssistMessage[] = nextTurns.map(({ role, content: turnContent }) => ({
      role,
      content: turnContent,
    }));
    const requestContext = buildAssistContext(team, selectedId, {
      priorSuggestedSpecies: collectPriorSuggestedSpecies(turns),
    });

    setTurns(nextTurns);
    setDraft("");
    setError(null);
    setStreamingActions([]);
    streamReplyRef.current = "";
    setLoading(true);

    try {
      const { reply, actions: proposedActions = [] } = await streamBuildAssistMessage(requestMessages, requestContext, (delta) => {
        streamReplyRef.current += delta;
        const streamed = updateStreamingState(streamReplyRef.current, assistantIndex);
        const visibleReply = shouldHideAssistProse(streamed.reply, streamed.actions ?? [])
          ? ""
          : streamed.reply;
        setTurns((current) => current.map((turn, index) => (
          index === assistantIndex
            ? { ...turn, content: visibleReply }
            : turn
        )));
      });
      const mergeOptions = buildMergeOptions(team, nextTurns, assistantIndex);
      const visibleActions = mergeBuildAssistActions(proposedActions, reply, team, selectedId, mergeOptions);
      const visibleReply = shouldHideAssistProse(reply, visibleActions) ? "" : reply;
      setTurns((current) => current.map((turn, index) => (
        index === assistantIndex
          ? {
              ...turn,
              content: visibleReply,
              actions: visibleActions.map((action, actionIndex) => ({
                id: `${Date.now()}-${actionIndex}`,
                action,
              })),
            }
          : turn
      )));
      setStreamingActions([]);
    } catch (submitError) {
      setTurns((current) => current.slice(0, -1));
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

  const updateTurnActions = (
    turnIndex: number,
    updater: (actions: BuildAssistPendingAction[]) => BuildAssistPendingAction[],
  ) => {
    setTurns((current) => current.map((turn, index) => (
      index === turnIndex
        ? { ...turn, actions: updater(turn.actions ?? []) }
        : turn
    )));
  };

  const applyAction = (turnIndex: number, pending: BuildAssistPendingAction) => {
    const selectedBuild = team.find((pokemon) => pokemon.id === selectedId) ?? null;
    const selectedData = POKEMON.find((pokemon) => pokemon.name === selectedBuild?.species) ?? null;
    const action = pending.action;

    if (action.type === "add_pokemon") {
      const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === action.pokemon.toLowerCase());
      const addedId = pokemon ? onAddPokemon?.(pokemon.name, resolveAddPokemonChanges(action, pokemon)) ?? null : null;
      if (addedId) {
        updateTurnActions(turnIndex, (current) => current.map((entry) => (
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
          updateTurnActions(turnIndex, (current) => current.map((entry) => (
            entry.id === pending.id ? { ...entry, appliedPokemonId: addedId } : entry
          )));
        }
        updateTurnActions(turnIndex, (current) => current.filter((entry) => entry.id !== pending.id));
        return;
      }
      updateTurnActions(turnIndex, (current) => current.filter((entry) => entry.id !== pending.id));
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

    updateTurnActions(turnIndex, (current) => current.filter((entry) => entry.id !== pending.id));
  };

  const applyAllAdds = (turnIndex: number) => {
    const turnActions = turns[turnIndex]?.actions ?? [];
    const pendingAdds = turnActions.filter((entry) => entry.action.type === "add_pokemon" && !entry.appliedPokemonId);
    if (!pendingAdds.length) return;

    let slotsLeft = 6 - team.length;
    const nextActions = [...turnActions];

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

    updateTurnActions(turnIndex, () => nextActions);
  };

  const latestTurnIndex = turns.length - 1;
  const latestTurnActions = loading
    ? streamingActions
    : turns[latestTurnIndex]?.actions ?? [];
  const pendingAddCount = latestTurnActions.filter((entry) => entry.action.type === "add_pokemon" && !entry.appliedPokemonId).length;
  const canApplyAllAdds = !loading && pendingAddCount > 1 && team.length < 6;
  const starterPrompts = team.length
    ? BUILD_ASSIST_STARTERS
    : ["Build a sun team around Torkoal", BUILD_ASSIST_VGC_STARTER, "What should my first pick be?"];

  const handleClearChat = () => {
    if (loading) return;
    clearChat();
    setError(null);
    setStreamingActions([]);
  };

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
            <div className="build-assist-head-actions">
              {turns.length > 0 ? (
                <button
                  className="build-assist-clear"
                  type="button"
                  onClick={handleClearChat}
                  disabled={loading}
                  aria-label="Clear chat"
                >
                  Clear chat
                </button>
              ) : null}
              {!isPanelMode ? (
                <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close build assist">
                  <X size={16} />
                </button>
              ) : null}
            </div>
          </header>

          <div className="build-assist-messages" ref={scrollRef}>
            {turns.length === 0 ? (
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
                {turns.map((turn, turnIndex) => {
                  const isStreamingAssistant = loading
                    && turnIndex === turns.length - 1
                    && turn.role === "assistant";
                  const content = turn.content || (isStreamingAssistant ? "Thinking…" : "");
                  const turnActions = isStreamingAssistant
                    ? streamingActions
                    : turn.actions ?? [];

                  return (
                    <Fragment key={`turn-${turnIndex}`}>
                      {turn.role === "user" || content ? (
                        <article className={`build-assist-message ${turn.role}`}>
                          <span>{turn.role === "user" ? "You" : "Assist"}</span>
                          {content ? <p>{content}</p> : null}
                        </article>
                      ) : null}
                      {turnActions.map((pending) => (
                        <BuildAssistActionCard
                          key={pending.id}
                          pending={pending}
                          team={team}
                          selectedId={selectedId}
                          streaming={isStreamingAssistant && pending.id.startsWith("stream-")}
                          onApply={() => applyAction(turnIndex, pending)}
                          onRemove={pending.appliedPokemonId ? () => {
                            onRemovePokemon?.(pending.appliedPokemonId!);
                            updateTurnActions(turnIndex, (current) => current.filter((entry) => entry.id !== pending.id));
                          } : undefined}
                          onDismiss={() => updateTurnActions(turnIndex, (current) => current.filter((entry) => entry.id !== pending.id))}
                        />
                      ))}
                    </Fragment>
                  );
                })}
                {canApplyAllAdds ? (
                  <div className="build-assist-apply-all">
                    <button type="button" onClick={() => applyAllAdds(latestTurnIndex)}>
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
  const megaForm = setCardAction?.megaForm
    ? pokemon?.megaForms?.find((form) => form.name === setCardAction.megaForm) ?? null
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
              {pokemon ? <img src={megaForm?.artwork ?? pokemon.sprite} alt="" /> : <Sparkles size={24} />}
              <div className="build-assist-action-title">
                <small>{isApplied ? "Applied to team" : streaming ? "Building set…" : "Suggested change"}</small>
                <strong>{actionLabel(action, pokemon)}</strong>
              </div>
            </div>
            <div className="build-assist-action-body">
              <SetPreview action={setCardAction} pokemon={pokemon} />
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

function SetPreview({ action, pokemon }: {
  action: Extract<BuildAssistAction, { type: "add_pokemon" | "update_set" }>;
  pokemon: typeof POKEMON[number] | null;
}) {
  const rawEvs = action.evs ?? {};
  const evs: Record<StatKey, number> = sanitizeActionSpread(rawEvs)
    ?? normalizeActionSpread(rawEvs)
    ?? { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 };
  const moves = action.moves?.filter(Boolean).slice(0, 4) ?? [];
  const adjustedSpread = spreadWasAdjusted(action.evs);
  const megaForm = action.megaForm
    ? pokemon?.megaForms?.find((form) => form.name === action.megaForm) ?? null
    : null;
  const displayAbility = megaForm?.ability ?? action.ability;

  return (
    <div className="build-assist-set-preview">
      <dl className="build-assist-set-meta">
        <div><dt>Ability</dt><dd>{displayAbility || "—"}{megaForm ? " (Mega)" : ""}</dd></div>
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

function actionLabel(action: BuildAssistAction, pokemon: typeof POKEMON[number] | null = null) {
  if (action.type === "add_pokemon") {
    const megaForm = action.megaForm
      ? pokemon?.megaForms?.find((form) => form.name === action.megaForm)
      : null;
    const label = megaForm
      ? formatMegaDisplayName(pokemon?.name ?? action.pokemon, megaForm.name)
      : action.pokemon;
    return `Add ${label}`;
  }
  if (action.type === "update_set") {
    const megaForm = action.megaForm
      ? pokemon?.megaForms?.find((form) => form.name === action.megaForm)
      : null;
    const label = megaForm
      ? formatMegaDisplayName(pokemon?.name ?? action.pokemon, megaForm.name)
      : action.pokemon;
    return `Apply set to ${label}`;
  }
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
