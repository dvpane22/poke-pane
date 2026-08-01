import type { PokemonBuild } from "./pokemon";

export type BattleAssistMessage = {
  role: "user" | "assistant";
  content: string;
};

export type BattleOpponent = {
  speciesId: string | null;
  name: string | null;
  confidence?: number;
  source: "detected" | "manual" | "unknown";
};

export type BattleAssistRequest = {
  messages: BattleAssistMessage[];
  playerTeam: PokemonBuild[];
  opponents: BattleOpponent[];
};

export function buildBattleAssistPrompt(playerTeam: PokemonBuild[], opponents: BattleOpponent[]) {
  const playerSummary = playerTeam.length
    ? playerTeam.map((pokemon) => {
      const moves = pokemon.moves.filter(Boolean).join(", ") || "moves unknown";
      return `${pokemon.species}${pokemon.item ? ` @ ${pokemon.item}` : ""} (${pokemon.ability || "ability unknown"}; ${moves})`;
    }).join("\n")
    : "No player team was supplied.";

  const opponentSummary = opponents.map((opponent, index) => {
    if (!opponent.name) return `Slot ${index + 1}: not identified`;
    const certainty = opponent.source === "detected" && opponent.confidence !== undefined
      ? ` (camera suggestion, ${Math.round(opponent.confidence * 100)}% confidence)`
      : opponent.source === "manual" ? " (confirmed manually)" : "";
    return `Slot ${index + 1}: ${opponent.name}${certainty}`;
  }).join("\n");

  return `You are Battle Assist for Pokémon Champions Regulation MB doubles. Help with team preview: leads, matchup plans, likely threats, and questions about the teams shown. Be concise and tactical.

Known player team:
${playerSummary}

Opponent team preview:
${opponentSummary}

The opponent list may be an imperfect camera prediction. Treat unconfirmed entries as tentative. Do not claim to see the live battle, know unrevealed moves/items/abilities, or calculate exact damage from this v1 view. Explain uncertainty and suggest what to watch for when it matters.`;
}
