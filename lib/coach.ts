import optionDetails from "../data/champions-options.json";
import {
  CHAMPIONS_STAT_POINT_MAX,
  CHAMPIONS_STAT_POINT_TOTAL,
  applyBattleStatModifiers,
  applyStatStage,
  calculateStat,
  statStageMultiplier,
  MegaForm,
  POKEMON,
  PokemonBuild,
  PokemonData,
  StatKey,
} from "./pokemon";

type MoveDetails = {
  description?: string;
  category?: string;
  power?: number | null;
  type?: string;
};

type CoachPokemon = PokemonData & {
  baseSpecies: string;
  megaForm?: string;
  activeAbility?: string;
};

type MentionedPokemon = CoachPokemon & { position: number };
type Weather = "" | "Sun" | "Rain" | "Sand" | "Snow";
type Terrain = "" | "Electric" | "Grassy" | "Psychic" | "Misty";
type TargetingMode = "single" | "multiple";
type BattleConditions = {
  weather: Weather;
  terrain: Terrain;
  targeting: TargetingMode;
  criticalHit: boolean;
};

export type CoachMode = "defensive" | "offensive";

export type CoachRecommendation = {
  label: string;
  outcomeChance: number;
  successRolls: number;
  item: string;
  hpPoints: number;
  defensePoints: number;
  attackPoints: number;
  nature: string;
  hp: number;
  defense: number;
  attack: number;
  damage: [number, number];
  damagePercent: [number, number];
  pointsUsed: number;
};

export type CoachDamageRange = {
  moveName: string;
  attackerName: string;
  defenderName: string;
  damage: [number, number];
  damagePercent: [number, number];
  targetHp: number;
  outcomeChance: number;
};

export type CoachQuickCheck = {
  label: string;
  title: string;
  value: string;
  verdict: string;
  outcomeLabel?: "Faster" | "Slower" | "Tie";
  meta: Array<{ label: string; value: string }>;
};

export type CoachSearchScope = "stats" | "nature" | "item" | "all";

export type CoachFollowUp = {
  scope: CoachSearchScope;
  label: string;
  description: string;
};

export type CoachSpeedContext = {
  subjectName: string;
  opponentName: string;
};

export type CoachAnswer = {
  ok: boolean;
  mode: CoachMode;
  title: string;
  summary: string;
  intro?: string;
  prompt?: string;
  assumptions: string[];
  recommendations: CoachRecommendation[];
  followUps?: CoachFollowUp[];
  searchScope?: CoachSearchScope;
  awaitingScope?: boolean;
  targetBuildId?: string;
  defenseStat?: "Def" | "SpD";
  attackStat?: "Atk" | "SpA";
  targetHp?: number;
  currentRange?: CoachDamageRange;
  currentCheck?: CoachQuickCheck;
  speedContext?: CoachSpeedContext;
};

export function baseCoachQuestion(question: string) {
  const marker = "\nFollow-up constraint:";
  const index = question.indexOf(marker);
  const base = index >= 0 ? question.slice(0, index).trim() : question.trim();
  return base
    .replace(/\ba\s+max(?:imum|ed)?\s+(?:speed|spe)\s+/gi, "")
    .replace(/\bmax(?:imum|ed)?\s+(?:speed|spe)\s+/gi, "");
}

export function parseSearchScope(question: string): CoachSearchScope | undefined {
  const matches = [...question.toLowerCase().matchAll(/follow-up constraint:\s*(stats|stat points|nature|natures|item|items|held item|all|everything)(?:\s+only)?/g)];
  const last = matches[matches.length - 1];
  if (!last) return undefined;
  const token = last[1];
  if (token.startsWith("stat")) return "stats";
  if (token.startsWith("nature")) return "nature";
  if (token.startsWith("item") || token.startsWith("held")) return "item";
  return "all";
}

export function coachQuestionWithScope(question: string, scope: CoachSearchScope) {
  return `${baseCoachQuestion(question)}\nFollow-up constraint: ${scope}`;
}

const MOVES = optionDetails.moves as Record<string, MoveDetails>;
const ALL_ITEMS = new Set(Object.keys(optionDetails.items as Record<string, unknown>));
const ALL_ABILITIES = new Set(Object.keys(optionDetails.abilities as Record<string, unknown>));

const OFFENSIVE_ITEMS = ["", "Life Orb", "Muscle Band", "Wise Glasses", "Choice Band", "Choice Specs"];
const TYPE_BOOST_ITEMS: Record<string, string[]> = {
  Normal: ["Silk Scarf"],
  Fire: ["Charcoal"],
  Water: ["Mystic Water"],
  Electric: ["Magnet", "Zap Plate"],
  Grass: ["Miracle Seed"],
  Ice: ["Never-Melt Ice"],
  Fighting: ["Black Belt"],
  Poison: ["Poison Barb"],
  Ground: ["Soft Sand"],
  Flying: ["Sharp Beak"],
  Psychic: ["Twisted Spoon"],
  Bug: ["Silver Powder"],
  Rock: ["Hard Stone"],
  Ghost: ["Spell Tag"],
  Dragon: ["Dragon Fang"],
  Dark: ["Black Glasses"],
  Steel: ["Metal Coat"],
  Fairy: ["Pixie Plate"],
};

const TYPE_CHART: Record<string, Partial<Record<string, number>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

const BERRIES: Record<string, string> = {
  Fire: "Occa Berry", Water: "Passho Berry", Electric: "Wacan Berry", Grass: "Rindo Berry",
  Ice: "Yache Berry", Fighting: "Chople Berry", Poison: "Kebia Berry", Ground: "Shuca Berry",
  Flying: "Coba Berry", Psychic: "Payapa Berry", Bug: "Tanga Berry", Rock: "Charti Berry",
  Ghost: "Kasib Berry", Dragon: "Haban Berry", Dark: "Colbur Berry", Steel: "Babiri Berry", Fairy: "Roseli Berry",
};

const WEATHER_FROM_ABILITY: Record<string, Weather> = {
  Drought: "Sun",
  "Orichalcum Pulse": "Sun",
  Drizzle: "Rain",
  "Sand Stream": "Sand",
  "Snow Warning": "Snow",
};

const TERRAIN_FROM_ABILITY: Record<string, Terrain> = {
  "Electric Surge": "Electric",
  "Hadron Engine": "Electric",
  "Grassy Surge": "Grassy",
  "Psychic Surge": "Psychic",
  "Misty Surge": "Misty",
};

const TYPE_CONVERSION_ABILITIES: Record<string, { from: string; to: string; power: number }> = {
  Aerilate: { from: "Normal", to: "Flying", power: 1.2 },
  Galvanize: { from: "Normal", to: "Electric", power: 1.2 },
  Pixilate: { from: "Normal", to: "Fairy", power: 1.2 },
  Refrigerate: { from: "Normal", to: "Ice", power: 1.2 },
};

const SOUND_MOVES = new Set([
  "Alluring Voice", "Boomburst", "Bug Buzz", "Clanging Scales", "Clangorous Soulblaze",
  "Disarming Voice", "Echoed Voice", "Eerie Spell", "Hyper Voice", "Metal Sound",
  "Overdrive", "Parting Shot", "Psychic Noise", "Relic Song", "Round", "Snarl",
  "Sparkling Aria", "Torch Song", "Uproar",
]);

const EXTRA_SPREAD_MOVES = new Set([
  "Burning Jealousy",
]);

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STOPWORDS = new Set([
  "a", "an", "the", "my", "this", "that", "with", "from", "into", "using", "use", "want", "wants",
  "max", "maximum", "min", "minimum", "defense", "defence", "attack", "special", "physical", "nature",
  "item", "survive", "kill", "ko", "ohko", "build", "make", "can", "could", "should", "would",
  "will", "does", "did", "have", "has", "need", "help", "tell", "what", "which", "how", "about",
]);

function isFuzzyTokenMatch(token: string, name: string) {
  if (STOPWORDS.has(token) || token.length < 5) return false;
  return Math.abs(token.length - name.length) <= 1 && editDistance(normalize(token), name) <= 1;
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[b.length];
}

function mentionedPokemon(question: string): MentionedPokemon[] {
  const normalizedQuestion = normalize(question);
  const lowerQuestion = question.toLowerCase();
  const tokenMatches = [...lowerQuestion.matchAll(/[a-z0-9-]+/g)];
  return POKEMON.map((pokemon) => {
    const name = normalize(pokemon.name);
    const literalPosition = lowerQuestion.indexOf(pokemon.name.toLowerCase());
    if (literalPosition >= 0) return { pokemon, position: literalPosition };
    const exactPosition = normalizedQuestion.indexOf(name);
    const fuzzyToken = name.length >= 5
      ? tokenMatches.find((match) => isFuzzyTokenMatch(match[0], name))
      : undefined;
    if (fuzzyToken) return { pokemon, position: fuzzyToken.index };
    if (exactPosition >= 0) return { pokemon, position: exactPosition };
    return null;
  }).filter((entry): entry is { pokemon: PokemonData; position: number } => Boolean(entry))
    .sort((a, b) => a.position - b.position)
    .map((entry) => ({ ...resolveMegaForm(question, entry.pokemon), position: entry.position }));
}

function megaDisplayName(pokemon: PokemonData, formName: string) {
  const marker = `${pokemon.name}-Mega`;
  if (!formName.startsWith(marker)) return formName.replace(/-Mega(?:-|$)/, " Mega ").trim();
  const suffix = formName.slice(marker.length).replace(/-/g, " ").trim();
  return `Mega ${pokemon.name}${suffix ? ` ${suffix}` : ""}`;
}

function megaAliases(pokemon: PokemonData, formName: string) {
  const marker = `${pokemon.name}-Mega`;
  const suffix = formName.startsWith(marker) ? normalize(formName.slice(marker.length)) : "";
  const base = normalize(pokemon.name);
  return [normalize(formName), `mega${base}${suffix}`, `${base}mega${suffix}`];
}

