import { CHAMPIONS_STAT_POINT_MAX, CHAMPIONS_STAT_POINT_TOTAL, formatMegaDisplayName, MegaForm, POKEMON, PokemonBuild, PokemonData, StatKey } from "./pokemon";

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
  excludedSpecies: string[];
  teamComposition: string;
  hasWeatherSetter: boolean;
};

export type BuildAssistContextOptions = {
  priorSuggestedSpecies?: string[];
};

const WEATHER_SETTER_ABILITIES = new Set(["Drizzle", "Drought", "Snow Warning", "Sand Stream"]);
const TRICK_ROOM_MOVES = new Set(["Trick Room"]);
const SPEED_CONTROL_MOVES = new Set(["Tailwind", "Icy Wind", "Electroweb", "Bleakwind Storm"]);

export function teamHasWeatherSetter(team: PokemonBuild[]) {
  return team.some((build) => {
    const data = POKEMON.find((entry) => entry.name === build.species);
    const ability = build.ability && build.ability !== "None" ? build.ability : data?.abilities[0] ?? "";
    return WEATHER_SETTER_ABILITIES.has(ability);
  });
}

export function actionAddsWeatherSetter(action: BuildAssistAction) {
  if (action.type !== "add_pokemon" && action.type !== "update_set") return false;
  return Boolean(action.ability && WEATHER_SETTER_ABILITIES.has(action.ability));
}

function summarizeTeamComposition(pokemon: BuildAssistPokemonSnapshot[]) {
  if (!pokemon.length) {
    return "Team is empty — pick one core direction first (rain, sun, Trick Room, or balanced offense).";
  }

  const lines: string[] = [];
  const weather = pokemon.filter((mon) => WEATHER_SETTER_ABILITIES.has(mon.ability));
  if (weather.length) {
    lines.push(`Weather core: ${weather.map((mon) => `${mon.displayName} (${mon.ability})`).join(", ")}`);
  }

  const intimidators = pokemon.filter((mon) => mon.ability === "Intimidate");
  if (intimidators.length) {
    lines.push(`Intimidate: ${intimidators.map((mon) => mon.displayName).join(", ")}`);
  }

  const trickRoom = pokemon.filter((mon) => mon.moves.some((move) => TRICK_ROOM_MOVES.has(move)));
  if (trickRoom.length) {
    lines.push(`Trick Room access: ${trickRoom.map((mon) => mon.displayName).join(", ")}`);
  }

  const speedControl = pokemon.filter((mon) => mon.moves.some((move) => SPEED_CONTROL_MOVES.has(move)));
  if (speedControl.length) {
    lines.push(`Speed control: ${speedControl.map((mon) => mon.displayName).join(", ")}`);
  }

  const types = new Set(pokemon.flatMap((mon) => mon.types));
  lines.push(`Team types present: ${[...types].join(", ") || "unknown"}`);

  if (weather.length) {
    lines.push("Rain/sun/sand/snow is already covered — add partners that benefit from that weather, not another setter.");
  } else {
    lines.push("No dedicated weather setter yet — only add one if the user is building a weather team.");
  }

  return lines.join("\n");
}

export function buildAssistContext(
  team: PokemonBuild[],
  selectedId: string | null,
  options: BuildAssistContextOptions = {},
): BuildAssistContext {
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

  const excluded = new Set<string>();
  for (const build of team) excluded.add(build.species.toLowerCase());
  for (const species of options.priorSuggestedSpecies ?? []) excluded.add(species.toLowerCase());

  return {
    format: "Pokémon Champions · Regulation MB · Level 50 · 32 Stat Points max per stat · 66 total per Pokémon · Doubles",
    teamSize: team.length,
    maxTeamSize: 6,
    selectedDisplayName: pokemon.find((entry) => entry.selected)?.displayName ?? null,
    pokemon,
    excludedSpecies: [...excluded],
    teamComposition: summarizeTeamComposition(pokemon),
    hasWeatherSetter: teamHasWeatherSetter(team),
  };
}

export type BuildAssistRequest = {
  messages: BuildAssistMessage[];
  context: BuildAssistContext;
};

export type BuildAssistResponse = {
  reply: string;
  actions?: BuildAssistAction[];
};

export type BuildAssistSetSuggestion = {
  pokemon: string;
  reason?: string;
  megaForm?: string;
  item?: string;
  ability?: string;
  nature?: string;
  moves?: string[];
  evs?: Partial<Record<StatKey, number>>;
};

export type BuildAssistAction =
  | ({ type: "add_pokemon" } & BuildAssistSetSuggestion)
  | ({ type: "update_set" } & BuildAssistSetSuggestion)
  | { type: "apply_spread"; evs: Partial<Record<StatKey, number>>; reason?: string }
  | { type: "set_item"; item: string; reason?: string }
  | { type: "set_ability"; ability: string; reason?: string }
  | { type: "set_nature"; nature: string; reason?: string }
  | { type: "set_moves"; moves: string[]; reason?: string };

