import { CHAMPIONS_STAT_POINT_MAX, CHAMPIONS_STAT_POINT_TOTAL, formatMegaDisplayName, POKEMON, PokemonBuild, PokemonData, StatKey } from "./pokemon";

export type BuildAssistChatRole = "user" | "assistant";

export type BuildAssistMessage = {
  role: BuildAssistChatRole;
  content: string;
};

export type BuildAssistPokemonSnapshot = {
  species: string;
  displayName: string;
  types: string[];
  item: string;
  ability: string;
  nature: string;
  moves: string[];
  evs: Record<StatKey, number>;
  selected: boolean;
};

export type BuildAssistContext = {
  format: string;
  teamSize: number;
  maxTeamSize: number;
  selectedDisplayName: string | null;
  pokemon: BuildAssistPokemonSnapshot[];
};

export type BuildAssistRequest = {
  messages: BuildAssistMessage[];
  context: BuildAssistContext;
};

export type BuildAssistResponse = {
  reply: string;
  actions?: BuildAssistAction[];
};

export type BuildAssistAction =
  | {
    type: "add_pokemon";
    pokemon: string;
    reason?: string;
    item?: string;
    ability?: string;
    nature?: string;
    moves?: string[];
    evs?: Partial<Record<StatKey, number>>;
  }
  | { type: "apply_spread"; evs: Partial<Record<StatKey, number>>; reason?: string }
  | { type: "set_item"; item: string; reason?: string }
  | { type: "set_ability"; ability: string; reason?: string }
  | { type: "set_nature"; nature: string; reason?: string }
  | { type: "set_moves"; moves: string[]; reason?: string };

function formatMegaFormName(species: string, formName: string) {
  return formatMegaDisplayName(species, formName);
}

export function buildAssistContext(team: PokemonBuild[], selectedId: string | null): BuildAssistContext {
  const pokemon = team.map((build) => {
    const data = POKEMON.find((entry) => entry.name === build.species);
    const megaForm = data?.megaForms?.find((form) => form.name === build.megaForm);
    const displayName = megaForm ? formatMegaFormName(build.species, megaForm.name) : build.species;
    return {
      species: build.species,
      displayName,
      types: megaForm?.types ?? data?.types ?? [],
      item: build.item || "None",
      ability: build.ability || "None",
      nature: build.nature || "Hardy",
      moves: build.moves.filter(Boolean),
      evs: build.evs,
      selected: build.id === selectedId,
    };
  });

  return {
    format: "Pokémon Champions · Regulation MB · Level 50 · 32 Stat Points max per stat · 66 total per Pokémon · Doubles",
    teamSize: team.length,
    maxTeamSize: 6,
    selectedDisplayName: pokemon.find((entry) => entry.selected)?.displayName ?? null,
    pokemon,
  };
}

const CATALOG_DETAIL_LIMIT = 8;
const CATALOG_MOVE_LIMIT = 52;
const CATALOG_ITEM_LIMIT = 24;

const BUILDER_ITEM_PRIORITY = [
  "Focus Sash", "Life Orb", "Leftovers", "Sitrus Berry", "Lum Berry", "Mental Herb", "White Herb",
  "Choice Scarf", "Choice Band", "Choice Specs", "Assault Vest", "Rocky Helmet", "Safety Goggles",
  "Covert Cloak", "Clear Amulet", "Eviolite", "Light Clay", "Damp Rock", "Heat Rock", "Smooth Rock",
  "Icy Rock", "Muscle Band", "Wise Glasses", "Expert Belt", "Black Glasses", "Charcoal", "Mystic Water",
  "Fairy Feather", "Dragon Fang", "Soft Sand", "Magnet", "Spell Tag", "Poison Barb", "Sharp Beak",
  "Twisted Spoon", "Silk Scarf", "Wide Lens", "Scope Lens", "Quick Claw", "Shell Bell", "Big Root",
];