function resolveMegaForm(question: string, pokemon: PokemonData): CoachPokemon {
  const normalizedQuestion = normalize(question);
  const forms = pokemon.megaForms ?? [];
  const matchingForm = forms.find((form) => megaAliases(pokemon, form.name).some((alias) => normalizedQuestion.includes(alias)));
  const genericMegaMention = normalizedQuestion.includes(`mega${normalize(pokemon.name)}`)
    || normalizedQuestion.includes(`${normalize(pokemon.name)}mega`);
  const form = matchingForm ?? (genericMegaMention && forms.length === 1 ? forms[0] : undefined);
  if (!form) return { ...pokemon, baseSpecies: pokemon.name };
  return coachPokemonFromMegaForm(pokemon, form);
}

function coachPokemonFromMegaForm(pokemon: PokemonData, form: MegaForm): CoachPokemon {
  return {
    ...pokemon,
    name: megaDisplayName(pokemon, form.name),
    stats: form.stats,
    types: form.types,
    artwork: form.artwork,
    baseSpecies: pokemon.name,
    megaForm: form.name,
    activeAbility: form.ability,
  };
}

function questionSpecifiesMegaForm(question: string, speciesName: string) {
  const pokemon = POKEMON.find((entry) => entry.name === speciesName);
  if (!pokemon?.megaForms?.length) return false;
  const normalizedQuestion = normalize(question);
  if (pokemon.megaForms.some((form) => megaAliases(pokemon, form.name).some((alias) => normalizedQuestion.includes(alias)))) {
    return true;
  }
  return normalizedQuestion.includes(`mega${normalize(speciesName)}`)
    || normalizedQuestion.includes(`${normalize(speciesName)}mega`);
}

function applyBuildMegaForm(combatant: CoachPokemon, build: PokemonBuild): CoachPokemon {
  if (!build.megaForm) return combatant;
  const pokemon = POKEMON.find((entry) => entry.name === combatant.baseSpecies);
  const form = pokemon?.megaForms?.find((entry) => entry.name === build.megaForm);
  if (!form) return combatant;
  return coachPokemonFromMegaForm(pokemon!, form);
}

function enrichWithTeamBuild(combatant: CoachPokemon | undefined, team: PokemonBuild[], question: string) {
  if (!combatant) return undefined;
  const build = team.find((entry) => entry.species === combatant.baseSpecies);
  if (!build) return combatant;
  if (questionSpecifiesMegaForm(question, combatant.baseSpecies)) return combatant;
  const enriched = applyBuildMegaForm(combatant, build);
  return {
    ...enriched,
    activeAbility: enriched.megaForm ? enriched.activeAbility : build.ability || undefined,
  };
}

function ambiguousMegaMention(question: string) {
  const normalizedQuestion = normalize(question);
  return POKEMON.find((pokemon) => {
    const forms = pokemon.megaForms ?? [];
    if (forms.length < 2) return false;
    const genericMention = normalizedQuestion.includes(`mega${normalize(pokemon.name)}`)
      || normalizedQuestion.includes(`${normalize(pokemon.name)}mega`);
    const specificMention = forms.some((form) => megaAliases(pokemon, form.name).some((alias) => normalizedQuestion.includes(alias)));
    return genericMention && !specificMention;
  });
}

function isMoveBoundaryMatch(text: string, start: number, length: number) {
  const before = start > 0 ? text[start - 1] : " ";
  const after = start + length < text.length ? text[start + length] : " ";
  return !/[a-z0-9-]/i.test(before) && !/[a-z0-9-]/i.test(after);
}

function mentionedMove(question: string) {
  const lowerQuestion = question.toLowerCase();
  const exactMatches = Object.keys(MOVES).flatMap((move) => {
    const moveLower = move.toLowerCase();
    const positions: number[] = [];
    let index = lowerQuestion.indexOf(moveLower);
    while (index >= 0) {
      positions.push(index);
      index = lowerQuestion.indexOf(moveLower, index + 1);
    }
    return positions
      .filter((start) => isMoveBoundaryMatch(lowerQuestion, start, moveLower.length))
      .map((position) => ({ move, position, length: moveLower.length }));
  }).sort((a, b) => {
    const aDamaging = Boolean(MOVES[a.move]?.power && ["Physical", "Special"].includes(MOVES[a.move]?.category ?? ""));
    const bDamaging = Boolean(MOVES[b.move]?.power && ["Physical", "Special"].includes(MOVES[b.move]?.category ?? ""));
    return Number(bDamaging) - Number(aDamaging) || b.length - a.length || a.position - b.position;
  });
  if (exactMatches.length) return exactMatches[0].move;

  const pokemonTokens = new Set(
    mentionedPokemon(question).flatMap((pokemon) => [pokemon.name.toLowerCase(), pokemon.baseSpecies.toLowerCase()]),
  );
  const tokens = lowerQuestion.match(/[a-z0-9-]+/g) ?? [];
  return Object.keys(MOVES)
    .filter((move) => normalize(move).length >= 5)
    .sort((a, b) => b.length - a.length)
    .find((move) => tokens.some((token) => !pokemonTokens.has(token) && isFuzzyTokenMatch(token, normalize(move))));
}

function inferOffensiveMove(team: PokemonBuild[], attacker: CoachPokemon) {
  const build = team.find((entry) => entry.species === attacker.baseSpecies);
  if (!build) return undefined;
  const damaging = build.moves.filter((moveName) => {
    const move = MOVES[moveName];
    return move?.power && ["Physical", "Special"].includes(move.category ?? "");
  });
  return damaging.length === 1 ? damaging[0] : undefined;
}

function missingMovePrompt(team: PokemonBuild[], attacker: CoachPokemon, defender: CoachPokemon, mode: CoachMode) {
  const build = team.find((entry) => entry.species === attacker.baseSpecies);
  const damagingMoves = build?.moves.filter((moveName) => {
    const move = MOVES[moveName];
    return move?.power && ["Physical", "Special"].includes(move.category ?? "");
  }) ?? [];
  const subject = mode === "offensive" ? attacker.name : defender.name;
  const other = mode === "offensive" ? defender.name : attacker.name;
  if (mode === "offensive") {
    if (damagingMoves.length === 1) {
      return `Which move should ${subject} use to KO ${other}? Your set only has ${damagingMoves[0]} — say "KO ${other} with ${damagingMoves[0]}" to calc it.`;
    }
    if (damagingMoves.length > 1) {
      return `Which move should ${subject} use to KO ${other}? Your set has: ${damagingMoves.join(", ")}.`;
    }
    return `Which move should ${subject} use against ${other}? Try: "Can I KO ${other} with [move name]?"`;
  }
  if (damagingMoves.length === 1) {
    return `Which move from ${other} are you worried about? Try: "Can ${subject} survive ${other}'s ${damagingMoves[0]}?"`;
  }
  return `Which move from ${other} should ${subject} survive? Try: "Can ${subject} survive ${other}'s Thunderbolt?"`;
}

function mentionedItems(question: string) {
  return [...ALL_ITEMS]
    .filter((item) => question.toLowerCase().includes(item.toLowerCase()))
    .sort((a, b) => b.length - a.length);
}

function mentionedItemNear(question: string, pokemonName?: string) {
  const items = mentionedItems(question);
  if (!items.length) return "";
  if (!pokemonName) return items[0];
  const lower = question.toLowerCase();
  const nameIndex = lower.indexOf(pokemonName.toLowerCase());
  if (nameIndex < 0) return "";
  const window = lower.slice(nameIndex, nameIndex + pokemonName.length + 48);
  return items.find((item) => window.includes(item.toLowerCase())) ?? "";
}

function mentionedAbilities(question: string) {
  const lower = question.toLowerCase();
  return [...ALL_ABILITIES]
    .filter((ability) => lower.includes(ability.toLowerCase()))
    .sort((a, b) => b.length - a.length);
}

function resolveAbility(question: string, pokemon: CoachPokemon) {
  const mentioned = mentionedAbilities(question);
  const legal = mentioned.find((ability) =>
    ability === pokemon.activeAbility
    || pokemon.abilities.includes(ability)
    || pokemon.megaForm && pokemon.activeAbility === ability,
  );
  return legal || pokemon.activeAbility || "";
}

function explicitWeather(question: string): Weather | undefined {
  const lower = question.toLowerCase();
  if (/\b(?:no weather|clear weather)\b/.test(lower)) return "";
  if (/\b(?:sunny day|harsh sunlight|in (?:the )?sun|under (?:the )?sun|sunlight)\b/.test(lower)) return "Sun";
  if (/\b(?:rain dance|in (?:the )?rain|under (?:the )?rain|rainy weather)\b/.test(lower)) return "Rain";
  if (/\b(?:sandstorm|in (?:the )?sand)\b/.test(lower)) return "Sand";
  if (/\b(?:snow|snowscape|hail)\b/.test(lower)) return "Snow";
  return undefined;
}

function explicitTerrain(question: string): Terrain | undefined {
  const lower = question.toLowerCase();
  if (/\b(?:no terrain|without terrain)\b/.test(lower)) return "";
  if (/\belectric terrain\b/.test(lower)) return "Electric";
  if (/\bgrassy terrain\b/.test(lower)) return "Grassy";
  if (/\bpsychic terrain\b/.test(lower)) return "Psychic";
  if (/\bmisty terrain\b/.test(lower)) return "Misty";
  return undefined;
}

function isSpreadMove(moveName: string, move: MoveDetails) {
  return EXTRA_SPREAD_MOVES.has(moveName)
    || /foe\(s\)|hits foes|adjacent (?:foes|pokemon)|all adjacent/i.test(move.description ?? "");
}

export function moveIsSpread(moveName: string, move?: MoveDetails) {
  if (!move) return false;
  return isSpreadMove(moveName, move);
}

function targetingMode(question: string, moveName: string, move: MoveDetails): TargetingMode {
  if (!isSpreadMove(moveName, move)) return "single";
  const lower = question.toLowerCase();
  if (/\b(?:single|solo|one|1)\s+(?:target|pokemon|pokémon)\b|\bonly one (?:target|pokemon|pokémon)\b|\blast (?:target|pokemon|pokémon)\b|\b(?:target|hit) only one\b/.test(lower)) {
    return "single";
  }
  if (/\b(?:dual|double|two|2|both|multiple)\s+(?:targets?|pokemon|pokémon)\b|\bhits? both\b|\bspread damage\b/.test(lower)) {
    return "multiple";
  }
  return "multiple";
}