function formatMegaFormName(species: string, formName: string) {
  return formatMegaDisplayName(species, formName);
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

function normalizeMegaText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function megaAliases(pokemon: PokemonData, formName: string) {
  const marker = `${pokemon.name}-Mega`;
  const suffix = formName.startsWith(marker) ? normalizeMegaText(formName.slice(marker.length)) : "";
  const base = normalizeMegaText(pokemon.name);
  return [
    normalizeMegaText(formName),
    `mega${base}${suffix}`,
    `${base}mega${suffix}`,
  ];
}

function resolveMegaFormFromText(text: string, pokemon: PokemonData): MegaForm | undefined {
  const normalized = normalizeMegaText(text);
  const forms = pokemon.megaForms ?? [];
  if (!forms.length) return undefined;

  const matching = forms.find((form) => megaAliases(pokemon, form.name).some((alias) => normalized.includes(alias)));
  if (matching) return matching;

  const genericMega = normalized.includes(`mega${normalizeMegaText(pokemon.name)}`)
    || normalized.includes(`${normalizeMegaText(pokemon.name)}mega`);
  if (genericMega && forms.length === 1) return forms[0];
  return undefined;
}

function megaStoneForForm(pokemon: PokemonData, form: MegaForm): string | undefined {
  const stones = pokemon.items.filter(isMegaStoneItem);
  if (!stones.length) return undefined;

  const formSuffix = form.name.startsWith(`${pokemon.name}-Mega`)
    ? form.name.slice(`${pokemon.name}-Mega`.length).replace(/^-/, "")
    : "";
  const speciesKey = normalizeMegaText(pokemon.name);

  const speciesStones = stones.filter((stone) => {
    const stoneKey = normalizeMegaText(stone);
    const stem = speciesKey.replace(/o$/, "").slice(0, Math.max(4, Math.min(speciesKey.length, 7)));
    return stoneKey.includes(speciesKey.slice(0, 4)) || stoneKey.includes(stem);
  });
  if (!speciesStones.length) return undefined;

  if (formSuffix) {
    const suffixKey = normalizeMegaText(formSuffix);
    return speciesStones.find((stone) => normalizeMegaText(stone).includes(suffixKey))
      ?? speciesStones.find((stone) => stone.endsWith(formSuffix))
      ?? speciesStones[0];
  }

  if (speciesStones.length > 1) {
    return speciesStones.find((stone) => !/\sZ$/i.test(stone) && !stone.endsWith(" Z")) ?? speciesStones[0];
  }
  return speciesStones[0];
}

function findMegaFormByItem(pokemon: PokemonData, item: string): MegaForm | undefined {
  if (!isMegaStoneItem(item)) return undefined;
  return pokemon.megaForms?.find((form) => megaStoneForForm(pokemon, form) === item);
}

function legalAbilitiesForSet(pokemon: PokemonData, megaFormName?: string) {
  const abilities = [...pokemon.abilities];
  if (megaFormName) {
    const form = pokemon.megaForms?.find((entry) => entry.name === megaFormName);
    if (form?.ability && !abilities.includes(form.ability)) abilities.push(form.ability);
  }
  return abilities;
}

function applyMegaIntent(suggestion: BuildAssistSetSuggestion, conversationText: string): BuildAssistSetSuggestion {
  const pokemon = findCatalogPokemon(suggestion.pokemon);
  if (!pokemon?.megaForms?.length) return suggestion;

  let form = suggestion.megaForm
    ? pokemon.megaForms.find((entry) => entry.name === suggestion.megaForm)
    : undefined;

  if (!form && suggestion.item) {
    form = findMegaFormByItem(pokemon, suggestion.item);
  }

  if (!form) {
    form = resolveMegaFormFromText(`${conversationText}\n${suggestion.reason ?? ""}`, pokemon);
  }

  if (!form && suggestion.ability) {
    form = pokemon.megaForms.find((entry) => entry.ability === suggestion.ability);
  }

  if (!form) return suggestion;

  const stone = megaStoneForForm(pokemon, form);
  const ability = suggestion.ability && legalAbilitiesForSet(pokemon).includes(suggestion.ability)
    ? suggestion.ability
    : pokemon.abilities[0];

  return {
    ...suggestion,
    megaForm: form.name,
    item: stone ?? suggestion.item,
    ability,
  };
}

function filterBuilderItems(items: string[], pokemon?: PokemonData) {
  const legal = items.filter((item) => !isMegaStoneItem(item));
  const prioritized = BUILDER_ITEM_PRIORITY.filter((item) => legal.includes(item));
  const rest = legal.filter((item) => !prioritized.includes(item)).sort((left, right) => left.localeCompare(right));
  const base = [...prioritized, ...rest];
  const megaStones = (pokemon?.megaForms ?? [])
    .map((form) => megaStoneForForm(pokemon!, form))
    .filter((stone): stone is string => Boolean(stone));
  return [...new Set([...megaStones, ...base])].slice(0, CATALOG_ITEM_LIMIT + megaStones.length);
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
  const detailLimit = isFullTeamRequest(messages, context) ? 12 : CATALOG_DETAIL_LIMIT;
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name) || ordered.length >= detailLimit) return;
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

  if (isFullTeamRequest(messages, context)) {
    const latest = [...messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
    const theme = latest.includes("rain") ? "rain" : latest.includes("sun") ? "sun" : latest.includes("trick room") ? "trick room" : null;
    if (theme) {
      for (const name of catalogThemeCandidates(theme)) add(name);
    }
  }

  return ordered;
}

function formatRegulationMBCatalogIndex() {
  return POKEMON.map((pokemon) => pokemon.name).sort((left, right) => left.localeCompare(right)).join(", ");
}

function formatPokemonCatalogEntry(data: PokemonData) {
  const items = filterBuilderItems(data.items, data);
  const moves = selectBuilderMoves(data.moves);
  const legalItemCount = data.items.filter((item) => !isMegaStoneItem(item)).length;
  const omittedItems = Math.max(0, legalItemCount - items.length);
  const omittedMoves = Math.max(0, data.moves.length - moves.length);
  const megaLine = (data.megaForms ?? []).length
    ? `Mega forms: ${data.megaForms!.map((form) => {
      const stone = megaStoneForForm(data, form);
      return `${formatMegaFormName(data.name, form.name)} (${form.ability}${stone ? `, ${stone}` : ""})`;
    }).join("; ")}`
    : null;

  return [
    `${data.name} · ${data.types.join("/")} · ${data.role}`,
    `Base stats: ${formatBaseStats(data.stats)}`,
    `Abilities: ${data.abilities.join(", ")}`,
    megaLine,
    `Legal items: ${items.join(", ")}${omittedItems > 0 ? ` (+${omittedItems} more held items)` : ""}`,
    `Legal moves: ${moves.join(", ")}${omittedMoves > 0 ? ` (+${omittedMoves} more moves)` : ""}`,
  ].filter(Boolean).join("\n");
}

function findCatalogPokemon(name: string) {
  return POKEMON.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase());
}

export function isCatalogPokemon(name: string) {
  return Boolean(findCatalogPokemon(name));
}

function isLegalCatalogSet(suggestion: BuildAssistSetSuggestion) {
  const pokemon = findCatalogPokemon(suggestion.pokemon);
  if (!pokemon) return false;

  const inferredForm = suggestion.megaForm
    ? pokemon.megaForms?.find((form) => form.name === suggestion.megaForm)
    : suggestion.item ? findMegaFormByItem(pokemon, suggestion.item) : undefined;
  const legalAbilities = legalAbilitiesForSet(pokemon, inferredForm?.name);

  if (!suggestion.ability?.trim() || !legalAbilities.includes(suggestion.ability)) return false;
  if (!suggestion.item?.trim() || !pokemon.items.includes(suggestion.item)) return false;
  if (inferredForm) {
    const expectedStone = megaStoneForForm(pokemon, inferredForm);
    if (expectedStone && suggestion.item !== expectedStone) return false;
  }
  if (!suggestion.nature?.trim()) return false;
  const moves = suggestion.moves?.filter(Boolean) ?? [];
  if (moves.length < 4 || !moves.every((move) => pokemon.moves.includes(move))) return false;
  return Boolean(sanitizeActionSpread(suggestion.evs ?? {}));
}

function catalogThemeCandidates(theme: "rain" | "sun" | "trick room") {
  if (theme === "rain") {
    return POKEMON.filter((pokemon) =>
      pokemon.abilities.includes("Drizzle")
      || pokemon.abilities.includes("Swift Swim")
      || pokemon.moves.includes("Hurricane")
      || pokemon.moves.includes("Thunder"),
    ).map((pokemon) => pokemon.name);
  }
  if (theme === "sun") {
    return POKEMON.filter((pokemon) =>
      pokemon.abilities.includes("Drought")
      || pokemon.abilities.includes("Chlorophyll")
      || pokemon.moves.includes("Solar Beam"),
    ).map((pokemon) => pokemon.name);
  }
  return POKEMON.filter((pokemon) => pokemon.moves.includes("Trick Room")).map((pokemon) => pokemon.name);
}