const DOUBLES_MOVE_PRIORITY = [
  "Protect", "Detect", "Tailwind", "Trick Room", "Follow Me", "Rage Powder", "Ally Switch",
  "Helping Hand", "Fake Out", "Wide Guard", "Quick Guard", "Taunt", "Encore", "Imprison", "Spore",
  "Will-O-Wisp", "Thunder Wave", "Pollen Puff", "Coaching", "Parting Shot", "U-turn", "Volt Switch",
  "Flip Turn", "Ice Shard", "Aqua Jet", "Sucker Punch", "Grassy Glide", "Extreme Speed", "Shadow Sneak",
  "Moonblast", "Heat Wave", "Eruption", "Dazzling Gleam", "Earthquake", "Rock Slide", "Draco Meteor",
  "Shadow Ball", "Thunderbolt", "Ice Beam", "Flamethrower", "Hydro Pump", "Close Combat", "Knock Off",
  "Fake Tears", "Sunny Day", "Rain Dance", "Hurricane", "Hyper Voice", "Expanding Force", "Armor Cannon",
  "Last Respects", "Wave Crash", "Phantom Force", "Dragon Darts", "Electro Shot", "Bleakwind Storm",
];

function isMegaStoneItem(item: string) {
  return /(?:ite|inite)$/i.test(item) && item !== "Eviolite";
}

function filterBuilderItems(items: string[]) {
  const legal = items.filter((item) => !isMegaStoneItem(item));
  const prioritized = BUILDER_ITEM_PRIORITY.filter((item) => legal.includes(item));
  const rest = legal.filter((item) => !prioritized.includes(item)).sort((left, right) => left.localeCompare(right));
  return [...prioritized, ...rest].slice(0, CATALOG_ITEM_LIMIT);
}

function selectBuilderMoves(moves: string[]) {
  if (moves.length <= CATALOG_MOVE_LIMIT) return moves;
  const prioritized = DOUBLES_MOVE_PRIORITY.filter((move) => moves.includes(move));
  const rest = moves.filter((move) => !prioritized.includes(move)).sort((left, right) => left.localeCompare(right));
  return [...prioritized, ...rest].slice(0, CATALOG_MOVE_LIMIT);
}

function formatBaseStats(stats: PokemonData["stats"]) {
  return (["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as StatKey[])
    .map((stat) => `${stat} ${stats[stat]}`)
    .join(", ");
}

export function findPokemonNamesInText(text: string, excludeSpecies: Set<string> = new Set()) {
  const mentions: Array<{ name: string; index: number }> = [];
  for (const pokemon of POKEMON) {
    if (excludeSpecies.has(pokemon.name.toLowerCase())) continue;
    const regex = new RegExp(`\\b${escapeRegExp(pokemon.name)}\\b`, "gi");
    let match: RegExpExecArray | null = regex.exec(text);
    if (match) mentions.push({ name: pokemon.name, index: match.index });
  }
  return mentions
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.name)
    .filter((name, index, list) => list.indexOf(name) === index);
}

export function selectCatalogDetailNames(context: BuildAssistContext, messages: BuildAssistMessage[]) {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name) || ordered.length >= CATALOG_DETAIL_LIMIT) return;
    if (!POKEMON.some((pokemon) => pokemon.name === name)) return;
    seen.add(name);
    ordered.push(name);
  };

  for (const mon of context.pokemon) add(mon.species);

  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    for (const name of findPokemonNamesInText(message.content)) add(name);
  }

  const conversationText = messages.slice(-8).map((message) => message.content).join("\n");
  for (const name of findPokemonNamesInText(conversationText)) add(name);

  return ordered;
}

function formatPokemonCatalogEntry(data: PokemonData) {
  const items = filterBuilderItems(data.items);
  const moves = selectBuilderMoves(data.moves);
  const legalItemCount = data.items.filter((item) => !isMegaStoneItem(item)).length;
  const omittedItems = Math.max(0, legalItemCount - items.length);
  const omittedMoves = Math.max(0, data.moves.length - moves.length);

  return [
    `${data.name} · ${data.types.join("/")} · ${data.role}`,
    `Base stats: ${formatBaseStats(data.stats)}`,
    `Abilities: ${data.abilities.join(", ")}`,
    `Legal items: ${items.join(", ")}${omittedItems > 0 ? ` (+${omittedItems} more held items)` : ""}`,
    `Legal moves: ${moves.join(", ")}${omittedMoves > 0 ? ` (+${omittedMoves} more moves)` : ""}`,
  ].join("\n");
}

function formatRegulationMBCatalogIndex() {
  return POKEMON.map((pokemon) => pokemon.name).sort((left, right) => left.localeCompare(right)).join(", ");
}