const EXPLICIT_NATURE_NAMES = [
  "Hardy", "Lonely", "Adamant", "Naughty", "Brave",
  "Bold", "Docile", "Impish", "Lax", "Relaxed",
  "Modest", "Mild", "Bashful", "Rash", "Quiet",
  "Calm", "Gentle", "Careful", "Quirky", "Sassy",
  "Timid", "Hasty", "Jolly", "Naive", "Serious",
] as const;

function explicitNature(question: string, pokemonName: string) {
  const escaped = pokemonName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedMatches = [...question.matchAll(new RegExp(`${escaped} has (\\w+) nature`, "gi"))];
  if (namedMatches.length) {
    const lastNature = namedMatches[namedMatches.length - 1][1];
    const match = EXPLICIT_NATURE_NAMES.find((nature) => nature.toLowerCase() === lastNature.toLowerCase());
    if (match) return match;
  }

  const lower = question.toLowerCase();
  let searchFrom = 0;
  let lastNature: string | undefined;
  while (searchFrom < lower.length) {
    const nameIndex = lower.indexOf(pokemonName.toLowerCase(), searchFrom);
    if (nameIndex < 0) break;
    const window = lower.slice(nameIndex, nameIndex + pokemonName.length + 96);
    const found = EXPLICIT_NATURE_NAMES.find((nature) =>
      new RegExp(`\\b${nature.toLowerCase()}\\s+nature\\b`).test(window),
    );
    if (found) lastNature = found;
    searchFrom = nameIndex + pokemonName.length;
  }
  return lastNature;
}

function explicitStatPoints(question: string, pokemonName: string, stat: StatKey) {
  const labels: Record<StatKey, string> = {
    HP: "hp",
    Atk: "atk|attack",
    Def: "def|defense",
    SpA: "spa|sp\\. atk|special attack",
    SpD: "spd|sp\\. def|special defense",
    Spe: "spe|speed",
  };
  const label = labels[stat];
  const escaped = pokemonName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedMatches = [...question.matchAll(new RegExp(`${escaped} has (\\d{1,2}) ${label} Stat Points`, "gi"))];
  if (namedMatches.length) {
    const last = namedMatches[namedMatches.length - 1];
    return Math.max(0, Math.min(CHAMPIONS_STAT_POINT_MAX, Number(last[1])));
  }

  const lower = question.toLowerCase();
  let searchFrom = 0;
  let lastValue: number | undefined;
  while (searchFrom < lower.length) {
    const nameIndex = lower.indexOf(pokemonName.toLowerCase(), searchFrom);
    if (nameIndex < 0) break;
    const window = lower.slice(nameIndex, nameIndex + pokemonName.length + 260);
    const patterns = [
      new RegExp(`\\b(\\d{1,2})\\s*(?:${label})\\s*(?:stat\\s*)?points?\\b`, "i"),
      new RegExp(`\\b(?:${label})\\s*[:=]?\\s*(\\d{1,2})\\s*(?:stat\\s*)?points?\\b`, "i"),
    ];
    const match = patterns.map((pattern) => window.match(pattern)).find(Boolean);
    if (match) lastValue = Math.max(0, Math.min(CHAMPIONS_STAT_POINT_MAX, Number(match[1])));
    searchFrom = nameIndex + pokemonName.length;
  }
  return lastValue;
}

function inferredCondition<T extends string>(values: T[]) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length === 1 ? unique[0] : "";
}

function explicitCriticalHit(question: string): boolean | undefined {
  const lower = question.toLowerCase();
  if (/\b(?:no critical|without critical|non[- ]?critical)\b/.test(lower)) return false;
  if (/\b(?:on a critical hit|critical hit|crit(?:ical)? hit|with a crit)\b/.test(lower)) return true;
  return undefined;
}

export type SpeedControlSide = "" | "tailwind" | "icy-wind";

export type FieldModifiers = {
  trickRoom: boolean;
  subjectSpeedControl: SpeedControlSide;
  opponentSpeedControl: SpeedControlSide;
  subjectStatStage: number;
  opponentStatStage: number;
};

function speedControlStage(control: SpeedControlSide): number {
  if (control === "tailwind") return 2;
  if (control === "icy-wind") return -1;
  return 0;
}

function explicitTrickRoom(question: string): boolean | undefined {
  const lower = question.toLowerCase();
  if (/\b(?:no trick room|without trick room)\b/.test(lower)) return false;
  if (/\b(?:under|in|with|during) trick room\b|\btrick room (?:is )?(?:up|active)\b/.test(lower)) return true;
  return undefined;
}

function explicitSideSpeedControl(question: string, side: "subject" | "opponent", opponentName: string): SpeedControlSide | undefined {
  const lower = question.toLowerCase();
  if (side === "subject") {
    if (/\btailwind on my side\b/.test(lower)) return "tailwind";
    if (/\bicy wind on my side\b/.test(lower)) return "icy-wind";
    return undefined;
  }
  const escaped = opponentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`tailwind on (?:their|the opponent(?:'s)?|${escaped}(?:'s)?) side`, "i").test(question)) return "tailwind";
  if (new RegExp(`icy wind on (?:their|the opponent(?:'s)?|${escaped}(?:'s)?) side`, "i").test(question)) return "icy-wind";
  return undefined;
}

function explicitNamedStatStage(question: string, pokemonName: string): number | undefined {
  const escaped = pokemonName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = question.match(new RegExp(`${escaped} has ([+-]\\d+)\\s+(?:stages of )?(Atk|SpA|Def|SpD|Spe|Attack|Special Attack|Defense|Special Defense|Speed)`, "i"));
  if (!match) return undefined;
  return Math.max(-6, Math.min(6, Number(match[1])));
}

export function fieldModifiers(question: string, subjectName: string, opponentName: string): FieldModifiers {
  return {
    trickRoom: explicitTrickRoom(question) ?? false,
    subjectSpeedControl: explicitSideSpeedControl(question, "subject", opponentName) ?? "",
    opponentSpeedControl: explicitSideSpeedControl(question, "opponent", opponentName) ?? "",
    subjectStatStage: explicitNamedStatStage(question, subjectName) ?? 0,
    opponentStatStage: explicitNamedStatStage(question, opponentName) ?? 0,
  };
}

function stagedDamageStats(
  mode: CoachMode,
  attack: number,
  defense: number,
  mods: FieldModifiers,
) {
  const attackStage = mode === "offensive" ? mods.subjectStatStage : mods.opponentStatStage;
  const defenseStage = mode === "offensive" ? mods.opponentStatStage : mods.subjectStatStage;
  return {
    attack: applyStatStage(attack, attackStage),
    defense: applyStatStage(defense, defenseStage),
  };
}

function fieldAssumptionLine(mods: FieldModifiers): string {
  const parts: string[] = [];
  if (mods.trickRoom) parts.push("Trick Room active");
  if (mods.subjectSpeedControl === "tailwind") parts.push("Tailwind on your side");
  if (mods.subjectSpeedControl === "icy-wind") parts.push("Icy Wind on your side");
  if (mods.opponentSpeedControl === "tailwind") parts.push("Tailwind on their side");
  if (mods.opponentSpeedControl === "icy-wind") parts.push("Icy Wind on their side");
  if (mods.subjectStatStage) parts.push(`Your side at ${mods.subjectStatStage > 0 ? "+" : ""}${mods.subjectStatStage} on the relevant stat`);
  if (mods.opponentStatStage) parts.push(`Their side at ${mods.opponentStatStage > 0 ? "+" : ""}${mods.opponentStatStage} on the relevant stat`);
  return parts.length ? parts.join(". ") + "." : "No speed control or stat stages applied.";
}

function battleConditions(
  question: string,
  moveName: string,
  move: MoveDetails,
  attackerAbility: string,
  defenderAbility: string,
): BattleConditions {
  const weather = explicitWeather(question);
  const terrain = explicitTerrain(question);
  return {
    weather: weather ?? inferredCondition([
      WEATHER_FROM_ABILITY[attackerAbility] ?? "",
      WEATHER_FROM_ABILITY[defenderAbility] ?? "",
    ]),
    terrain: terrain ?? inferredCondition([
      TERRAIN_FROM_ABILITY[attackerAbility] ?? "",
      TERRAIN_FROM_ABILITY[defenderAbility] ?? "",
    ]),
    targeting: targetingMode(question, moveName, move),
    criticalHit: explicitCriticalHit(question) ?? false,
  };
}

function offensiveItemOptions(move: MoveDetails, lockedItem?: string) {
  if (lockedItem !== undefined) return [lockedItem];
  const category = move.category ?? "";
  const moveType = move.type ?? "";
  const options = new Set<string>([""]);
  OFFENSIVE_ITEMS.forEach((item) => options.add(item));
  TYPE_BOOST_ITEMS[moveType]?.forEach((item) => {
    if (ALL_ITEMS.has(item)) options.add(item);
  });
  return [...options].filter((item) => !item || ALL_ITEMS.has(item)).filter((item) => {
    if (!item) return true;
    if (item === "Muscle Band" || item === "Choice Band") return category === "Physical";
    if (item === "Wise Glasses" || item === "Choice Specs") return category === "Special";
    return true;
  });
}

function defensiveItemOptions(move: MoveDetails, defenderTypes: string[], lockedItem?: string) {
  if (lockedItem !== undefined) return [lockedItem];
  const options = new Set<string>([""]);
  const effectiveness = typeEffectiveness(move.type ?? "", defenderTypes);
  if (effectiveness > 1) {
    const berry = BERRIES[move.type ?? ""];
    if (berry && ALL_ITEMS.has(berry)) options.add(berry);
  }
  if (move.category === "Special" && ALL_ITEMS.has("Assault Vest")) options.add("Assault Vest");
  if (ALL_ITEMS.has("Focus Sash")) options.add("Focus Sash");
  return [...options];
}