function buildThemeCatalogHint(messages: BuildAssistMessage[], context: BuildAssistContext) {
  if (!isFullTeamRequest(messages, context)) return "";
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
  if (latest.includes("rain")) {
    const drizzle = POKEMON.filter((pokemon) => pokemon.abilities.includes("Drizzle")).map((pokemon) => pokemon.name);
    const swiftSwim = POKEMON.filter((pokemon) => pokemon.abilities.includes("Swift Swim")).map((pokemon) => pokemon.name);
    const intimidate = POKEMON.filter((pokemon) => pokemon.abilities.includes("Intimidate")).map((pokemon) => pokemon.name);
    return [
      "Legal rain-team candidates from this Regulation MB catalog (choose and build sets yourself — do not copy template teams):",
      `Drizzle: ${drizzle.join(", ") || "none"}`,
      `Swift Swim: ${swiftSwim.join(", ") || "none"}`,
      `Intimidate: ${intimidate.join(", ") || "none"}`,
    ].join("\n");
  }
  if (latest.includes("sun")) {
    const drought = POKEMON.filter((pokemon) => pokemon.abilities.includes("Drought")).map((pokemon) => pokemon.name);
    const chlorophyll = POKEMON.filter((pokemon) => pokemon.abilities.includes("Chlorophyll")).map((pokemon) => pokemon.name);
    return [
      "Legal sun-team candidates from this Regulation MB catalog (choose and build sets yourself — do not copy template teams):",
      `Drought: ${drought.join(", ") || "none"}`,
      `Chlorophyll: ${chlorophyll.join(", ") || "none"}`,
    ].join("\n");
  }
  if (latest.includes("trick room")) {
    const trickRoom = catalogThemeCandidates("trick room");
    return [
      "Legal Trick Room candidates from this Regulation MB catalog (choose and build sets yourself):",
      trickRoom.join(", ") || "none",
    ].join("\n");
  }
  return "";
}

export function isFullTeamRequest(messages: BuildAssistMessage[], context: BuildAssistContext) {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content.toLowerCase() ?? "";
  return isFullTeamIntent(latest, context.teamSize);
}

function isFullTeamIntent(text: string, teamSize = 0) {
  const latest = text.toLowerCase();
  return /\b(?:full|complete|whole|entire)\s+(?:\w+\s+){0,3}team\b/.test(latest)
    || /\bbuild(?:\s+me)?\s+a\s+(?:full|complete|whole)?\s*(?:\w+\s+){0,2}team\b/.test(latest)
    || /\b(?:give|make|create)\s+me\s+(?:a\s+)?(?:full|complete|whole)?\s*(?:\w+\s+){0,2}team\b/.test(latest)
    || /\b(?:6|six)[\s-]*(?:pok[eé]mon|mon|members?)\b/.test(latest)
    || (teamSize === 0 && /\bteam\b/.test(latest) && /\b(?:rain|sun|trick room|full|complete|build)\b/.test(latest));
}

export function getBuildAssistMaxTokens(messages: BuildAssistMessage[], context: BuildAssistContext) {
  return isFullTeamRequest(messages, context) ? 3600 : 900;
}

function isCompleteSetSuggestion(suggestion: BuildAssistSetSuggestion) {
  return isLegalCatalogSet(suggestion);
}

const OFFENSIVE_SPECIAL_NATURES = new Set(["Modest", "Timid", "Rash", "Quiet", "Mild"]);
const OFFENSIVE_PHYSICAL_NATURES = new Set(["Adamant", "Jolly", "Brave", "Lonely", "Naughty"]);
const DEFENSIVE_NATURES = new Set(["Bold", "Calm", "Careful", "Relaxed", "Impish", "Sassy"]);

function defaultEvsForSet(suggestion: BuildAssistSetSuggestion) {
  const nature = suggestion.nature;
  if (!nature) return undefined;
  if (OFFENSIVE_SPECIAL_NATURES.has(nature)) {
    return sanitizeActionSpread({ HP: 32, SpA: 32, Spe: 2 }) ?? undefined;
  }
  if (OFFENSIVE_PHYSICAL_NATURES.has(nature)) {
    return sanitizeActionSpread({ HP: 32, Atk: 32, Spe: 2 }) ?? undefined;
  }
  if (DEFENSIVE_NATURES.has(nature)) {
    return sanitizeActionSpread({ HP: 32, Def: 32, SpD: 2 }) ?? undefined;
  }
  return sanitizeActionSpread({ HP: 32, Atk: 16, SpA: 16, Spe: 2 }) ?? undefined;
}

function preferredAbilityForContext(pokemon: PokemonData, contextText: string) {
  const text = contextText.toLowerCase();
  if (text.includes("sun") && pokemon.abilities.includes("Chlorophyll")) return "Chlorophyll";
  if (text.includes("rain") && pokemon.abilities.includes("Swift Swim")) return "Swift Swim";
  if (text.includes("sand") && pokemon.abilities.includes("Sand Rush")) return "Sand Rush";
  if (text.includes("snow") && pokemon.abilities.includes("Slush Rush")) return "Slush Rush";
  return pokemon.abilities[0];
}

function preferredItemForSet(pokemon: PokemonData, suggestion: BuildAssistSetSuggestion, usedItems = new Set<string>()) {
  return pickUniqueItemForPokemon(pokemon, suggestion, usedItems) ?? "";
}

function teamUsedItems(team: PokemonBuild[]) {
  return new Set(team.map((build) => build.item).filter(Boolean));
}

function pickUniqueItemForPokemon(
  pokemon: PokemonData,
  suggestion: BuildAssistSetSuggestion,
  usedItems: Set<string>,
): string | undefined {
  const candidates: string[] = [];
  if (suggestion.megaForm) {
    const form = pokemon.megaForms?.find((entry) => entry.name === suggestion.megaForm);
    const stone = form ? megaStoneForForm(pokemon, form) : undefined;
    if (stone) candidates.push(stone);
  }
  if (suggestion.item && pokemon.items.includes(suggestion.item)) {
    candidates.unshift(suggestion.item);
  }
  for (const item of BUILDER_ITEM_PRIORITY) {
    if (pokemon.items.includes(item)) candidates.push(item);
  }
  for (const item of pokemon.items) {
    if (!isMegaStoneItem(item) || suggestion.megaForm) candidates.push(item);
  }

  const seen = new Set<string>();
  for (const item of candidates) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    if (!usedItems.has(item)) return item;
  }
  return undefined;
}

function applyItemClauseToAdd(
  action: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  usedItems: Set<string>,
): Extract<BuildAssistAction, { type: "add_pokemon" }> {
  const pokemon = findCatalogPokemon(action.pokemon);
  if (!pokemon) return action;

  const item = action.item?.trim();
  if (item && !usedItems.has(item)) {
    usedItems.add(item);
    return action;
  }

  const replacement = pickUniqueItemForPokemon(pokemon, action, usedItems);
  if (replacement) {
    usedItems.add(replacement);
    return { ...action, item: replacement };
  }

  return action;
}