export function buildBuildAssistSystemPrompt(context: BuildAssistContext, messages: BuildAssistMessage[] = []) {
  const teamBlock = context.pokemon.length
    ? context.pokemon.map((mon) => {
      const evSummary = (["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as StatKey[])
        .filter((stat) => mon.evs[stat] > 0)
        .map((stat) => `${mon.evs[stat]} ${stat}`)
        .join(", ") || "uninvested";
      const moves = mon.moves.length ? mon.moves.join(", ") : "no moves set";
      return [
        `- ${mon.displayName}${mon.selected ? " (selected in builder)" : ""}`,
        `  Types: ${mon.types.join("/") || "unknown"}`,
        `  ${mon.nature} · ${mon.item} · ${mon.ability}`,
        `  Stat points: ${evSummary}`,
        `  Moves: ${moves}`,
      ].join("\n");
    }).join("\n")
    : "No Pokémon on the team yet.";

  const detailNames = selectCatalogDetailNames(context, messages);
  const catalogDetailBlock = detailNames
    .map((name) => POKEMON.find((pokemon) => pokemon.name === name))
    .filter((pokemon): pokemon is PokemonData => Boolean(pokemon))
    .map((pokemon) => formatPokemonCatalogEntry(pokemon))
    .join("\n\n");

  return [
    "You are Pane Build Assist for Pokémon Champions Regulation MB doubles team building.",
    "Help the user round out a legal 6-Pokémon team: partner suggestions, role balance, type coverage, speed tiers, item/ability ideas, and spread direction.",
    "Default to compact builder notes, not long articles.",
    "Keep most answers to 2-4 short bullets or one short paragraph.",
    "Recommend one clear next step first. Add more options only if the user asks for a list.",
    "Avoid markdown headings, tables, bold labels, and long templates unless the user explicitly asks.",
    "Mention only the key tradeoff when relevant.",
    "Assume level 50 with 32 Stat Points max per stat and 66 total per Pokémon.",
    "Only suggest Pokémon from the Regulation MB roster below. Never invent Pokémon, moves, abilities, or items.",
    "When you recommend a move, ability, or item, use the exact catalog name from the detailed entries.",
    "If a suggested option is not in that Pokémon's legal list, do not recommend it.",
    "When the team is incomplete, prioritize what to add next and why.",
    "When a Pokémon is selected, weight advice toward building around or supporting that mon.",
    "Do not claim exact damage calcs unless the app ran them — suggest what to verify in Pane Coach instead.",
    "When your answer includes a concrete change the app could apply, append one hidden action block at the very end.",
    "If you suggest adding a specific Pokémon, always include an add_pokemon action for that Pokémon with ability, item, nature, moves, and evs when you mention them.",
    "If you suggest multiple new Pokémon in one answer, include one add_pokemon action per Pokémon in the same PANE_ACTIONS block.",
    "Visible prose and hidden add_pokemon payloads must match — do not describe spreads in text without putting them in the action.",
    "If the user asks you to add or apply something, do not claim it is done. Provide the action for approval.",
    "The hidden block format is exactly: [[PANE_ACTIONS:{\"actions\":[...]}]]",
    "Never print raw JSON in the visible reply. Raw JSON belongs only inside the hidden PANE_ACTIONS block.",
    "Allowed action types: add_pokemon with pokemon and optional item, ability, nature, moves, evs; apply_spread with evs; set_item with item; set_ability with ability; set_nature with nature; set_moves with moves.",
    "When suggesting a partner, include a starter set in the add_pokemon action whenever possible: ability, item, nature, moves, and evs.",
    "Hidden multi-add example: [[PANE_ACTIONS:{\"actions\":[{\"type\":\"add_pokemon\",\"pokemon\":\"Whimsicott\",\"ability\":\"Prankster\",\"item\":\"Focus Sash\",\"nature\":\"Timid\",\"moves\":[\"Tailwind\",\"Encore\",\"Moonblast\",\"Protect\"],\"evs\":{\"HP\":32,\"Def\":32,\"SpD\":2},\"reason\":\"Tailwind setter.\"},{\"type\":\"add_pokemon\",\"pokemon\":\"Dragapult\",\"ability\":\"Clear Body\",\"item\":\"Life Orb\",\"nature\":\"Hasty\",\"moves\":[\"Phantom Force\",\"Draco Meteor\",\"Protect\",\"Tailwind\"],\"evs\":{\"Atk\":32,\"SpA\":32,\"Spe\":2},\"reason\":\"Fast attacker that can reuse Tailwind.\"}]}]]",
    "Hidden add example: [[PANE_ACTIONS:{\"actions\":[{\"type\":\"add_pokemon\",\"pokemon\":\"Torkoal\",\"ability\":\"Drought\",\"item\":\"Charcoal\",\"nature\":\"Quiet\",\"moves\":[\"Eruption\",\"Heat Wave\",\"Protect\",\"Solar Beam\"],\"evs\":{\"HP\":32,\"SpA\":32,\"Def\":2},\"reason\":\"Sun plus Trick Room support.\"}]}]]",
    "Hidden spread example: [[PANE_ACTIONS:{\"actions\":[{\"type\":\"apply_spread\",\"evs\":{\"HP\":32,\"SpA\":32,\"Def\":2},\"reason\":\"Keeps offense while adding bulk.\"}]}]]",
    "Hidden moves example: [[PANE_ACTIONS:{\"actions\":[{\"type\":\"set_moves\",\"moves\":[\"Protect\",\"Armor Cannon\",\"Expanding Force\",\"Trick Room\"]}]}]]",
    "Only include actions you would be comfortable asking the user to approve. Keep visible prose natural and do not mention the hidden block.",
    "",
    `Format: ${context.format}`,
    `Team: ${context.teamSize}/${context.maxTeamSize}`,
    context.selectedDisplayName ? `Selected: ${context.selectedDisplayName}` : "Selected: none",
    "",
    "Regulation MB legal Pokémon roster (exact names only):",
    formatRegulationMBCatalogIndex(),
    "",
    catalogDetailBlock
      ? "Detailed Regulation MB catalog for the current team and mentioned Pokémon. Use only these legal options:"
      : "Detailed Regulation MB catalog: add a Pokémon to the team or mention one in chat to load legal options.",
    catalogDetailBlock || "(none loaded yet)",
    "",
    "Current team:",
    teamBlock,
  ].join("\n");
}

export function parseBuildAssistReply(rawReply: string): BuildAssistResponse {
  const actions: BuildAssistAction[] = [];
  let reply = rawReply;
  const marker = "[[PANE_ACTIONS:";

  while (reply.includes(marker)) {
    const start = reply.indexOf(marker);
    const payloadStart = start + marker.length;
    const end = reply.indexOf("]]", payloadStart);
    if (end < 0) {
      reply = reply.slice(0, start);
      break;
    }

    const rawJson = reply.slice(payloadStart, end);
    try {
      const parsed = JSON.parse(rawJson) as { actions?: unknown };
      if (Array.isArray(parsed.actions)) {
        for (const action of parsed.actions) {
          const normalized = normalizeBuildAssistAction(action);
          if (normalized) actions.push(normalized);
        }
      }
    } catch {
      // Ignore malformed action payloads and keep the visible answer usable.
    }
    reply = `${reply.slice(0, start)}${reply.slice(end + 2)}`;
  }

  const loose = extractLooseActionObjects(reply);
  if (loose.actions.length) {
    actions.push(...loose.actions);
    reply = loose.reply;
  }

  // Final guard: never show a malformed action block to the user.
  reply = reply.replace(/\s*\[\[PANE_ACTIONS:[\s\S]*$/g, "").trim();

  return { reply, actions };
}

function extractLooseActionObjects(rawReply: string): { reply: string; actions: BuildAssistAction[] } {
  const actions: BuildAssistAction[] = [];
  let reply = rawReply;
  const removals: Array<[number, number]> = [];

  for (let index = 0; index < rawReply.length; index += 1) {
    if (rawReply[index] !== "{") continue;
    const end = findJsonObjectEnd(rawReply, index);
    if (end < 0) continue;

    const candidateText = rawReply.slice(index, end + 1);
    try {
      const parsed = JSON.parse(candidateText) as { actions?: unknown };
      if (Array.isArray(parsed.actions)) {
        const parsedActions = parsed.actions
          .map((action) => normalizeBuildAssistAction(action))
          .filter((action): action is BuildAssistAction => Boolean(action));
        if (parsedActions.length) {
          actions.push(...parsedActions);
          removals.push([index, end + 1]);
        }
      } else {
        const action = normalizeBuildAssistAction(parsed);
        if (action) {
          actions.push(action);
          removals.push([index, end + 1]);
        }
      }
    } catch {
      // Not a JSON action object; leave the visible text alone.
    }
    index = end;
  }

  for (const [start, end] of [...removals].reverse()) {
    reply = `${reply.slice(0, start)}${reply.slice(end)}`;
  }

  return {
    reply: reply
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    actions,
  };
}

function findJsonObjectEnd(source: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function normalizeBuildAssistAction(action: unknown): BuildAssistAction | null {
  if (!action || typeof action !== "object") return null;
  const candidate = action as Record<string, unknown>;
  const reason = typeof candidate.reason === "string" ? candidate.reason : undefined;

  if (candidate.type === "add_pokemon" && typeof candidate.pokemon === "string") {
    return {
      type: "add_pokemon",
      pokemon: candidate.pokemon,
      reason,
      item: typeof candidate.item === "string" ? candidate.item : undefined,
      ability: typeof candidate.ability === "string" ? candidate.ability : undefined,
      nature: typeof candidate.nature === "string" ? candidate.nature : undefined,
      moves: Array.isArray(candidate.moves)
        ? candidate.moves.filter((move): move is string => typeof move === "string").slice(0, 4)
        : undefined,
      evs: readActionEvs(candidate.evs),
    };
  }
  if (candidate.type === "apply_spread" && candidate.evs && typeof candidate.evs === "object") {
    const evs = readActionEvs(candidate.evs) ?? {};
    return Object.keys(evs).length ? { type: "apply_spread", evs, reason } : null;
  }
  if (candidate.type === "set_item" && typeof candidate.item === "string") {
    return { type: "set_item", item: candidate.item, reason };
  }
  if (candidate.type === "set_ability" && typeof candidate.ability === "string") {
    return { type: "set_ability", ability: candidate.ability, reason };
  }
  if (candidate.type === "set_nature" && typeof candidate.nature === "string") {
    return { type: "set_nature", nature: candidate.nature, reason };
  }
  if (candidate.type === "set_moves" && Array.isArray(candidate.moves)) {
    const moves = candidate.moves.filter((move): move is string => typeof move === "string").slice(0, 4);
    return moves.length ? { type: "set_moves", moves, reason } : null;
  }

  return null;
}

const STAT_KEYS: StatKey[] = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

const STAT_ALIASES: Record<string, StatKey> = {
  HP: "HP",
  hp: "HP",
  Atk: "Atk",
  atk: "Atk",
  Attack: "Atk",
  attack: "Atk",
  Def: "Def",
  def: "Def",
  Defense: "Def",
  defense: "Def",
  SpA: "SpA",
  spa: "SpA",
  "Sp. Atk": "SpA",
  "Sp Atk": "SpA",
  "Special Attack": "SpA",
  SpD: "SpD",
  spd: "SpD",
  "Sp. Def": "SpD",
  "Sp Def": "SpD",
  "Special Defense": "SpD",
  Spe: "Spe",
  spe: "Spe",
  Speed: "Spe",
  speed: "Spe",
};

const ALL_NATURES = [
  "Hardy", "Lonely", "Adamant", "Naughty", "Brave",
  "Bold", "Docile", "Impish", "Lax", "Relaxed",
  "Modest", "Mild", "Bashful", "Rash", "Quiet",
  "Calm", "Gentle", "Careful", "Quirky", "Sassy",
  "Timid", "Hasty", "Jolly", "Naive", "Serious",
];

function readActionEvs(rawEvs: unknown): Partial<Record<StatKey, number>> | undefined {
  if (!rawEvs || typeof rawEvs !== "object") return undefined;
  const evs: Partial<Record<StatKey, number>> = {};
  for (const [key, value] of Object.entries(rawEvs as Record<string, unknown>)) {
    const stat = STAT_ALIASES[key] ?? (STAT_KEYS.includes(key as StatKey) ? key as StatKey : undefined);
    if (stat && typeof value === "number" && Number.isFinite(value)) evs[stat] = value;
  }
  return Object.keys(evs).length ? evs : undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readLabeledValue(section: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|[\\n*])\\s*(?:[-•]\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*[:\\-–]\\s*(.+)$`, "im");
    const match = section.match(pattern);
    if (match?.[1]) return match[1].replace(/\*\*/g, "").trim();
  }
  return undefined;
}

function normalizeStatToken(raw: string): StatKey | null {
  const compact = raw.replace(/\s|\./g, "");
  if (compact.toLowerCase() === "hp") return "HP";
  if (compact.toLowerCase() === "atk" || compact.toLowerCase() === "attack") return "Atk";
  if (compact.toLowerCase() === "def" || compact.toLowerCase() === "defense") return "Def";
  if (compact.toLowerCase() === "spa" || compact.toLowerCase() === "spatk") return "SpA";
  if (compact.toLowerCase() === "spd" || compact.toLowerCase() === "spdef") return "SpD";
  if (compact.toLowerCase() === "spe" || compact.toLowerCase() === "speed") return "Spe";
  return STAT_ALIASES[raw] ?? null;
}

function parseEvsFromText(text: string): Partial<Record<StatKey, number>> | undefined {
  const evs: Partial<Record<StatKey, number>> = {};
  const labeled = readLabeledValue(text, ["EVs", "Stat Points", "Stats", "Spread"]);
  const source = labeled ?? text;

  for (const match of source.matchAll(/\b(\d{1,2})\s*(HP|Atk|Def|SpA|SpD|Spe|Sp\.?\s*A|Sp\.?\s*D|Speed|Attack|Defense)\b/gi)) {
    const stat = normalizeStatToken(match[2]);
    if (stat) evs[stat] = Number(match[1]);
  }
  for (const match of source.matchAll(/\b(HP|Atk|Def|SpA|SpD|Spe)\s*[:=]?\s*(\d{1,2})\b/gi)) {
    const stat = normalizeStatToken(match[1]);
    if (stat) evs[stat] = Number(match[2]);
  }

  return Object.keys(evs).length ? evs : undefined;
}

function scorePokemonSection(section: string) {
  let score = 0;
  if (readLabeledValue(section, ["Ability"])) score += 2;
  if (readLabeledValue(section, ["Item", "Held item"])) score += 2;
  if (readLabeledValue(section, ["Nature"])) score += 1;
  const moves = parseMovesFromText(section);
  if (moves?.length) score += 2 + moves.length;
  const evs = parseEvsFromText(section);
  if (evs) score += 2 + Object.values(evs).filter((value) => value > 0).length;
  return score;
}

function bestSectionForPokemon(reply: string, pokemonName: string, allMentionNames: string[]) {
  const regex = new RegExp(`\\b${escapeRegExp(pokemonName)}\\b`, "gi");
  const sections: string[] = [];
  let match: RegExpExecArray | null = regex.exec(reply);
  while (match) {
    const start = match.index;
    let end = reply.length;
    for (const other of allMentionNames) {
      if (other.toLowerCase() === pokemonName.toLowerCase()) continue;
      const otherIndex = reply.slice(start + 1).search(new RegExp(`\\b${escapeRegExp(other)}\\b`, "i"));
      if (otherIndex >= 0) end = Math.min(end, start + 1 + otherIndex);
    }
    sections.push(reply.slice(start, end));
    match = regex.exec(reply);
  }
  if (!sections.length) return "";
  return sections.sort((left, right) => scorePokemonSection(right) - scorePokemonSection(left))[0];
}

function mergeAddPokemonFields(
  explicit: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  parsed: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  sectionScore: number,
): Extract<BuildAssistAction, { type: "add_pokemon" }> {
  const preferParsed = sectionScore >= 4;
  const pick = <T,>(parsedValue: T | undefined, explicitValue: T | undefined) => (
    preferParsed ? parsedValue ?? explicitValue : explicitValue ?? parsedValue
  );
  const explicitMoveCount = explicit.moves?.filter(Boolean).length ?? 0;
  const parsedMoveCount = parsed.moves?.filter(Boolean).length ?? 0;
  const moves = parsedMoveCount >= explicitMoveCount ? parsed.moves : explicit.moves ?? parsed.moves;

  return {
    type: "add_pokemon",
    pokemon: explicit.pokemon,
    reason: explicit.reason ?? parsed.reason,
    ability: pick(parsed.ability, explicit.ability),
    item: pick(parsed.item, explicit.item),
    nature: pick(parsed.nature, explicit.nature),
    moves,
    evs: preferParsed ? parsed.evs ?? explicit.evs : explicit.evs ?? parsed.evs,
  };
}

function resolveAddPokemonAction(
  pokemonName: string,
  reply: string,
  allMentionNames: string[],
  explicit?: Extract<BuildAssistAction, { type: "add_pokemon" }>,
): Extract<BuildAssistAction, { type: "add_pokemon" }> | null {
  const section = bestSectionForPokemon(reply, pokemonName, allMentionNames);
  const sectionScore = scorePokemonSection(section);
  const parsed = parseAddPokemonFromSection(pokemonName, section, explicit?.reason);
  if (!parsed && !explicit) return null;
  if (!parsed) return explicit ?? null;
  if (!explicit) return parsed;
  return mergeAddPokemonFields(explicit, parsed, sectionScore);
}

function matchCatalogMove(move: string, options: string[]) {
  const normalized = move.toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized)
    ?? options.find((option) => normalized.includes(option.toLowerCase()));
}

function parseMovesFromText(text: string, pokemon?: typeof POKEMON[number]): string[] | undefined {
  const raw = readLabeledValue(text, ["Moves", "Move set", "Moveset"]);
  const inlineMoves = raw
    ? raw.split(/[,/|•·]+/).map((move) => move.trim()).filter(Boolean)
    : [];

  const bulletBlock = text.match(/(?:Moves|Move set|Moveset)\s*:?\s*((?:\n\s*[-•].+)+)/i);
  const bulletMoves = bulletBlock?.[1]
    ?.split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean) ?? [];

  const moves = [...inlineMoves, ...bulletMoves].slice(0, 4);
  if (!moves.length) return undefined;
  if (!pokemon) return moves;
  return moves.map((move) => matchCatalogMove(move, pokemon.moves) ?? move);
}

function parseNatureFromText(text: string): string | undefined {
  const labeled = readLabeledValue(text, ["Nature"]);
  if (labeled) {
    const exact = ALL_NATURES.find((nature) => nature.toLowerCase() === labeled.toLowerCase());
    if (exact) return exact;
  }
  for (const nature of ALL_NATURES) {
    if (new RegExp(`\\b${escapeRegExp(nature)}\\b`, "i").test(text)) return nature;
  }
  return undefined;
}

function matchCatalogOption(value: string | undefined, options: string[]) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized)
    ?? options.find((option) => normalized.includes(option.toLowerCase()));
}

function parseAddPokemonFromSection(
  pokemonName: string,
  section: string,
  reason?: string,
): Extract<BuildAssistAction, { type: "add_pokemon" }> | null {
  const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === pokemonName.toLowerCase());
  if (!pokemon) return null;

  const abilityRaw = readLabeledValue(section, ["Ability"]);
  const itemRaw = readLabeledValue(section, ["Item", "Held item"]);
  const nature = parseNatureFromText(section);
  const moves = parseMovesFromText(section, pokemon);
  const evs = parseEvsFromText(section);

  return {
    type: "add_pokemon",
    pokemon: pokemon.name,
    reason,
    ability: matchCatalogOption(abilityRaw, pokemon.abilities) ?? abilityRaw,
    item: matchCatalogOption(itemRaw, pokemon.items) ?? itemRaw,
    nature,
    moves,
    evs,
  };
}

function findPokemonMentionsInReply(reply: string, teamSpecies: Set<string>) {
  return findPokemonNamesInText(reply, teamSpecies).map((name, index) => ({ name, index }));
}

export function parseAddPokemonActionsFromReply(reply: string, team: PokemonBuild[]) {
  const teamSpecies = new Set(team.map((pokemon) => pokemon.species.toLowerCase()));
  const mentions = findPokemonMentionsInReply(reply, teamSpecies).map((entry) => entry.name);
  return mentions.map((name) => resolveAddPokemonAction(name, reply, mentions)).filter(
    (action): action is Extract<BuildAssistAction, { type: "add_pokemon" }> => Boolean(action),
  );
}

export function mergeBuildAssistActions(actions: BuildAssistAction[], reply: string, team: PokemonBuild[]) {
  const teamSpecies = new Set(team.map((pokemon) => pokemon.species.toLowerCase()));
  const mentions = findPokemonMentionsInReply(reply, teamSpecies).map((entry) => entry.name);
  const nonAddActions = actions.filter((action) => action.type !== "add_pokemon");
  const explicitAdds = actions.filter((action): action is Extract<BuildAssistAction, { type: "add_pokemon" }> => action.type === "add_pokemon");

  const enrichedAdds = explicitAdds.map((action) => (
    resolveAddPokemonAction(action.pokemon, reply, mentions, action) ?? action
  ));
  const covered = new Set(enrichedAdds.map((action) => action.pokemon.toLowerCase()));

  const inferredAdds = parseAddPokemonActionsFromReply(reply, team).filter(
    (action) => !covered.has(action.pokemon.toLowerCase()),
  );
  return [...nonAddActions, ...enrichedAdds, ...inferredAdds];
}

export function normalizeActionSpread(rawEvs: Partial<Record<StatKey, number>>) {
  const evs = { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 } satisfies Record<StatKey, number>;
  for (const stat of STAT_KEYS) {
    const value = rawEvs[stat] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > CHAMPIONS_STAT_POINT_MAX) return null;
    evs[stat] = Math.round(value);
  }
  const total = Object.values(evs).reduce((sum, value) => sum + value, 0);
  return total <= CHAMPIONS_STAT_POINT_TOTAL ? evs : null;
}

export function resolveAddPokemonChanges(
  action: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  pokemon: typeof POKEMON[number],
): Partial<PokemonBuild> {
  const suggestedMoves = action.moves?.filter(Boolean).slice(0, 4)
    .map((move) => matchCatalogMove(move, pokemon.moves))
    .filter((move): move is string => Boolean(move)) ?? [];
  const ability = action.ability && pokemon.abilities.includes(action.ability) ? action.ability : undefined;
  const item = action.item && pokemon.items.includes(action.item) ? action.item : undefined;
  const nature = action.nature && ALL_NATURES.includes(action.nature) ? action.nature : undefined;
  const evs = action.evs ? normalizeActionSpread(action.evs) ?? undefined : undefined;

  return {
    item,
    ability,
    nature,
    moves: suggestedMoves.length ? [...suggestedMoves, "", "", "", ""].slice(0, 4) : undefined,
    evs,
  };
}

export function formatActionSpread(evs: Partial<Record<StatKey, number>>) {
  return STAT_KEYS
    .filter((stat) => (evs[stat] ?? 0) > 0)
    .map((stat) => `${evs[stat]} ${stat}`)
    .join(" / ") || "0 points";
}

export async function sendBuildAssistMessage(
  messages: BuildAssistMessage[],
  context: BuildAssistContext,
): Promise<BuildAssistResponse> {
  const response = await fetch("/api/build-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context } satisfies BuildAssistRequest),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof payload.error === "string" ? payload.error : "Build assist request failed.";
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    throw new Error(detail ? `${error} ${detail}` : error);
  }
  if (!payload.reply || typeof payload.reply !== "string") {
    throw new Error("Build assist returned an empty reply.");
  }
  return parseBuildAssistReply(payload.reply);
}

export async function streamBuildAssistMessage(
  messages: BuildAssistMessage[],
  context: BuildAssistContext,
  onDelta: (delta: string) => void,
): Promise<BuildAssistResponse> {
  const response = await fetch("/api/build-assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context } satisfies BuildAssistRequest),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = typeof payload.error === "string" ? payload.error : "Build assist request failed.";
    const detail = typeof payload.detail === "string" ? payload.detail : "";
    throw new Error(detail ? `${error} ${detail}` : error);
  }

  if (!response.body) {
    throw new Error("Build assist returned an empty reply.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let reply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const delta = decoder.decode(value, { stream: true });
    if (delta) {
      reply += delta;
      onDelta(delta);
    }
  }

  const trailingDelta = decoder.decode();
  if (trailingDelta) {
    reply += trailingDelta;
    onDelta(trailingDelta);
  }

  if (!reply.trim()) {
    throw new Error("Build assist returned an empty reply.");
  }

  return parseBuildAssistReply(reply.trim());
}

export const BUILD_ASSIST_STARTERS = [
  "What should I add next?",
  "What is this team missing?",
  "Suggest one partner.",
  "Tighten this set.",
] as const;