function itemPreferenceCost(item: string) {
  if (!item) return 0;
  if (item.endsWith(" Berry")) return 1;
  if (item === "Focus Sash" || item === "Muscle Band" || item === "Wise Glasses") return 1;
  if (item === "Assault Vest" || item === "Choice Band" || item === "Choice Specs") return 2;
  if (item === "Life Orb") return 3;
  return 2;
}

function formatItemLabel(item: string) {
  return item || "No item";
}

function describeFixedItem(question: string, pokemon: CoachPokemon, build?: PokemonBuild) {
  const item = mentionedItemNear(question, pokemon.name) || build?.item;
  if (item) return item;
  if (pokemon.megaForm) return "required Mega Stone";
  return "";
}

function detectCoachMode(question: string): CoachMode {
  const lower = question.toLowerCase();
  const offensive = /\b(?:kill|kills|ko|ohko|2hko|one[- ]?shot|take out|take down|eliminate|defeat|does .+ kill|can .+ kill|will .+ kill|could .+ kill|does this kill|can this kill|can it kill|oh[- ]?ko)\b/.test(lower);
  const defensive = /\b(?:survive|survives|live|lives|tank|tanks|withstand|endure|eat|absorb|take a|take the|build .+ to survive|how .+ survive)\b/.test(lower);
  if (offensive && !defensive) return "offensive";
  return "defensive";
}

function keepsCurrentItem(question: string) {
  return /\b(?:without\s+(?:changing|switching|replacing)|keep(?:ing)?|same)\s+(?:(?:an|the|my|current)\s+)?(?:held\s+)?item\b|\bdo\s+not\s+change\s+(?:(?:the|my)\s+)?item\b|\bdon't\s+change\s+(?:(?:the|my)\s+)?item\b/i.test(question);
}

function usesSelectedReference(question: string) {
  return /\b(?:my|this|current|selected)\s+pok[eé]mon\b|\b(?:can|will|would|could|should)\s+(?:this|it)\b|\b(?:build|make|spread|optimize)\s+(?:this|it)\b/i.test(question);
}

function typeEffectiveness(moveType: string, defenderTypes: string[]) {
  return defenderTypes.reduce((modifier, type) => modifier * (TYPE_CHART[moveType]?.[type] ?? 1), 1);
}

function boostedNature(stat: "Atk" | "SpA") {
  return stat === "SpA" ? "Modest" : "Adamant";
}

function defensiveNature(stat: "Def" | "SpD", pokemon: PokemonData) {
  if (stat === "SpD") return pokemon.stats.Atk >= pokemon.stats.SpA ? "Careful" : "Calm";
  return pokemon.stats.Atk >= pokemon.stats.SpA ? "Impish" : "Bold";
}

function isGrounded(pokemon: PokemonData, ability: string) {
  return !pokemon.types.includes("Flying") && ability !== "Levitate";
}

function abilityIsIgnored(attackerAbility: string) {
  return ["Mold Breaker", "Teravolt", "Turboblaze"].includes(attackerAbility);
}

function abilityImmunity(moveType: string, defenderAbility: string) {
  if (moveType === "Ground" && ["Levitate", "Earth Eater"].includes(defenderAbility)) return true;
  if (moveType === "Fire" && ["Flash Fire", "Well-Baked Body"].includes(defenderAbility)) return true;
  if (moveType === "Water" && ["Dry Skin", "Storm Drain", "Water Absorb"].includes(defenderAbility)) return true;
  if (moveType === "Electric" && ["Lightning Rod", "Motor Drive", "Volt Absorb"].includes(defenderAbility)) return true;
  if (moveType === "Grass" && defenderAbility === "Sap Sipper") return true;
  return false;
}

function weatherMoveType(weather: Weather) {
  if (!weather) return "Normal";
  return {
    Sun: "Fire",
    Rain: "Water",
    Sand: "Rock",
    Snow: "Ice",
  }[weather];
}

function terrainMoveType(terrain: Terrain) {
  if (!terrain) return "Normal";
  return {
    Electric: "Electric",
    Grassy: "Grass",
    Psychic: "Psychic",
    Misty: "Fairy",
  }[terrain];
}

function moveTypeForCalc(
  moveName: string,
  move: MoveDetails,
  attacker: PokemonData,
  attackerAbility: string,
  conditions: BattleConditions,
  weather: Weather = conditions.weather,
) {
  if (moveName === "Weather Ball" && weather) return weatherMoveType(weather);
  if (moveName === "Terrain Pulse" && conditions.terrain && isGrounded(attacker, attackerAbility)) {
    return terrainMoveType(conditions.terrain);
  }
  if (attackerAbility === "Liquid Voice" && SOUND_MOVES.has(moveName)) return "Water";
  const conversion = TYPE_CONVERSION_ABILITIES[attackerAbility];
  return conversion?.from === move.type ? conversion.to : move.type ?? "";
}

function damageRolls({ attacker, defender, moveName, move, attack, defense, attackerItem, defenderItem, attackerAbility, defenderAbility, conditions }: {
  attacker: PokemonData;
  defender: PokemonData;
  moveName: string;
  move: MoveDetails;
  attack: number;
  defense: number;
  attackerItem?: string;
  defenderItem?: string;
  attackerAbility: string;
  defenderAbility: string;
  conditions: BattleConditions;
}) {
  const weatherSuppressed = ["Air Lock", "Cloud Nine"].includes(attackerAbility)
    || ["Air Lock", "Cloud Nine"].includes(defenderAbility);
  const weather = weatherSuppressed ? "" : conditions.weather;
  const ignoresDefenderAbility = abilityIsIgnored(attackerAbility);
  const activeDefenderAbility = ignoresDefenderAbility ? "" : defenderAbility;
  const attackerGrounded = isGrounded(attacker, attackerAbility);
  const defenderGrounded = isGrounded(defender, activeDefenderAbility);

  let moveType = moveTypeForCalc(moveName, move, attacker, attackerAbility, conditions, weather);
  let power = move.power ?? 0;
  if (moveName === "Weather Ball" && weather) {
    power *= 2;
  } else if (moveName === "Terrain Pulse" && conditions.terrain && attackerGrounded) {
    power *= 2;
  } else if (attackerAbility === "Liquid Voice" && SOUND_MOVES.has(moveName)) {
  } else {
    const conversion = TYPE_CONVERSION_ABILITIES[attackerAbility];
    if (conversion?.from === moveType) {
      moveType = conversion.to;
      power = Math.floor(power * conversion.power);
    }
  }

  let adjustedAttack = attack;
  let adjustedDefense = defense;
  let adjustedPower = power;
  if (attackerItem === "Wise Glasses" && move.category === "Special") adjustedAttack = Math.floor(attack * 1.1);
  if (attackerItem === "Muscle Band" && move.category === "Physical") adjustedAttack = Math.floor(attack * 1.1);
  if (attackerItem === "Choice Specs" && move.category === "Special") adjustedAttack = Math.floor(attack * 1.5);
  if (attackerItem === "Choice Band" && move.category === "Physical") adjustedAttack = Math.floor(attack * 1.5);
  if (defenderItem === "Assault Vest" && move.category === "Special") adjustedDefense = Math.floor(defense * 1.5);
  if (TYPE_BOOST_ITEMS[moveType]?.includes(attackerItem ?? "")) adjustedPower = Math.floor(adjustedPower * 1.2);

  if (move.category === "Physical" && ["Huge Power", "Pure Power"].includes(attackerAbility)) adjustedAttack *= 2;
  if (move.category === "Physical" && ["Gorilla Tactics", "Hustle"].includes(attackerAbility)) adjustedAttack = Math.floor(adjustedAttack * 1.5);
  if (move.category === "Special" && attackerAbility === "Solar Power" && weather === "Sun") adjustedAttack = Math.floor(adjustedAttack * 1.5);
  if (move.category === "Physical" && attackerAbility === "Orichalcum Pulse" && weather === "Sun") adjustedAttack = Math.floor(adjustedAttack * 4 / 3);
  if (move.category === "Special" && attackerAbility === "Hadron Engine" && conditions.terrain === "Electric") adjustedAttack = Math.floor(adjustedAttack * 4 / 3);
  if (move.category === "Physical" && activeDefenderAbility === "Tablets of Ruin") adjustedAttack = Math.floor(adjustedAttack * 0.75);
  if (move.category === "Special" && activeDefenderAbility === "Vessel of Ruin") adjustedAttack = Math.floor(adjustedAttack * 0.75);

  if (move.category === "Physical" && attackerAbility === "Sword of Ruin") adjustedDefense = Math.floor(adjustedDefense * 0.75);
  if (move.category === "Special" && attackerAbility === "Beads of Ruin") adjustedDefense = Math.floor(adjustedDefense * 0.75);
  if (move.category === "Physical" && activeDefenderAbility === "Fur Coat") adjustedDefense *= 2;
  if (move.category === "Special" && activeDefenderAbility === "Ice Scales") adjustedDefense *= 2;
  if (move.category === "Special" && weather === "Sand" && defender.types.includes("Rock")) adjustedDefense = Math.floor(adjustedDefense * 1.5);
  if (move.category === "Physical" && weather === "Snow" && defender.types.includes("Ice")) adjustedDefense = Math.floor(adjustedDefense * 1.5);

  if (attackerAbility === "Technician" && adjustedPower <= 60) adjustedPower = Math.floor(adjustedPower * 1.5);
  if (attackerAbility === "Punk Rock" && SOUND_MOVES.has(moveName)) adjustedPower = Math.floor(adjustedPower * 1.3);
  if (attackerAbility === "Transistor" && moveType === "Electric") adjustedPower = Math.floor(adjustedPower * 1.3);
  if (attackerAbility === "Dragon's Maw" && moveType === "Dragon") adjustedPower = Math.floor(adjustedPower * 1.5);
  if (attackerAbility === "Steelworker" && moveType === "Steel") adjustedPower = Math.floor(adjustedPower * 1.5);
  if (attackerAbility === "Rocky Payload" && moveType === "Rock") adjustedPower = Math.floor(adjustedPower * 1.5);
  if (attackerAbility === "Water Bubble" && moveType === "Water") adjustedPower *= 2;
  if (attackerAbility === "Sand Force" && weather === "Sand" && ["Rock", "Ground", "Steel"].includes(moveType)) adjustedPower = Math.floor(adjustedPower * 1.3);

  if (weather === "Sun") {
    if (moveType === "Fire") adjustedPower = Math.floor(adjustedPower * 1.5);
    if (moveType === "Water") adjustedPower = moveName === "Hydro Steam"
      ? Math.floor(adjustedPower * 1.5)
      : Math.floor(adjustedPower * 0.5);
  }
  if (weather === "Rain") {
    if (moveType === "Water") adjustedPower = Math.floor(adjustedPower * 1.5);
    if (moveType === "Fire") adjustedPower = Math.floor(adjustedPower * 0.5);
  }
  if (["Solar Beam", "Solar Blade"].includes(moveName) && weather && weather !== "Sun") {
    adjustedPower = Math.floor(adjustedPower * 0.5);
  }

  if (attackerGrounded) {
    if (conditions.terrain === "Electric" && moveType === "Electric") adjustedPower = Math.floor(adjustedPower * 1.3);
    if (conditions.terrain === "Grassy" && moveType === "Grass") adjustedPower = Math.floor(adjustedPower * 1.3);
    if (conditions.terrain === "Psychic" && moveType === "Psychic") adjustedPower = Math.floor(adjustedPower * 1.3);
  }
  if (moveName === "Rising Voltage" && conditions.terrain === "Electric" && defenderGrounded) adjustedPower *= 2;
  if (moveName === "Expanding Force" && conditions.terrain === "Psychic" && attackerGrounded) adjustedPower = Math.floor(adjustedPower * 1.5);
  if (moveName === "Psyblade" && conditions.terrain === "Electric") adjustedPower = Math.floor(adjustedPower * 1.5);
  if (moveName === "Misty Explosion" && conditions.terrain === "Misty" && attackerGrounded) adjustedPower = Math.floor(adjustedPower * 1.5);

  const baseDamage = Math.floor(Math.floor((22 * adjustedPower * adjustedAttack) / adjustedDefense) / 50) + 2;
  const spreadAdjustedDamage = isSpreadMove(moveName, move) && conditions.targeting === "multiple"
    ? Math.floor(baseDamage * 0.75)
    : baseDamage;
  const hasStab = attacker.types.includes(moveType);
  const stab = hasStab ? attackerAbility === "Adaptability" ? 2 : 1.5 : 1;
  const effectiveness = typeEffectiveness(moveType, defender.types);
  return Array.from({ length: 16 }, (_, index) => {
    if (
      effectiveness === 0
      || abilityImmunity(moveType, activeDefenderAbility)
      || activeDefenderAbility === "Wonder Guard" && effectiveness <= 1
    ) return 0;
    let damage = Math.floor(spreadAdjustedDamage * (85 + index) / 100);
    if (stab > 1) damage = Math.floor(damage * stab + 0.5);
    if (effectiveness >= 1) damage *= effectiveness;
    else damage = Math.floor(damage * effectiveness);
    if (attackerAbility === "Tinted Lens" && effectiveness > 0 && effectiveness < 1) damage *= 2;
    if (attackerAbility === "Neuroforce" && effectiveness > 1) damage = Math.floor(damage * 1.25);
    if (["Filter", "Prism Armor", "Solid Rock"].includes(activeDefenderAbility) && effectiveness > 1) damage = Math.floor(damage * 0.75);
    if (["Multiscale", "Shadow Shield"].includes(activeDefenderAbility)) damage = Math.floor(damage * 0.5);
    if (activeDefenderAbility === "Punk Rock" && SOUND_MOVES.has(moveName)) damage = Math.floor(damage * 0.5);
    if (activeDefenderAbility === "Purifying Salt" && moveType === "Ghost") damage = Math.floor(damage * 0.5);
    if (activeDefenderAbility === "Thick Fat" && ["Fire", "Ice"].includes(moveType)) damage = Math.floor(damage * 0.5);
    if (activeDefenderAbility === "Heatproof" && moveType === "Fire") damage = Math.floor(damage * 0.5);
    if (activeDefenderAbility === "Water Bubble" && moveType === "Fire") damage = Math.floor(damage * 0.5);
    if (activeDefenderAbility === "Dry Skin" && moveType === "Fire") damage = Math.floor(damage * 1.25);
    if (conditions.terrain === "Misty" && defenderGrounded && moveType === "Dragon") damage = Math.floor(damage * 0.5);
    if (attackerItem === "Life Orb") damage = Math.floor(damage * 1.3 + 0.5);
    if (conditions.criticalHit) damage = Math.floor(damage * 1.5);
    if (effectiveness > 1 && defenderItem === BERRIES[moveType]) damage = Math.floor(damage * 0.5 + 0.5);
    return Math.max(1, damage);
  });
}