function enforceItemClauseOnActions(actions: BuildAssistAction[], team: PokemonBuild[]) {
  const usedItems = teamUsedItems(team);
  return actions.map((action) => (
    action.type === "add_pokemon" ? applyItemClauseToAdd(action, usedItems) : action
  ));
}

function preferredNatureForPokemon(pokemon: PokemonData) {
  const { Atk, SpA, Spe, Def, SpD } = pokemon.stats;
  if (SpA >= Atk && SpA >= Spe) return "Modest";
  if (Atk >= SpA && Spe >= Math.max(Atk, SpA)) return "Jolly";
  if (Atk >= SpA) return "Adamant";
  if (SpA > Atk) return "Modest";
  if (Def >= SpD) return "Bold";
  if (SpD > Def) return "Calm";
  return "Hardy";
}

function preferredMovesForPokemon(pokemon: PokemonData) {
  const prioritized = DOUBLES_MOVE_PRIORITY.filter((move) => pokemon.moves.includes(move));
  const rest = pokemon.moves.filter((move) => !prioritized.includes(move));
  return [...prioritized, ...rest].slice(0, 4);
}

function fillMissingCatalogSetFields(
  suggestion: BuildAssistSetSuggestion,
  contextText: string,
): BuildAssistSetSuggestion {
  const pokemon = findCatalogPokemon(suggestion.pokemon);
  if (!pokemon) return suggestion;

  const withMega = applyMegaIntent(suggestion, contextText);
  const nature = withMega.nature && ALL_NATURES.includes(withMega.nature)
    ? withMega.nature
    : preferredNatureForPokemon(pokemon);
  const ability = withMega.ability && legalAbilitiesForSet(pokemon, withMega.megaForm).includes(withMega.ability)
    ? withMega.ability
    : preferredAbilityForContext(pokemon, contextText);
  const item = withMega.item && pokemon.items.includes(withMega.item)
    ? withMega.item
    : preferredItemForSet(pokemon, withMega);
  const explicitMoves = withMega.moves?.filter(Boolean) ?? [];
  const moves = explicitMoves.length >= 4
    ? explicitMoves.slice(0, 4)
    : preferredMovesForPokemon(pokemon);
  const evs = sanitizeActionSpread(withMega.evs ?? {})
    ?? defaultEvsForSet({ ...withMega, nature })
    ?? sanitizeActionSpread({ HP: 32, SpA: 32, Spe: 2 })
    ?? undefined;

  return {
    ...withMega,
    ability,
    item,
    nature,
    moves,
    evs,
  };
}

function finalizeAddPokemonAction(
  action: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  reply: string,
  allMentionNames: string[],
  requireComplete: boolean,
  conversationText = reply,
  fillMissingSets = false,
): Extract<BuildAssistAction, { type: "add_pokemon" }> | null {
  const enriched = resolveAddPokemonAction(action.pokemon, reply, allMentionNames, action);
  if (!enriched || !isCatalogPokemon(enriched.pokemon)) return null;

  let result: Extract<BuildAssistAction, { type: "add_pokemon" }> = {
    type: "add_pokemon",
    ...applyMegaIntent(enriched, `${conversationText}\n${reply}`),
    pokemon: enriched.pokemon,
  };
  const section = bestSectionForPokemon(reply, result.pokemon, allMentionNames);
  if (!sanitizeActionSpread(result.evs ?? {})) {
    const parsedEvs = parseEvsFromText(section);
    if (parsedEvs) {
      result = { ...result, evs: sanitizeActionSpread(parsedEvs) ?? normalizeActionSpread(parsedEvs) ?? result.evs };
    }
  }
  if (!sanitizeActionSpread(result.evs ?? {})) {
    const fallbackEvs = defaultEvsForSet(result);
    if (fallbackEvs) result = { ...result, evs: fallbackEvs };
  }

  if (requireComplete && !isCompleteSetSuggestion(result) && fillMissingSets) {
    result = {
      type: "add_pokemon",
      ...fillMissingCatalogSetFields(result, `${conversationText}\n${reply}`),
      pokemon: result.pokemon,
    };
  }

  if (requireComplete && !isCompleteSetSuggestion(result)) return null;
  return result;
}