function currentDamageRange(
  mode: CoachMode,
  moveName: string,
  attacker: CoachPokemon,
  defender: CoachPokemon,
  rolls: number[],
  targetHp: number,
): CoachDamageRange {
  const low = Math.min(...rolls);
  const high = Math.max(...rolls);
  const successfulRolls = mode === "defensive"
    ? rolls.filter((damage) => damage < targetHp).length
    : rolls.filter((damage) => damage >= targetHp).length;
  return {
    moveName,
    attackerName: attacker.name,
    defenderName: defender.name,
    damage: [low, high],
    damagePercent: [Math.round(low / targetHp * 1000) / 10, Math.round(high / targetHp * 1000) / 10],
    targetHp,
    outcomeChance: successfulRolls / 16,
  };
}

function fail(message: string): CoachAnswer {
  return { ok: false, mode: "defensive", title: "I need one more detail", summary: message, assumptions: [], recommendations: [] };
}

function detectsSpeedCheck(question: string) {
  return /\b(?:outspeed|out[- ]?speed|faster than|speed check|outpace|move first)\b/i.test(question);
}

function speedNatureName(question: string, opponentName: string, build?: PokemonBuild) {
  return explicitNature(question, opponentName) ?? build?.nature ?? "Hardy";
}

function speedPoints(question: string, opponentName: string, build?: PokemonBuild) {
  const explicit = explicitStatPoints(question, opponentName, "Spe");
  if (explicit !== undefined) return explicit;
  return build?.evs.Spe ?? 0;
}

function effectiveSpeedForPokemon(
  pokemon: CoachPokemon,
  statPoints: number,
  nature: string,
  question: string,
  build: PokemonBuild | undefined,
  role: "subject" | "opponent",
  subjectName: string,
  opponentName: string,
) {
  const mods = fieldModifiers(question, subjectName, opponentName);
  const baseSpeed = calculateStat(pokemon.stats.Spe, statPoints, "Spe", nature);
  const speedControl = role === "subject" ? mods.subjectSpeedControl : mods.opponentSpeedControl;
  const statStage = (role === "subject" ? mods.subjectStatStage : mods.opponentStatStage) + speedControlStage(speedControl);
  const staged = applyStatStage(baseSpeed, statStage);
  const item = describeFixedItem(question, pokemon, build);
  const ability = resolveAbility(question, pokemon);
  const weather = explicitWeather(question) ?? "";
  const terrain = explicitTerrain(question) ?? "";
  return applyBattleStatModifiers("Spe", staged, { item, ability, weather, terrain });
}

function answerSpeedCheck(
  question: string,
  team: PokemonBuild[],
  subject: CoachPokemon | undefined,
  opponent: CoachPokemon | undefined,
): CoachAnswer {
  const normalizedQuestion = baseCoachQuestion(question);
  if (!subject) return fail("Name the Pokémon you are checking, or select it in the team editor first.");
  if (!opponent) return fail(`Tell me which Pokémon ${subject.name} should outspeed.`);

  const subjectBuild = team.find((entry) => entry.species === subject.baseSpecies);
  const opponentBuild = team.find((entry) => entry.species === opponent.baseSpecies);
  const subjectNature = subjectBuild?.nature || "Hardy";
  const opponentNature = speedNatureName(normalizedQuestion, opponent.name, opponentBuild);
  const subjectPoints = subjectBuild?.evs.Spe ?? 0;
  const opponentPoints = speedPoints(normalizedQuestion, opponent.name, opponentBuild);
  const mods = fieldModifiers(normalizedQuestion, subject.name, opponent.name);
  const subjectSpeed = effectiveSpeedForPokemon(subject, subjectPoints, subjectNature, normalizedQuestion, subjectBuild, "subject", subject.name, opponent.name);
  const opponentSpeed = effectiveSpeedForPokemon(opponent, opponentPoints, opponentNature, normalizedQuestion, opponentBuild, "opponent", subject.name, opponent.name);
  const margin = Math.abs(subjectSpeed - opponentSpeed);
  const doesOutspeed = mods.trickRoom ? subjectSpeed < opponentSpeed : subjectSpeed > opponentSpeed;
  const ties = subjectSpeed === opponentSpeed;
  const verdict = doesOutspeed
    ? `Yes — ${subject.name} ${mods.trickRoom ? "moves first under Trick Room" : "is faster"} by ${margin} point${margin === 1 ? "" : "s"}.`
    : ties
      ? `Not cleanly — both land at ${subjectSpeed} Speed, so it is a speed tie.`
      : `No — ${opponent.name} ${mods.trickRoom ? "moves first under Trick Room" : "is faster"} by ${margin} point${margin === 1 ? "" : "s"}.`;
  const summary = `${verdict} Your current ${subject.name} reaches ${subjectSpeed} Speed (${subjectPoints} Spe, ${subjectNature}), while ${opponent.name} reaches ${opponentSpeed} Speed (${opponentPoints} Spe, ${opponentNature}).`;

  return {
    ok: true,
    mode: "defensive",
    title: `Speed check: ${subject.name} vs ${opponent.name}`,
    summary,
    intro: summary,
    currentCheck: {
      label: "Speed Check",
      title: `${subject.name} vs ${opponent.name}`,
      value: `${subjectSpeed} vs ${opponentSpeed}`,
      verdict,
      outcomeLabel: ties ? "Tie" : doesOutspeed ? "Faster" : "Slower",
      meta: [
        { label: subject.name, value: `${subjectSpeed} Spe` },
        { label: opponent.name, value: `${opponentSpeed} Spe` },
        { label: "Margin", value: ties ? "Tie" : `${margin}` },
      ],
    },
    speedContext: {
      subjectName: subject.name,
      opponentName: opponent.name,
    },
    assumptions: [
      `${subject.name}: ${subjectPoints} Spe stat points, ${subjectNature} nature.`,
      `${opponent.name}: ${opponentPoints} Spe stat points, ${opponentNature} nature.`,
      fieldAssumptionLine(mods),
    ],
    recommendations: [],
  };
}