export function buildBuildAssistSystemPrompt(context: BuildAssistContext, messages: BuildAssistMessage[] = []) {
  const fullTeamRequest = isFullTeamRequest(messages, context);
  const slotsToFill = Math.max(0, context.maxTeamSize - context.teamSize);
  const themeCatalogHint = buildThemeCatalogHint(messages, context);
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
    ...(fullTeamRequest ? [
      `FULL TEAM REQUEST: the user wants ${slotsToFill || 6} Pokémon with complete sets. Ignore the one-step-only rule for this answer.`,
      `Include exactly ${slotsToFill || 6} add_pokemon actions in one [[PANE_ACTIONS:...]] block — one per team slot needed.`,
      "Every add_pokemon action MUST include all of: ability, item, nature, exactly 4 moves, and evs that total 66 (32 max per stat).",
      "Every suggested held item must be unique across all add_pokemon actions and items already on the user's team (VGC item clause).",
      "Do not stop after one Pokémon. Do not tell the user to ask again for the rest — deliver the full roster in this single response.",
      "Give a short overview in visible prose (one line per Pokémon role), then the hidden action block with all sets.",
      "Every Pokémon named in the team overview must appear in PANE_ACTIONS — include one add_pokemon action per roster member with no omissions.",
      "For a rain team: one Drizzle setter, Swift Swim abusers, Intimidate/Fake Out support, redirection, and type coverage — six distinct species, no duplicates.",
    ] : []),
    "Avoid markdown headings, tables, bold labels, and long templates unless the user explicitly asks.",
    "Mention only the key tradeoff when relevant.",
    "Assume level 50 with 32 Stat Points max per stat and 66 total per Pokémon.",
    "VGC item clause: every held item on a team must be unique — never assign the same item to two Pokémon across the current roster and your add_pokemon actions in one answer.",
    "When suggesting a full team or multiple Pokémon, give each a different legal held item (vary Life Orb, Focus Sash, Sitrus Berry, Leftovers, Choice items, etc.).",
    "Only suggest Pokémon from the Regulation MB roster below. Never invent Pokémon, moves, abilities, or items.",
    "Before every add_pokemon or update_set, verify the species name appears verbatim in the roster. If it does not, pick a different legal species instead.",
    "Examples in this prompt show JSON format only — never copy species, sets, or full teams from examples. Reason from the user's request, current team, and catalog entries.",
    "When you recommend a move, ability, or item, use the exact catalog name from the detailed entries.",
    "If a suggested option is not in that Pokémon's legal list, do not recommend it.",
    "When the team is incomplete, prioritize what to add next and why.",
    "Read the team composition summary and current roster before every suggestion. Build synergistically off what is already there.",
    "When the user asks for one more Pokémon or to round out the team, identify the biggest missing role (type coverage, Intimidate, Fake Out, speed control, weather abuse, Trick Room, redirection) and suggest exactly one new species that fills that gap.",
    "Never suggest a Pokémon already on the team or listed under excluded species.",
    "Never repeat a Pokémon you already suggested earlier in this chat unless the user explicitly asks to revisit that species.",
    "If the team already has a weather setter (Drizzle, Drought, Snow Warning, or Sand Stream), do not suggest another weather setter — suggest partners that benefit from that weather instead.",
    "Do not stack redundant roles (two Intimidate users, two Trick Room setters, two Tailwind users) unless the user asks for a specific strategy.",
    "When rain is active, favor Swift Swim users and rain-boosted moves from the catalog — never a second Drizzle setter.",
    "Pane Build Assist is an education tool — teach VGC and doubles fundamentals here. Never tell users to go read external guides, watch videos elsewhere, or learn on their own when they ask to learn.",
    "When the user asks where to start, how VGC works, or similar beginner questions: explain doubles basics in plain language (2v2, Protect, team roles, turn order), recommend one beginner-friendly Regulation MB Pokémon to try first, teach why it is a good learning pick, and include one add_pokemon action with a simple legal starter set they can apply immediately.",
    "Always write the teaching in the visible reply (2-4 sentences or short bullets). Do not rely on the action card reason alone — the chat text is the lesson, the card is the hands-on next step.",
    "If the team is empty and no other pick fits better, recommend one beginner-friendly Regulation MB Pokémon from the roster with reasoning tailored to the user's request.",
    "When the user asks follow-up questions about a Pokémon, role, move, item, or VGC concept you mentioned, go deeper in chat — explain what it does in battle, when to click it, common partners, and beginner mistakes. Keep teaching; do not deflect.",
    "Educational answers can run longer than usual (a short paragraph plus bullets is fine). Skip add_pokemon or update_set only when the user is asking a purely conceptual question with no Pokémon to try.",
    "When a Pokémon is selected, weight advice toward building around or supporting that mon.",
    "When the user asks to build, tighten, max stats, or apply a set for the selected Pokémon, include one update_set action with that species and the full ability, item, nature, moves, and evs.",
    "Use update_set only for Pokémon already on the team. If the team is empty or the species is not on the team yet, use add_pokemon instead.",
    "When the user names a Mega form (e.g. Mega Charizard Y), include megaForm in add_pokemon/update_set (internal id like Charizard-Mega-Y), the matching mega stone as item (e.g. Charizardite Y), and a legal base ability from the catalog (e.g. Blaze). Mega battle abilities come from the form.",
    "When building around a mega core, the anchor Pokémon's add_pokemon action must use its mega stone — never a generic booster like Charcoal instead of the stone.",
    "Do not default to generic partners like Whimsicott unless the user asks for speed control or the current team clearly needs Tailwind.",
    "Do not ask the user to confirm in chat when update_set is available — the apply card is the confirmation step.",
    "Keep visible replies to 1-2 short sentences when update_set is included; the card shows the full set. add_pokemon teaching answers should keep the longer visible explanation.",
    "Do not claim exact damage calcs unless the app ran them — suggest what to verify in Pane Coach instead.",
    "When your answer includes a concrete change the app could apply, append one hidden action block at the very end.",
    "If you suggest adding a specific Pokémon, always include an add_pokemon action for that Pokémon with ability, item, nature, moves, and evs when you mention them.",
    "If you suggest multiple new Pokémon in one answer, include one add_pokemon action per Pokémon in the same PANE_ACTIONS block.",
    "Visible prose and hidden action payloads must match — do not describe spreads in text without putting them in the action.",
    "If the user asks you to add or apply something, do not claim it is done. Provide the action for approval.",
    "The hidden block format is exactly: [[PANE_ACTIONS:{\"actions\":[...]}]]",
    "Never print raw JSON in the visible reply. Raw JSON belongs only inside the hidden PANE_ACTIONS block.",
    "Allowed action types: add_pokemon; update_set with pokemon plus optional item, ability, nature, moves, evs; apply_spread with evs; set_item with item; set_ability with ability; set_nature with nature; set_moves with moves.",
    "Prefer one update_set action over separate apply_spread, set_moves, set_item, set_ability, and set_nature actions for the same Pokémon.",
    "When suggesting a partner, include a starter set in the add_pokemon action whenever possible: ability, item, nature, moves, and evs from that Pokémon's catalog entry.",
    "Hidden action format example (syntax only — invent your own legal sets): [[PANE_ACTIONS:{\"actions\":[{\"type\":\"add_pokemon\",\"pokemon\":\"<roster name>\",\"megaForm\":\"<form id if mega>\",\"ability\":\"<legal ability>\",\"item\":\"<legal item>\",\"nature\":\"<nature>\",\"moves\":[\"<move>\",\"<move>\",\"<move>\",\"<move>\"],\"evs\":{\"HP\":32,\"SpA\":32,\"SpD\":2},\"reason\":\"<why this fits the team>\"}]}]]",
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
    ...(themeCatalogHint ? [themeCatalogHint, ""] : []),
    "Current team:",
    teamBlock,
    "",
    "Team composition analysis:",
    context.teamComposition,
    "",
    context.excludedSpecies.length
      ? `Excluded species (already on team or suggested earlier — do not recommend again): ${context.excludedSpecies.join(", ")}`
      : "Excluded species: none yet.",
  ].join("\n");
}

export function parseBuildAssistReply(rawReply: string): BuildAssistResponse {
  return finalizeBuildAssistStream(rawReply, false);
}

export function parseBuildAssistStream(rawReply: string): BuildAssistResponse {
  return finalizeBuildAssistStream(rawReply, true);
}

function finalizeBuildAssistStream(rawReply: string, includePartialActions: boolean): BuildAssistResponse {
  const actions: BuildAssistAction[] = [];
  let reply = rawReply;
  const marker = "[[PANE_ACTIONS:";

  while (reply.includes(marker)) {
    const start = reply.indexOf(marker);
    const payloadStart = start + marker.length;
    const end = reply.indexOf("]]", payloadStart);
    if (end < 0) {
      if (includePartialActions) {
        actions.push(...parsePaneActionPayload(reply.slice(payloadStart), true));
      }
      reply = reply.slice(0, start);
      break;
    }

    actions.push(...parsePaneActionPayload(reply.slice(payloadStart, end), false));
    reply = `${reply.slice(0, start)}${reply.slice(end + 2)}`;
  }

  const loose = extractLooseActionObjects(reply);
  if (loose.actions.length) {
    actions.push(...loose.actions);
    reply = loose.reply;
  }

  reply = reply.replace(/\s*\[\[PANE_ACTIONS:[\s\S]*$/g, "").trim();
  reply = stripTrailingPartialJson(reply);

  return { reply, actions };
}

function parsePaneActionPayload(payload: string, partial: boolean): BuildAssistAction[] {
  const actions: BuildAssistAction[] = [];
  if (!payload.trim()) return actions;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(payload);
  } catch {
    if (partial) parsed = repairPartialJson(payload);
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { actions?: unknown }).actions)) {
    for (const action of (parsed as { actions: unknown[] }).actions) {
      const normalized = normalizeBuildAssistAction(action);
      if (normalized) actions.push(normalized);
    }
    if (actions.length || !partial) return actions;
  }

  if (partial) {
    const inferred = inferPartialSetActions(payload);
    if (inferred.length) return inferred;
  }

  return actions;
}