function describeOutcome(mode: CoachMode, chance: number) {
  const pct = Math.round(chance * 100);
  if (mode === "offensive") {
    if (chance >= 1) return "That is a guaranteed OHKO with your current build.";
    if (chance >= 0.75) return `That is a strong KO — about ${pct}% of rolls finish it.`;
    if (chance >= 0.5) return `That is roughly a coin flip — ${pct}% KO odds right now.`;
    if (chance > 0) return `It can KO sometimes (${pct}% of rolls), but it is not reliable yet.`;
    return "Your current build does not KO with this spread.";
  }
  if (chance >= 1) return "You survive every damage roll with your current build.";
  if (chance >= 0.75) return `You usually survive — about ${pct}% of rolls leave you standing.`;
  if (chance >= 0.5) return `It is close — you survive ${pct}% of the time as-is.`;
  if (chance > 0) return `Most rolls knock you out; you only survive ${pct}% right now.`;
  return "Your current build gets OHKO'd every time.";
}

function buildCurrentIntro(mode: CoachMode, range: CoachDamageRange, subjectName: string) {
  const [low, high] = range.damagePercent;
  const [damageLow, damageHigh] = range.damage;
  const outcome = describeOutcome(mode, range.outcomeChance);
  if (mode === "offensive") {
    return `With your current ${subjectName}, ${range.moveName} hits ${range.defenderName} for ${damageLow}–${damageHigh} damage (${low}–${high}% of its ${range.targetHp} HP). ${outcome}`;
  }
  return `With your current ${subjectName}, ${range.attackerName}'s ${range.moveName} deals ${damageLow}–${damageHigh} damage (${low}–${high}% of your ${range.targetHp} HP). ${outcome}`;
}

function buildFollowUps(mode: CoachMode, statLabel: "Atk" | "SpA" | "Def" | "SpD"): CoachFollowUp[] {
  const statWord = statLabel === "Atk" || statLabel === "SpA" ? `${statLabel} stat points` : `HP and ${statLabel} stat points`;
  return [
    {
      scope: "stats",
      label: "Stat points only",
      description: `Keep your nature and item — just move ${statWord}.`,
    },
    {
      scope: "nature",
      label: "Try a different nature",
      description: "Keep your held item and search boosting natures.",
    },
    {
      scope: "item",
      label: "Try a held item",
      description: "Keep your nature and look for a helpful item.",
    },
    {
      scope: "all",
      label: "Search everything",
      description: "Open up stats, nature, and item together.",
    },
  ];
}

function buildScopeSummary(mode: CoachMode, scope: CoachSearchScope, statLabel: string, subjectName: string, hasResults: boolean) {
  const goal = mode === "offensive"
    ? "land the KO"
    : "survive the hit";
  const locks: Record<CoachSearchScope, string> = {
    stats: `Got it — I'll keep your current nature and held item on ${subjectName}, and only move stat points.`,
    nature: `Got it — I'll keep your held item and search natures plus stat points.`,
    item: `Got it — I'll keep your nature and look for a held item that helps.`,
    all: `Got it — I'll search stat points, natures, and held items together.`,
  };
  if (!hasResults) {
    return `${locks[scope]} I could not find a legal spread that reaches a 50% chance to ${goal} under those limits. Try loosening a constraint below.`;
  }
  const benchmark = mode === "offensive"
    ? "Here are the cheapest spreads at three KO benchmarks:"
    : "Here are the cheapest spreads at three survival benchmarks:";
  return `${locks[scope]} ${benchmark}`;
}

function natureCandidatesForScope(
  scope: CoachSearchScope,
  mode: CoachMode,
  stat: "Atk" | "SpA" | "Def" | "SpD",
  targetBuild: PokemonBuild | undefined,
  defender: CoachPokemon,
  asksPositiveNature: boolean,
) {
  const current = targetBuild?.nature || "Hardy";
  if (scope === "stats" || scope === "item") return [current];
  const boost = mode === "offensive"
    ? boostedNature(stat as "Atk" | "SpA")
    : defensiveNature(stat as "Def" | "SpD", defender);
  const options = new Set<string>(["Hardy", boost]);
  if (targetBuild?.nature) options.add(targetBuild.nature);
  if (asksPositiveNature) options.delete("Hardy");
  return [...options];
}

function itemOptionsForScope(
  scope: CoachSearchScope,
  question: string,
  targetBuild: PokemonBuild | undefined,
  itemSearch: () => string[],
  mentionedItem: string,
) {
  if (mentionedItem) return [mentionedItem];
  if (keepsCurrentItem(question)) return [targetBuild?.item ?? ""];
  if (scope === "stats" || scope === "nature") return [targetBuild?.item ?? ""];
  return itemSearch();
}

function scopeAwaitingAnswer(
  mode: CoachMode,
  title: string,
  intro: string,
  assumptions: string[],
  followUps: CoachFollowUp[],
  extras: Partial<CoachAnswer>,
): CoachAnswer {
  return {
    ok: true,
    mode,
    title,
    summary: intro,
    intro,
    prompt: "What would you like me to try changing?",
    assumptions,
    recommendations: [],
    followUps,
    awaitingScope: true,
    ...extras,
  };
}

function resolveOffensiveCombatants(question: string, mentions: MentionedPokemon[], selectedCombatant?: CoachPokemon) {
  const builder = resolveBuilder(question, mentions, selectedCombatant);
  const opponentFromBuilder = builder
    ? mentions.find((pokemon) => pokemon.baseSpecies !== builder.baseSpecies)
    : undefined;
  if (builder && opponentFromBuilder) return { attacker: builder, defender: opponentFromBuilder };

  const lower = question.toLowerCase();
  const killIndex = lower.search(/\b(?:kill|ko|ohko|one[- ]?shot|take out|take down|defeat)\b/);
  if (killIndex >= 0 && mentions.length >= 2) {
    const beforeKill = mentions.filter((pokemon) => pokemon.position < killIndex);
    const afterKill = mentions.filter((pokemon) => pokemon.position > killIndex);
    if (beforeKill.length && afterKill.length) {
      return { attacker: beforeKill[beforeKill.length - 1], defender: afterKill[0] };
    }
  }

  if (mentions.length >= 2) return { attacker: mentions[0], defender: mentions[1] };
  return { attacker: builder, defender: opponentFromBuilder };
}

function resolveBuilder(question: string, mentions: MentionedPokemon[], selectedCombatant?: CoachPokemon) {
  const lowerQuestion = question.toLowerCase();
  const explicitlyReferencedPokemon = mentions.find((pokemon) =>
    new RegExp(`\\b(?:my|this|current|selected)\\s+${escapeRegExp(pokemon.name.toLowerCase())}\\b`).test(lowerQuestion),
  );
  const selectedData = selectedCombatant?.baseSpecies;
  return explicitlyReferencedPokemon
    ?? (usesSelectedReference(question) ? selectedCombatant : undefined)
    ?? mentions.find((pokemon) => pokemon.baseSpecies === selectedData)
    ?? selectedCombatant
    ?? mentions[0];
}

function pickRecommendations(
  candidates: CoachRecommendation[],
  thresholds: { rolls: number; label: string }[],
  compare: (a: CoachRecommendation, b: CoachRecommendation) => number,
) {
  return thresholds.map(({ rolls, label }) => {
    const match = candidates
      .filter((candidate) => candidate.successRolls >= rolls)
      .sort(compare)[0];
    return match ? { ...match, label } : null;
  }).filter((candidate): candidate is CoachRecommendation => Boolean(candidate))
    .filter((candidate, index, all) => all.findIndex((entry) =>
      entry.hpPoints === candidate.hpPoints
      && entry.defensePoints === candidate.defensePoints
      && entry.attackPoints === candidate.attackPoints
      && entry.nature === candidate.nature
      && entry.item === candidate.item,
    ) === index);
}

function compareRecommendations(a: CoachRecommendation, b: CoachRecommendation) {
  return a.pointsUsed - b.pointsUsed
    || itemPreferenceCost(a.item) - itemPreferenceCost(b.item)
    || Number(a.nature !== "Hardy") - Number(b.nature !== "Hardy")
    || a.hpPoints - b.hpPoints
    || a.attackPoints - b.attackPoints;
}

function compareOffensiveRecommendations(attackStat: "Atk" | "SpA", a: CoachRecommendation, b: CoachRecommendation) {
  return a.pointsUsed - b.pointsUsed
    || itemPreferenceCost(a.item) - itemPreferenceCost(b.item)
    || Number(a.nature !== boostedNature(attackStat)) - Number(b.nature !== boostedNature(attackStat))
    || a.attackPoints - b.attackPoints;
}

function answerDefensiveCoach(
  question: string,
  team: PokemonBuild[],
  defender: CoachPokemon,
  attacker: CoachPokemon,
  moveName: string,
  move: MoveDetails,
): CoachAnswer {
  const category = move.category as "Physical" | "Special";
  const attackStat: "Atk" | "SpA" = category === "Special" ? "SpA" : "Atk";
  const defenseStat: "Def" | "SpD" = category === "Special" ? "SpD" : "Def";
  const targetBuild = team.find((build) => build.species === defender.baseSpecies);
  const attackerBuild = team.find((build) => build.species === attacker.baseSpecies);
  const attackerAbility = resolveAbility(question, attacker);
  const defenderAbility = resolveAbility(question, defender);
  const conditions = battleConditions(question, moveName, move, attackerAbility, defenderAbility);
  const asksPositiveNature = new RegExp(`(?:\\+|positive|boosting|max(?:imum)?)[ -]?${attackStat.toLowerCase()}|${attackStat.toLowerCase()}[ -]?nature`, "i").test(question);
  const asksMaxAttack = new RegExp(`max(?:imum|ed)?(?:\\s+|[ -])${attackStat.toLowerCase()}|${attackStat.toLowerCase()}(?:\\s+|[ -])max`, "i").test(question);
  const attackerNature = explicitNature(question, attacker.name)
    ?? (asksPositiveNature ? boostedNature(attackStat) : attackerBuild?.nature ?? "Hardy");
  const explicitAttackPoints = explicitStatPoints(question, attacker.name, attackStat);
  const attackerPoints = explicitAttackPoints ?? (asksMaxAttack ? CHAMPIONS_STAT_POINT_MAX : attackerBuild?.evs[attackStat] ?? 0);
  const attackerItem = mentionedItemNear(question, attacker.name)
    || attackerBuild?.item
    || undefined;
  const mentionedDefenderItem = mentionedItemNear(question, defender.name);
  const searchScope = parseSearchScope(question);
  const defenderItems = itemOptionsForScope(
    searchScope ?? "all",
    question,
    targetBuild,
    () => defensiveItemOptions(move, defender.types, undefined),
    mentionedDefenderItem,
  );
  const attack = calculateStat(attacker.stats[attackStat], attackerPoints, attackStat, attackerNature);
  const fieldMods = fieldModifiers(question, defender.name, attacker.name);
  const currentRange = targetBuild ? (() => {
    const nature = targetBuild.nature || "Hardy";
    const hp = calculateStat(defender.stats.HP, targetBuild.evs.HP, "HP", nature);
    const defense = calculateStat(defender.stats[defenseStat], targetBuild.evs[defenseStat], defenseStat, nature);
    const defenderItem = (searchScope === "stats" || searchScope === "nature")
      ? targetBuild.item || undefined
      : defenderItems[0] || targetBuild.item || undefined;
    const staged = stagedDamageStats("defensive", attack, defense, fieldMods);
    const rolls = damageRolls({
      attacker,
      defender,
      moveName,
      move,
      attack: staged.attack,
      defense: staged.defense,
      attackerItem,
      defenderItem,
      attackerAbility,
      defenderAbility,
      conditions,
    });
    return currentDamageRange("defensive", moveName, attacker, defender, rolls, hp);
  })() : undefined;

  const weatherSuppressed = ["Air Lock", "Cloud Nine"].includes(attackerAbility)
    || ["Air Lock", "Cloud Nine"].includes(defenderAbility);
  const calcMoveType = moveTypeForCalc(
    moveName,
    move,
    attacker,
    attackerAbility,
    conditions,
    weatherSuppressed ? "" : conditions.weather,
  );
  const effectiveness = typeEffectiveness(calcMoveType, defender.types);
  const fixedDefenderItem = describeFixedItem(question, defender, targetBuild);
  const fixedAttackerItem = describeFixedItem(question, attacker, attackerBuild);
  const keepsItem = keepsCurrentItem(question);
  const assumptions = [
    `Level 50 ${attacker.name}: ${attackerNature}, ${attackerPoints} ${attackStat} Stat Points${fixedAttackerItem ? `, ${fixedAttackerItem}` : attacker.megaForm ? ", required Mega Stone" : ", no held item"}.`,
    `${defender.name} starts at full HP${keepsItem ? (targetBuild?.item ? ` and keeps ${targetBuild.item}` : " and keeps its held-item slot empty") : fixedDefenderItem ? ` and holds ${fixedDefenderItem}` : defender.megaForm ? " and holds its required Mega Stone" : "; recommendations may include a defensive held item"}.`,
    `Abilities: ${attacker.name} — ${attackerAbility || "none specified"}; ${defender.name} — ${defenderAbility || "none specified"}.`,
    `Weather: ${conditions.weather || "none"}${weatherSuppressed && conditions.weather ? " (suppressed by Air Lock or Cloud Nine)" : ""}. Terrain: ${conditions.terrain ? `${conditions.terrain} Terrain` : "none"}.`,
    isSpreadMove(moveName, move)
      ? `Targeting: ${conditions.targeting === "multiple" ? "multiple Pokémon; the 0.75× spread modifier is applied" : "one Pokémon; no spread reduction is applied"}.`
      : "Targeting: single-target move; no spread reduction is applied.",
    `${conditions.criticalHit ? "Critical hit" : "No critical hit"} and screens. ${fieldAssumptionLine(fieldMods)} Conditional ability effects requiring low HP, status, prior KOs, switching order, or an ally are not activated. ${moveName} is ${effectiveness}x effective.`,
  ];

  if (targetBuild && currentRange && !searchScope) {
    return scopeAwaitingAnswer(
      "defensive",
      `${defender.name} vs ${attacker.name}'s ${moveName}`,
      buildCurrentIntro("defensive", currentRange, defender.name),
      assumptions,
      buildFollowUps("defensive", defenseStat),
      { targetBuildId: targetBuild.id, attackStat, defenseStat, currentRange },
    );
  }

  const candidateNatures = natureCandidatesForScope(
    searchScope ?? "all",
    "defensive",
    defenseStat,
    targetBuild,
    defender,
    false,
  );
  const candidates: CoachRecommendation[] = [];

  for (const defenderItem of defenderItems) {
    for (const nature of candidateNatures) {
      for (let hpPoints = 0; hpPoints <= CHAMPIONS_STAT_POINT_MAX; hpPoints++) {
        for (let defensePoints = 0; defensePoints <= CHAMPIONS_STAT_POINT_MAX; defensePoints++) {
          if (hpPoints + defensePoints > CHAMPIONS_STAT_POINT_TOTAL) continue;
          const hp = calculateStat(defender.stats.HP, hpPoints, "HP", nature);
          const defense = calculateStat(defender.stats[defenseStat], defensePoints, defenseStat, nature);
          const staged = stagedDamageStats("defensive", attack, defense, fieldMods);
          const rolls = damageRolls({
            attacker,
            defender,
            moveName,
            move,
            attack: staged.attack,
            defense: staged.defense,
            attackerItem,
            defenderItem: defenderItem || undefined,
            attackerAbility,
            defenderAbility,
            conditions,
          });
          const low = Math.min(...rolls);
          const high = Math.max(...rolls);
          const successRolls = defenderItem === "Focus Sash"
            ? 16
            : rolls.filter((damage) => damage < hp).length;
          candidates.push({
            label: "",
            outcomeChance: successRolls / 16,
            successRolls,
            item: defenderItem,
            hpPoints,
            defensePoints,
            attackPoints: 0,
            nature,
            hp,
            defense,
            attack: 0,
            damage: [low, high],
            damagePercent: [Math.round(low / hp * 1000) / 10, Math.round(high / hp * 1000) / 10],
            pointsUsed: hpPoints + defensePoints,
          });
        }
      }
    }
  }

  const recommendations = pickRecommendations(candidates, [
    { rolls: 16, label: "Guaranteed survive" },
    { rolls: 12, label: "Strong odds" },
    { rolls: 8, label: "Coin flip or better" },
  ], compareRecommendations);

  const activeScope = searchScope ?? "all";

  return {
    ok: recommendations.length > 0,
    mode: "defensive",
    title: recommendations.length
      ? `${defender.name} vs ${attacker.name}'s ${moveName}`
      : `${defender.name} cannot survive ${attacker.name}'s ${moveName} with stats alone`,
    intro: currentRange ? buildCurrentIntro("defensive", currentRange, defender.name) : undefined,
    summary: buildScopeSummary("defensive", activeScope, defenseStat, defender.name, recommendations.length > 0),
    assumptions,
    recommendations,
    followUps: recommendations.length ? undefined : buildFollowUps("defensive", defenseStat),
    searchScope: activeScope,
    targetBuildId: targetBuild?.id,
    defenseStat,
    currentRange,
  };
}