function repairPartialJson(payload: string): unknown | null {
  let attempt = payload.trim();
  if (!attempt) return null;

  let inString = false;
  let escaped = false;
  const closers: string[] = [];

  for (const char of attempt) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") closers.push("}");
    else if (char === "[") closers.push("]");
    else if (char === "}" || char === "]") {
      if (closers.length && closers[closers.length - 1] === char) closers.pop();
    }
  }

  if (inString) attempt += "\"";
  attempt = attempt.replace(/,\s*("(?:[^"\\]|\\.)*)?$/, "");
  attempt = attempt.replace(/,\s*$/, "");
  attempt += closers.reverse().join("");

  try {
    return JSON.parse(attempt);
  } catch {
    return null;
  }
}

function inferPartialSetActions(payload: string): BuildAssistAction[] {
  const actions: BuildAssistAction[] = [];
  const actionChunks = payload.split(/(?=\{"type"\s*:\s*"(?:add_pokemon|update_set)")/g);

  for (const chunk of actionChunks) {
    const typeMatch = chunk.match(/"type"\s*:\s*"(add_pokemon|update_set)"/);
    if (!typeMatch) continue;

    const type = typeMatch[1] as "add_pokemon" | "update_set";
    const pokemonMatch = chunk.match(/"pokemon"\s*:\s*"([^"]+)"/);
    if (!pokemonMatch?.[1]) continue;

    const readField = (field: string) => {
      const match = chunk.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`));
      return match?.[1] || undefined;
    };

    const movesMatch = chunk.match(/"moves"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
    const moves = movesMatch
      ? [...movesMatch[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]).filter(Boolean)
      : undefined;

    const evs: Partial<Record<StatKey, number>> = {};
    const evsMatch = chunk.match(/"evs"\s*:\s*\{([^}]*)(?:\}|$)/);
    if (evsMatch) {
      for (const match of evsMatch[1].matchAll(/"(HP|Atk|Def|SpA|SpD|Spe)"\s*:\s*(\d+)/g)) {
        evs[match[1] as StatKey] = Number(match[2]);
      }
    }

    const setAction = readSetAction(type, pokemonMatch[1], {
      item: readField("item"),
      ability: readField("ability"),
      nature: readField("nature"),
      moves,
      evs: Object.keys(evs).length ? evs : undefined,
      reason: readField("reason"),
    }, readField("reason"));
    if (setAction) actions.push(setAction);
  }

  return actions;
}

function stripTrailingPartialJson(reply: string) {
  const trimmed = reply.trimEnd();
  const lastBrace = trimmed.lastIndexOf("{");
  if (lastBrace < 0) return trimmed;

  const tail = trimmed.slice(lastBrace);
  if (!/"actions"\s*:/.test(tail) && !/"type"\s*:\s*"(?:add_pokemon|update_set|apply_spread|set_)/.test(tail)) {
    return trimmed;
  }

  if (findJsonObjectEnd(trimmed, lastBrace) >= 0) return trimmed;
  return trimmed.slice(0, lastBrace).trimEnd();
}

export function shouldHideAssistProse(reply: string, actions: BuildAssistAction[]) {
  if (!reply.trim()) return true;
  if (actions.some((action) => action.type === "add_pokemon")) return false;
  const hasUpdateSet = actions.some((action) => action.type === "update_set");
  return hasUpdateSet && reply.length < 100 && hasSetSuggestionContent(reply);
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

function readSetAction(
  type: "add_pokemon" | "update_set",
  pokemon: string,
  candidate: Record<string, unknown>,
  reason?: string,
): Extract<BuildAssistAction, { type: "add_pokemon" | "update_set" }> | null {
  const species = pokemon.trim();
  if (!species || !isCatalogPokemon(species)) return null;

  return {
    type,
    pokemon: species,
    reason,
    megaForm: typeof candidate.megaForm === "string" ? candidate.megaForm : undefined,
    item: typeof candidate.item === "string" ? candidate.item : undefined,
    ability: typeof candidate.ability === "string" ? candidate.ability : undefined,
    nature: typeof candidate.nature === "string" ? candidate.nature : undefined,
    moves: Array.isArray(candidate.moves)
      ? candidate.moves.filter((move): move is string => typeof move === "string").slice(0, 4)
      : undefined,
    evs: readActionEvs(candidate.evs),
  };
}

function normalizeBuildAssistAction(action: unknown): BuildAssistAction | null {
  if (!action || typeof action !== "object") return null;
  const candidate = action as Record<string, unknown>;
  const reason = typeof candidate.reason === "string" ? candidate.reason : undefined;

  if (candidate.type === "add_pokemon" && typeof candidate.pokemon === "string") {
    return readSetAction("add_pokemon", candidate.pokemon, candidate, reason);
  }
  if (candidate.type === "update_set" && typeof candidate.pokemon === "string") {
    return readSetAction("update_set", candidate.pokemon, candidate, reason);
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
  if (!pokemonName.trim()) return "";

  const regex = new RegExp(`\\b${escapeRegExp(pokemonName)}\\b`, "gi");
  const sections: string[] = [];
  let match: RegExpExecArray | null = regex.exec(reply);
  while (match) {
    const start = match.index;
    let end = reply.length;
    for (const other of allMentionNames) {
      if (!other.trim() || other.toLowerCase() === pokemonName.toLowerCase()) continue;
      const otherIndex = reply.slice(start + 1).search(new RegExp(`\\b${escapeRegExp(other)}\\b`, "i"));
      if (otherIndex >= 0) end = Math.min(end, start + 1 + otherIndex);
    }
    if (end > start) sections.push(reply.slice(start, end));
    match = regex.exec(reply);
    if (sections.length >= 32) break;
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
    megaForm: pick(parsed.megaForm, explicit.megaForm),
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

function hasSetSuggestionContent(section: string) {
  return scorePokemonSection(section) >= 3
    || Boolean(readLabeledValue(section, ["Ability", "Item", "Nature", "Moves", "EVs", "Stat Points"]))
    || Boolean(parseEvsFromText(section))
    || Boolean(parseMovesFromText(section));
}

function mergeSetFields(
  explicit: BuildAssistSetSuggestion,
  parsed: BuildAssistSetSuggestion,
  sectionScore: number,
): BuildAssistSetSuggestion {
  const preferParsed = sectionScore >= 4;
  const pick = <T,>(parsedValue: T | undefined, explicitValue: T | undefined) => (
    preferParsed ? parsedValue ?? explicitValue : explicitValue ?? parsedValue
  );
  const explicitMoveCount = explicit.moves?.filter(Boolean).length ?? 0;
  const parsedMoveCount = parsed.moves?.filter(Boolean).length ?? 0;
  const moves = parsedMoveCount >= explicitMoveCount ? parsed.moves : explicit.moves ?? parsed.moves;

  return {
    pokemon: explicit.pokemon,
    reason: explicit.reason ?? parsed.reason,
    megaForm: pick(parsed.megaForm, explicit.megaForm),
    ability: pick(parsed.ability, explicit.ability),
    item: pick(parsed.item, explicit.item),
    nature: pick(parsed.nature, explicit.nature),
    moves,
    evs: preferParsed ? parsed.evs ?? explicit.evs : explicit.evs ?? parsed.evs,
  };
}

function parseSetSuggestionFromSection(
  pokemonName: string,
  section: string,
  reason?: string,
): BuildAssistSetSuggestion | null {
  const pokemon = POKEMON.find((entry) => entry.name.toLowerCase() === pokemonName.toLowerCase());
  if (!pokemon) return null;

  const abilityRaw = readLabeledValue(section, ["Ability"]);
  const itemRaw = readLabeledValue(section, ["Item", "Held item"]);
  const nature = parseNatureFromText(section);
  const moves = parseMovesFromText(section, pokemon);
  const evs = parseEvsFromText(section);

  return {
    pokemon: pokemon.name,
    reason,
    ability: matchCatalogOption(abilityRaw, pokemon.abilities) ?? abilityRaw,
    item: matchCatalogOption(itemRaw, pokemon.items) ?? itemRaw,
    nature,
    moves,
    evs,
  };
}

function resolveUpdateSetAction(
  pokemonName: string,
  reply: string,
  allMentionNames: string[],
  explicit?: Extract<BuildAssistAction, { type: "update_set" }>,
  conversationText = reply,
): Extract<BuildAssistAction, { type: "update_set" }> | null {
  const section = bestSectionForPokemon(reply, pokemonName, allMentionNames);
  const sectionScore = scorePokemonSection(section);
  const parsed = parseSetSuggestionFromSection(pokemonName, section, explicit?.reason);
  if (!parsed && !explicit) return null;
  if (!parsed) {
    return explicit
      ? { type: "update_set", ...applyMegaIntent(explicit, `${conversationText}\n${reply}`), pokemon: explicit.pokemon }
      : null;
  }
  if (!explicit) {
    return { type: "update_set", ...applyMegaIntent(parsed, `${conversationText}\n${reply}`), pokemon: parsed.pokemon };
  }
  return {
    type: "update_set",
    ...applyMegaIntent(mergeSetFields(explicit, parsed, sectionScore), `${conversationText}\n${reply}`),
    pokemon: explicit.pokemon,
  };
}

function convertOnTeamAddsToUpdates(actions: BuildAssistAction[], team: PokemonBuild[]) {
  const teamSpecies = new Set(team.map((pokemon) => pokemon.species.toLowerCase()));
  return actions.map((action) => {
    if (action.type !== "add_pokemon" || !teamSpecies.has(action.pokemon.toLowerCase())) return action;
    const { type: _type, ...fields } = action;
    return { type: "update_set" as const, ...fields };
  });
}

function coalescePatchActions(actions: BuildAssistAction[], selectedSpecies: string | null) {
  const patchTypes = new Set(["apply_spread", "set_item", "set_ability", "set_nature", "set_moves"]);
  const patches = actions.filter((action) => patchTypes.has(action.type));
  if (!patches.length || !selectedSpecies) return actions;

  const withoutPatches = actions.filter((action) => !patchTypes.has(action.type));
  const existingUpdate = withoutPatches.find(
    (action): action is Extract<BuildAssistAction, { type: "update_set" }> =>
      action.type === "update_set" && action.pokemon.toLowerCase() === selectedSpecies.toLowerCase(),
  );

  const merged: Extract<BuildAssistAction, { type: "update_set" }> = existingUpdate ?? {
    type: "update_set",
    pokemon: selectedSpecies,
  };

  for (const patch of patches) {
    if (patch.type === "apply_spread") merged.evs = patch.evs;
    if (patch.type === "set_item") merged.item = patch.item;
    if (patch.type === "set_ability") merged.ability = patch.ability;
    if (patch.type === "set_nature") merged.nature = patch.nature;
    if (patch.type === "set_moves") merged.moves = patch.moves;
    merged.reason = merged.reason ?? patch.reason;
  }

  return [
    ...withoutPatches.filter((action) => action !== existingUpdate),
    merged,
  ];
}

function inferUpdateSetForSelected(
  reply: string,
  team: PokemonBuild[],
  selectedId: string | null,
): Extract<BuildAssistAction, { type: "update_set" }> | null {
  const selected = team.find((pokemon) => pokemon.id === selectedId);
  if (!selected || !hasSetSuggestionContent(reply)) return null;
  const mentions = findPokemonNamesInText(reply);
  const allMentions = mentions.includes(selected.species)
    ? mentions
    : [selected.species, ...mentions];
  return resolveUpdateSetAction(selected.species, reply, allMentions);
}

function parseUpdateSetActionsFromReply(reply: string, team: PokemonBuild[]) {
  const teamSpecies = new Set(team.map((pokemon) => pokemon.species.toLowerCase()));
  const mentions = findPokemonNamesInText(reply).filter((name) => teamSpecies.has(name.toLowerCase()));
  return mentions.map((name) => resolveUpdateSetAction(name, reply, mentions)).filter(
    (action): action is Extract<BuildAssistAction, { type: "update_set" }> => Boolean(action),
  );
}

function parseAddPokemonFromSection(
  pokemonName: string,
  section: string,
  reason?: string,
): Extract<BuildAssistAction, { type: "add_pokemon" }> | null {
  const suggestion = parseSetSuggestionFromSection(pokemonName, section, reason);
  return suggestion ? { type: "add_pokemon", ...suggestion } : null;
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

export type MergeAssistOptions = {
  excludedSpecies?: Set<string>;
  blockWeatherSetters?: boolean;
  requireCompleteSets?: boolean;
  skipProseAdds?: boolean;
  conversationText?: string;
  fillMissingTeamAdds?: boolean;
};

function shouldKeepAssistAdd(
  action: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  options: MergeAssistOptions,
) {
  const species = action.pokemon.toLowerCase();
  if (options.excludedSpecies?.has(species)) return false;
  if (options.blockWeatherSetters && actionAddsWeatherSetter(action)) return false;
  return true;
}

export function mergeBuildAssistActions(
  actions: BuildAssistAction[],
  reply: string,
  team: PokemonBuild[],
  selectedId: string | null = null,
  options: MergeAssistOptions = {},
) {
  const selected = team.find((pokemon) => pokemon.id === selectedId) ?? null;
  const selectedSpecies = selected?.species ?? null;
  const teamSpecies = new Set(team.map((pokemon) => pokemon.species.toLowerCase()));
  const excludedSpecies = options.excludedSpecies ?? teamSpecies;
  const blockWeatherSetters = options.blockWeatherSetters ?? teamHasWeatherSetter(team);
  const mergeOptions: MergeAssistOptions = { excludedSpecies, blockWeatherSetters, ...options };
  const requireCompleteSets = mergeOptions.requireCompleteSets ?? true;
  const mentions = findPokemonNamesInText(reply);
  const conversationText = mergeOptions.conversationText ?? reply;
  const fillMissingSets = mergeOptions.fillMissingTeamAdds
    ?? isFullTeamIntent(conversationText, team.length);

  let working = actions.filter((action) => {
    if (action.type !== "add_pokemon" && action.type !== "update_set") return true;
    return Boolean(action.pokemon.trim());
  });
  working = convertOnTeamAddsToUpdates(working, team);
  working = coalescePatchActions(working, selectedSpecies);

  const updateBySpecies = new Map<string, Extract<BuildAssistAction, { type: "update_set" }>>();
  const adds: Extract<BuildAssistAction, { type: "add_pokemon" }>[] = [];
  const others: BuildAssistAction[] = [];

  for (const action of working) {
    if (action.type === "update_set") {
      const enriched = resolveUpdateSetAction(action.pokemon, reply, mentions, action, conversationText) ?? action;
      updateBySpecies.set(enriched.pokemon.toLowerCase(), enriched);
      continue;
    }
    if (action.type === "add_pokemon") {
      const finalized = finalizeAddPokemonAction(
        action,
        reply,
        mentions,
        requireCompleteSets,
        conversationText,
        fillMissingSets,
      );
      if (!finalized) continue;
      if (teamSpecies.has(finalized.pokemon.toLowerCase())) {
        const { type: _type, ...fields } = finalized;
        updateBySpecies.set(finalized.pokemon.toLowerCase(), { type: "update_set", ...fields });
      } else if (shouldKeepAssistAdd(finalized, mergeOptions)) {
        adds.push(finalized);
      }
      continue;
    }
    others.push(action);
  }

  for (const inferred of parseUpdateSetActionsFromReply(reply, team)) {
    if (!updateBySpecies.has(inferred.pokemon.toLowerCase())) {
      updateBySpecies.set(inferred.pokemon.toLowerCase(), inferred);
    }
  }

  const selectedInferred = inferUpdateSetForSelected(reply, team, selectedId);
  if (selectedInferred) {
    updateBySpecies.set(selectedInferred.pokemon.toLowerCase(), selectedInferred);
  }

  const coveredAdds = new Set(adds.map((action) => action.pokemon.toLowerCase()));
  if (!mergeOptions.skipProseAdds) {
    for (const inferred of parseAddPokemonActionsFromReply(reply, team)) {
      if (coveredAdds.has(inferred.pokemon.toLowerCase()) || excludedSpecies.has(inferred.pokemon.toLowerCase())) continue;
      if (!shouldKeepAssistAdd(inferred, mergeOptions)) continue;
      const finalized = finalizeAddPokemonAction(
        inferred,
        reply,
        mentions,
        requireCompleteSets,
        conversationText,
        fillMissingSets,
      );
      if (!finalized) continue;
      adds.push(finalized);
      coveredAdds.add(finalized.pokemon.toLowerCase());
    }
  }

  for (const [species, action] of [...updateBySpecies.entries()]) {
    if (teamSpecies.has(species)) continue;
    if (coveredAdds.has(species)) {
      updateBySpecies.delete(species);
      continue;
    }
    const { type: _type, ...fields } = action;
    const addAction = { type: "add_pokemon" as const, ...fields };
    if (!shouldKeepAssistAdd(addAction, mergeOptions)) {
      updateBySpecies.delete(species);
      continue;
    }
    const finalized = finalizeAddPokemonAction(
      addAction,
      reply,
      mentions,
      requireCompleteSets,
      conversationText,
      fillMissingSets,
    );
    if (!finalized) {
      updateBySpecies.delete(species);
      continue;
    }
    adds.push(finalized);
    updateBySpecies.delete(species);
    coveredAdds.add(species);
  }

  return [...enforceItemClauseOnActions([...others, ...updateBySpecies.values(), ...adds], team)];
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

const SPREAD_TRIM_PRIORITY: StatKey[] = ["HP", "Def", "SpD", "SpA", "Atk", "Spe"];

export function sanitizeActionSpread(rawEvs: Partial<Record<StatKey, number>>) {
  const evs = { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 } satisfies Record<StatKey, number>;
  for (const stat of STAT_KEYS) {
    const value = rawEvs[stat] ?? 0;
    if (!Number.isFinite(value) || value < 0) return null;
    evs[stat] = Math.min(CHAMPIONS_STAT_POINT_MAX, Math.round(value));
  }

  let total = Object.values(evs).reduce((sum, value) => sum + value, 0);
  while (total > CHAMPIONS_STAT_POINT_TOTAL) {
    const trimStat = SPREAD_TRIM_PRIORITY.find((stat) => evs[stat] > 0);
    if (!trimStat) return null;
    evs[trimStat] -= 1;
    total -= 1;
  }

  return evs;
}

export function spreadWasAdjusted(rawEvs: Partial<Record<StatKey, number>> | undefined) {
  if (!rawEvs) return false;
  const normalized = normalizeActionSpread(rawEvs);
  if (normalized) return false;
  const sanitized = sanitizeActionSpread(rawEvs);
  if (!sanitized) return false;
  return STAT_KEYS.some((stat) => (rawEvs[stat] ?? 0) !== sanitized[stat]);
}

export function resolveSetChanges(
  action: BuildAssistSetSuggestion,
  pokemon: typeof POKEMON[number],
): Partial<PokemonBuild> {
  const suggestedMoves = action.moves?.filter(Boolean).slice(0, 4)
    .map((move) => matchCatalogMove(move, pokemon.moves))
    .filter((move): move is string => Boolean(move)) ?? [];
  const megaFormName = action.megaForm
    ?? (action.item ? findMegaFormByItem(pokemon, action.item)?.name : undefined);
  const legalAbilities = legalAbilitiesForSet(pokemon, megaFormName);
  const ability = action.ability && legalAbilities.includes(action.ability) ? action.ability : undefined;
  const item = action.item && pokemon.items.includes(action.item) ? action.item : undefined;
  const nature = action.nature && ALL_NATURES.includes(action.nature) ? action.nature : undefined;
  const evs = action.evs ? sanitizeActionSpread(action.evs) ?? normalizeActionSpread(action.evs) ?? undefined : undefined;

  return {
    item,
    ability,
    nature,
    megaForm: megaFormName,
    moves: suggestedMoves.length ? [...suggestedMoves, "", "", "", ""].slice(0, 4) : undefined,
    evs,
  };
}

export function resolveAddPokemonChanges(
  action: Extract<BuildAssistAction, { type: "add_pokemon" }>,
  pokemon: typeof POKEMON[number],
): Partial<PokemonBuild> {
  return resolveSetChanges(action, pokemon);
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

export const BUILD_ASSIST_VGC_STARTER = "Teach me about VGC — where do I start?";

export const BUILD_ASSIST_STARTERS = [
  "What should I add next?",
  "What is this team missing?",
  BUILD_ASSIST_VGC_STARTER,
  "Tighten this set.",
] as const;