function answerOffensiveCoach(
  question: string,
  team: PokemonBuild[],
  attacker: CoachPokemon,
  defender: CoachPokemon,
  moveName: string,
  move: MoveDetails,
): CoachAnswer {
  const category = move.category as "Physical" | "Special";
  const attackStat: "Atk" | "SpA" = category === "Special" ? "SpA" : "Atk";
  const defenseStat: "Def" | "SpD" = category === "Special" ? "SpD" : "Def";
  const targetBuild = team.find((build) => build.species === attacker.baseSpecies);
  const defenderBuild = team.find((build) => build.species === defender.baseSpecies);
  const attackerAbility = resolveAbility(question, attacker);
  const defenderAbility = resolveAbility(question, defender);
  const conditions = battleConditions(question, moveName, move, attackerAbility, defenderAbility);
  const asksPositiveNature = new RegExp(`(?:\\+|positive|boosting|max(?:imum)?)[ -]?${attackStat.toLowerCase()}|${attackStat.toLowerCase()}[ -]?nature`, "i").test(question);
  const asksMaxDefense = new RegExp(`max(?:imum|ed)?(?:\\s+|[ -])(?:hp|${defenseStat.toLowerCase()})`, "i").test(question);
  const defenderNature = explicitNature(question, defender.name) ?? defenderBuild?.nature ?? "Hardy";
  const explicitHpPoints = explicitStatPoints(question, defender.name, "HP");
  const explicitDefensePoints = explicitStatPoints(question, defender.name, defenseStat);
  const defenderHpPoints = explicitHpPoints ?? (asksMaxDefense ? CHAMPIONS_STAT_POINT_MAX : defenderBuild?.evs.HP ?? 0);
  const defenderDefPoints = explicitDefensePoints ?? (asksMaxDefense ? CHAMPIONS_STAT_POINT_MAX : defenderBuild?.evs[defenseStat] ?? 0);
  const defenderItem = mentionedItemNear(question, defender.name)
    || defenderBuild?.item
    || undefined;
  const mentionedAttackerItem = mentionedItemNear(question, attacker.name);
  const searchScope = parseSearchScope(question);
  const attackerItems = itemOptionsForScope(
    searchScope ?? "all",
    question,
    targetBuild,
    () => offensiveItemOptions(move, undefined),
    mentionedAttackerItem,
  );
  const defenderHp = calculateStat(defender.stats.HP, defenderHpPoints, "HP", defenderNature);
  const defenderDefense = calculateStat(defender.stats[defenseStat], defenderDefPoints, defenseStat, defenderNature);
  const fieldMods = fieldModifiers(question, attacker.name, defender.name);
  const currentRange = targetBuild ? (() => {
    const attackerNature = targetBuild.nature || "Hardy";
    const attackerPoints = targetBuild.evs[attackStat];
    const attack = calculateStat(attacker.stats[attackStat], attackerPoints, attackStat, attackerNature);
    const attackerItem = (searchScope === "stats" || searchScope === "nature")
      ? targetBuild.item || undefined
      : attackerItems[0] || targetBuild.item || undefined;
    const staged = stagedDamageStats("offensive", attack, defenderDefense, fieldMods);
    const rolls = damageRolls({
      attacker,
      defender,
      moveName,
      move,
      attack: staged.attack,
      defense: staged.defense,
      attackerItem,
      defenderItem,
      attackerAbility,
      defenderAbility,
      conditions,
    });
    return currentDamageRange("offensive", moveName, attacker, defender, rolls, defenderHp);
  })() : undefined;

  const weatherSuppressed = ["Air Lock", "Cloud Nine"].includes(attackerAbility)
    || ["Air Lock", "Cloud Nine"].includes(defenderAbility);
  const calcMoveType = moveTypeForCalc(
    moveName,
    move,
    attacker,
    attackerAbility,
    conditions,
    weatherSuppressed ? "" : conditions.weather,
  );
  const effectiveness = typeEffectiveness(calcMoveType, defender.types);
  const fixedAttackerItem = describeFixedItem(question, attacker, targetBuild);
  const keepsItem = keepsCurrentItem(question);
  const assumptions = [
    `Level 50 ${attacker.name} uses ${moveName}${keepsItem ? (targetBuild?.item ? ` while keeping ${targetBuild.item}` : " while keeping its held-item slot empty") : fixedAttackerItem ? ` with ${fixedAttackerItem}` : attacker.megaForm ? " while holding its required Mega Stone" : "; recommendations may include a damage-boosting held item"}.`,
    `Level 50 ${defender.name}: ${defenderNature}, ${defenderHpPoints} HP / ${defenderDefPoints} ${defenseStat} Stat Points${defenderItem ? `, ${defenderItem}` : defender.megaForm ? ", required Mega Stone" : ", no held item"}.`,
    `Abilities: ${attacker.name} — ${attackerAbility || "none specified"}; ${defender.name} — ${defenderAbility || "none specified"}.`,
    `Weather: ${conditions.weather || "none"}${weatherSuppressed && conditions.weather ? " (suppressed by Air Lock or Cloud Nine)" : ""}. Terrain: ${conditions.terrain ? `${conditions.terrain} Terrain` : "none"}.`,
    isSpreadMove(moveName, move)
      ? `Targeting: ${conditions.targeting === "multiple" ? "multiple Pokémon; the 0.75× spread modifier is applied" : "one Pokémon; no spread reduction is applied"}.`
      : "Targeting: single-target move; no spread reduction is applied.",
    `${conditions.criticalHit ? "Critical hit" : "No critical hit"} and screens. ${fieldAssumptionLine(fieldMods)} Conditional ability effects requiring low HP, status, prior KOs, switching order, or an ally are not activated. ${moveName} is ${effectiveness}x effective.`,
  ];

  if (targetBuild && currentRange && !searchScope) {
    return scopeAwaitingAnswer(
      "offensive",
      `${attacker.name}'s ${moveName} into ${defender.name}`,
      buildCurrentIntro("offensive", currentRange, attacker.name),
      assumptions,
      buildFollowUps("offensive", attackStat),
      { targetBuildId: targetBuild.id, attackStat, defenseStat, targetHp: defenderHp, currentRange },
    );
  }

  const candidateNatures = natureCandidatesForScope(
    searchScope ?? "all",
    "offensive",
    attackStat,
    targetBuild,
    defender,
    asksPositiveNature,
  );
  const candidates: CoachRecommendation[] = [];

  for (const attackerItem of attackerItems) {
    for (const nature of candidateNatures) {
      if (asksPositiveNature && nature === "Hardy") continue;
      for (let attackPoints = 0; attackPoints <= CHAMPIONS_STAT_POINT_MAX; attackPoints++) {
        const attack = calculateStat(attacker.stats[attackStat], attackPoints, attackStat, nature);
        const staged = stagedDamageStats("offensive", attack, defenderDefense, fieldMods);
        const rolls = damageRolls({
          attacker,
          defender,
          moveName,
          move,
          attack: staged.attack,
          defense: staged.defense,
          attackerItem: attackerItem || undefined,
          defenderItem,
          attackerAbility,
          defenderAbility,
          conditions,
        });
        const successRolls = rolls.filter((damage) => damage >= defenderHp).length;
        const low = Math.min(...rolls);
        const high = Math.max(...rolls);
        candidates.push({
          label: "",
          outcomeChance: successRolls / 16,
          successRolls,
          item: attackerItem,
          hpPoints: 0,
          defensePoints: 0,
          attackPoints,
          nature,
          hp: defenderHp,
          defense: defenderDefense,
          attack,
          damage: [low, high],
          damagePercent: [Math.round(low / defenderHp * 1000) / 10, Math.round(high / defenderHp * 1000) / 10],
          pointsUsed: attackPoints,
        });
      }
    }
  }

  const recommendations = pickRecommendations(candidates, [
    { rolls: 16, label: "Guaranteed OHKO" },
    { rolls: 12, label: "Strong odds" },
    { rolls: 8, label: "Coin flip or better" },
  ], (a, b) => compareOffensiveRecommendations(attackStat, a, b));

  const activeScope = searchScope ?? "all";

  return {
    ok: recommendations.length > 0,
    mode: "offensive",
    title: recommendations.length
      ? `${attacker.name}'s ${moveName} into ${defender.name}`
      : `${attacker.name}'s ${moveName} cannot OHKO ${defender.name} with stats alone`,
    intro: currentRange ? buildCurrentIntro("offensive", currentRange, attacker.name) : undefined,
    summary: buildScopeSummary("offensive", activeScope, attackStat, attacker.name, recommendations.length > 0),
    assumptions,
    recommendations,
    followUps: recommendations.length ? undefined : buildFollowUps("offensive", attackStat),
    searchScope: activeScope,
    targetBuildId: targetBuild?.id,
    attackStat,
    targetHp: defenderHp,
    currentRange,
  };
}

export function answerCoachQuestion(question: string, team: PokemonBuild[], selectedId: string | null): CoachAnswer {
  const selectedBuild = team.find((build) => build.id === selectedId);
  const selectedData = POKEMON.find((pokemon) => pokemon.name === selectedBuild?.species);
  const selectedCombatant = enrichWithTeamBuild(
    selectedData ? { ...selectedData, baseSpecies: selectedData.name } : undefined,
    team,
    question,
  );
  const ambiguousMega = ambiguousMegaMention(question);
  const mentions = mentionedPokemon(question);
  const mode = detectCoachMode(question);
  let moveName = mentionedMove(question);
  if (!moveName && mode === "offensive" && selectedCombatant) {
    moveName = inferOffensiveMove(team, selectedCombatant);
  }
  const move = moveName ? MOVES[moveName] : undefined;

  if (ambiguousMega) {
    const choices = ambiguousMega.megaForms?.map((form) => megaDisplayName(ambiguousMega, form.name)).join(" or ");
    return fail(`Specify ${choices} so I use the correct Mega stats.`);
  }

  const builder = enrichWithTeamBuild(resolveBuilder(question, mentions, selectedCombatant), team, question);
  const opponent = enrichWithTeamBuild(
    mentions.find((pokemon) => pokemon.baseSpecies !== builder?.baseSpecies),
    team,
    question,
  );

  if (detectsSpeedCheck(question)) {
    return answerSpeedCheck(question, team, builder, opponent);
  }

  if (mode === "offensive") {
    const { attacker, defender } = resolveOffensiveCombatants(question, mentions, selectedCombatant);
    const enrichedAttacker = enrichWithTeamBuild(attacker, team, question);
    const enrichedDefender = enrichWithTeamBuild(defender, team, question);
    if (!enrichedAttacker) return fail("Name the Pokémon you are building, or select it in the team editor first.");
    if (!enrichedDefender) return fail(`Tell me which Pokémon ${enrichedAttacker.name} should KO.`);
    if (!moveName || !move) return fail(missingMovePrompt(team, enrichedAttacker, enrichedDefender, "offensive"));
    if (!move.power || !["Physical", "Special"].includes(move.category ?? "")) return fail(`${moveName} does not use a standard physical or special damage calculation yet.`);
    return answerOffensiveCoach(question, team, enrichedAttacker, enrichedDefender, moveName, move);
  }

  if (!builder) return fail("Name the Pokémon you are building, or select it in the team editor first.");
  if (!opponent) return fail(`Tell me which attacker ${builder.name} needs to survive.`);
  if (!moveName || !move) return fail(missingMovePrompt(team, opponent, builder, "defensive"));
  if (!move.power || !["Physical", "Special"].includes(move.category ?? "")) return fail(`${moveName} does not use a standard physical or special damage calculation yet.`);

  return answerDefensiveCoach(question, team, builder, opponent, moveName, move);
}

export function applyCoachRecommendation(build: PokemonBuild, answer: CoachAnswer, recommendation: CoachRecommendation): PokemonBuild {
  const evs: PokemonBuild["evs"] = { HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 };
  if (answer.mode === "offensive" && answer.attackStat) {
    evs[answer.attackStat] = recommendation.attackPoints;
    return { ...build, nature: recommendation.nature, item: recommendation.item, evs };
  }
  if (!answer.defenseStat) return build;
  evs.HP = recommendation.hpPoints;
  evs[answer.defenseStat] = recommendation.defensePoints;
  return { ...build, nature: recommendation.nature, item: recommendation.item, evs };
}
