export type StatKey = "HP" | "Atk" | "Def" | "SpA" | "SpD" | "Spe";

export type PokemonData = {
  name: string;
  dex: number;
  types: string[];
  role: string;
  summary: string;
  stats: Record<StatKey, number>;
  abilities: string[];
  items: string[];
  moves: string[];
  sprite: string;
  artwork: string;
  megaForms?: MegaForm[];
};

export type MegaForm = {
  name: string;
  stats: Record<StatKey, number>;
  ability: string;
  types: string[];
  artwork: string;
};

export function formatMegaDisplayName(species: string, formName: string) {
  const marker = `${species}-Mega`;
  if (!formName.startsWith(marker)) {
    const [base, suffix = ""] = formName.split("-Mega");
    return `Mega ${base}${suffix ? ` ${suffix.replace(/-/g, " ").trim()}` : ""}`;
  }
  const suffix = formName.slice(marker.length).replace(/-/g, " ").trim();
  return `Mega ${species}${suffix ? ` ${suffix}` : ""}`;
}

export function resolvePokemonFromDisplayName(displayName: string): {
  data: PokemonData;
  megaForm: MegaForm | null;
} | null {
  const exact = POKEMON.find((pokemon) => pokemon.name === displayName);
  if (exact) return { data: exact, megaForm: null };

  for (const pokemon of POKEMON) {
    for (const form of pokemon.megaForms ?? []) {
      if (formatMegaDisplayName(pokemon.name, form.name) === displayName) {
        return { data: pokemon, megaForm: form };
      }
    }
  }
  return null;
}

export type PokemonBuild = {
  id: string;
  species: string;
  megaForm?: string;
  item: string;
  ability: string;
  nature: string;
  moves: string[];
  evs: Record<StatKey, number>;
};

export type ValidationIssue = { message: string; pokemonId?: string };
export type CoachInsight = { tone: "good" | "warning"; message: string };
export const CHAMPIONS_STAT_POINT_MAX = 32;
export const CHAMPIONS_STAT_POINT_TOTAL = 66;

const NATURE_STATS: StatKey[] = ["Atk", "Def", "SpA", "SpD", "Spe"];
const NATURE_MATRIX = [
  ["Hardy", "Lonely", "Adamant", "Naughty", "Brave"],
  ["Bold", "Docile", "Impish", "Lax", "Relaxed"],
  ["Modest", "Mild", "Bashful", "Rash", "Quiet"],
  ["Calm", "Gentle", "Careful", "Quirky", "Sassy"],
  ["Timid", "Hasty", "Jolly", "Naive", "Serious"],
] as const;

const NATURES: Record<string, { up?: StatKey; down?: StatKey }> = Object.fromEntries(
  NATURE_MATRIX.flatMap((row, rowIndex) =>
    row.map((nature, colIndex) => {
      if (rowIndex === colIndex) return [nature, {}];
      return [nature, { up: NATURE_STATS[rowIndex], down: NATURE_STATS[colIndex] }];
    }),
  ),
);

export function getNatureEffect(nature: string, stat: StatKey): number {
  if (stat === "HP") return 1;
  if (NATURES[nature]?.up === stat) return 1.1;
  if (NATURES[nature]?.down === stat) return 0.9;
  return 1;
}

export function calculateStat(base: number, ev: number, stat: StatKey, nature: string): number {
  if (stat === "HP") return base + 75 + ev;
  const levelScaled = Math.floor(((2 * base + 31) * 50) / 100);
  return Math.floor((levelScaled + 5 + ev) * getNatureEffect(nature, stat));
}

export type BattleStatContext = {
  item?: string;
  ability?: string;
  weather?: string;
  terrain?: string;
  statStage?: number;
};

export function statStageMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, Math.trunc(stage)));
  if (clamped >= 0) return (2 + clamped) / 2;
  return 2 / (2 - clamped);
}

export function applyStatStage(value: number, stage: number): number {
  if (!stage) return value;
  return Math.floor(value * statStageMultiplier(stage));
}

export function applyBattleStatModifiers(stat: StatKey, value: number, context: BattleStatContext = {}): number {
  let result = value;
  const item = context.item ?? "";
  const ability = context.ability ?? "";
  const weather = context.weather ?? "";
  const terrain = context.terrain ?? "";

  if (stat === "Spe") {
    if (ability === "Swift Swim" && weather === "Rain") result *= 2;
    else if (ability === "Chlorophyll" && weather === "Sun") result *= 2;
    else if (ability === "Sand Rush" && weather === "Sand") result *= 2;
    else if (ability === "Slush Rush" && weather === "Snow") result *= 2;
    else if (ability === "Surge Surfer" && terrain === "Electric") result *= 2;
  }
  if (stat === "Atk") {
    if (["Huge Power", "Pure Power"].includes(ability)) result *= 2;
    else if (["Gorilla Tactics", "Hustle"].includes(ability)) result = Math.floor(result * 1.5);
    else if (ability === "Orichalcum Pulse" && weather === "Sun") result = Math.floor(result * 4 / 3);
  }
  if (stat === "SpA") {
    if (ability === "Solar Power" && weather === "Sun") result = Math.floor(result * 1.5);
    else if (ability === "Hadron Engine" && terrain === "Electric") result = Math.floor(result * 4 / 3);
  }
  if (stat === "SpD" && item === "Assault Vest") result = Math.floor(result * 1.5);

  if (stat === "Spe" && item === "Choice Scarf") result = Math.floor(result * 1.5);
  if (stat === "Atk" && item === "Choice Band") result = Math.floor(result * 1.5);
  if (stat === "SpA" && item === "Choice Specs") result = Math.floor(result * 1.5);

  return Math.floor(result);
}

export function calculateEffectiveStat(
  base: number,
  ev: number,
  stat: StatKey,
  nature: string,
  context: BattleStatContext = {},
): number {
  const baseValue = calculateStat(base, ev, stat, nature);
  const staged = applyStatStage(baseValue, context.statStage ?? 0);
  return applyBattleStatModifiers(stat, staged, context);
}

const image = (id: number) => ({
  sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
  artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
});

export function pokemonSprite(dex: number, sprite?: string) {
  return sprite || image(dex).sprite;
}

export function pokemonArtwork(dex: number, artwork?: string) {
  return artwork || image(dex).artwork;
}

export function megaShowdownSlug(formName: string) {
  return formName.toLowerCase().replace(/-mega-([a-z0-9]+)$/, "-mega$1");
}

function isUsableMegaArtwork(url: string, slug: string, speciesName: string) {
  const lower = url.toLowerCase();
  if (lower.includes("/afd/")) return false;
  if (lower.includes(slug)) return true;
  if (/mega/i.test(lower)) return true;
  const speciesSlug = speciesName.toLowerCase();
  return !(lower.includes(`/${speciesSlug}.`) || lower.endsWith(`/${speciesSlug}.png`));
}

export function megaFormArtworkUrls(form: MegaForm, data: PokemonData): string[] {
  const slug = megaShowdownSlug(form.name);
  return [
    form.artwork && isUsableMegaArtwork(form.artwork, slug, data.name) ? form.artwork : undefined,
    `https://play.pokemonshowdown.com/sprites/dex/${slug}.png`,
    `https://play.pokemonshowdown.com/sprites/gen5/${slug}.png`,
    `https://play.pokemonshowdown.com/sprites/ani/${slug}.png`,
    pokemonArtwork(data.dex, data.artwork),
    pokemonSprite(data.dex, data.sprite),
  ].filter((url, index, list): url is string => !!url && !url.toLowerCase().includes("/afd/") && list.indexOf(url) === index);
}

const FEATURED_POKEMON: PokemonData[] = [
  {
    name: "Basculegion", dex: 902, types: ["Water", "Ghost"], role: "Physical cleaner",
    summary: "The most-used Regulation MB Pokémon, threatening late-game sweeps with Last Respects.",
    stats: { HP: 120, Atk: 112, Def: 65, SpA: 80, SpD: 75, Spe: 78 },
    abilities: ["Adaptability", "Swift Swim", "Mold Breaker"], items: ["Choice Scarf", "Focus Sash", "Mystic Water", "Sitrus Berry"],
    moves: ["Last Respects", "Aqua Jet", "Wave Crash", "Flip Turn", "Protect", "Liquidation", "Psychic Fangs", "Waterfall"], ...image(902),
  },
  {
    name: "Garchomp", dex: 445, types: ["Dragon", "Ground"], role: "Fast physical attacker",
    summary: "Applies immediate spread pressure with Earthquake and flexible Dragon-type damage.",
    stats: { HP: 108, Atk: 130, Def: 95, SpA: 80, SpD: 85, Spe: 102 },
    abilities: ["Rough Skin", "Sand Veil"], items: ["Choice Scarf", "Sitrus Berry", "Dragon Fang", "Soft Sand"],
    moves: ["Earthquake", "Dragon Claw", "Rock Slide", "Protect", "Stomping Tantrum", "Scale Shot", "Rock Tomb", "Poison Jab"], ...image(445),
  },
  {
    name: "Sneasler", dex: 903, types: ["Fighting", "Poison"], role: "Fast disruption",
    summary: "Combines Fake Out pressure, high Speed, and disruptive status from Dire Claw.",
    stats: { HP: 80, Atk: 130, Def: 60, SpA: 40, SpD: 80, Spe: 120 },
    abilities: ["Unburden", "Poison Touch", "Pressure"], items: ["White Herb", "Focus Sash", "Mental Herb", "Lum Berry"],
    moves: ["Close Combat", "Dire Claw", "Fake Out", "Protect", "Coaching", "Rock Slide", "Throat Chop", "Feint"], ...image(903),
  },
  {
    name: "Kingambit", dex: 983, types: ["Dark", "Steel"], role: "Bulky physical attacker",
    summary: "Punishes stat drops with Defiant and closes games with powerful priority.",
    stats: { HP: 100, Atk: 135, Def: 120, SpA: 60, SpD: 85, Spe: 50 },
    abilities: ["Defiant", "Supreme Overlord", "Pressure"], items: ["Chople Berry", "Black Glasses", "Focus Sash", "Lum Berry"],
    moves: ["Sucker Punch", "Kowtow Cleave", "Protect", "Iron Head", "Low Kick", "Swords Dance", "Brick Break", "Guillotine"], ...image(983),
  },
  {
    name: "Incineroar", dex: 727, types: ["Fire", "Dark"], role: "Disruptive support",
    summary: "Softens physical attacks, controls positioning, and makes space for its partners.",
    stats: { HP: 95, Atk: 115, Def: 90, SpA: 80, SpD: 90, Spe: 60 },
    abilities: ["Intimidate", "Blaze"], items: ["Sitrus Berry", "Chople Berry", "Passho Berry", "Shuca Berry"],
    moves: ["Fake Out", "Parting Shot", "Flare Blitz", "Throat Chop", "Darkest Lariat", "Protect", "Will-O-Wisp", "Taunt"], ...image(727),
  },
  {
    name: "Sinistcha", dex: 1013, types: ["Grass", "Ghost"], role: "Redirection support",
    summary: "Supports partners with Hospitality, Rage Powder, Trick Room, and recovery.",
    stats: { HP: 71, Atk: 60, Def: 106, SpA: 121, SpD: 80, Spe: 70 },
    abilities: ["Hospitality", "Heatproof"], items: ["Sitrus Berry", "Kasib Berry", "Colbur Berry", "Leftovers"],
    moves: ["Matcha Gotcha", "Rage Powder", "Trick Room", "Life Dew", "Protect", "Shadow Ball", "Strength Sap", "Imprison"], ...image(1013),
  },
  {
    name: "Farigiraf", dex: 981, types: ["Normal", "Psychic"], role: "Trick Room support",
    summary: "Blocks priority moves and gives slower partners room to take over the field.",
    stats: { HP: 120, Atk: 90, Def: 70, SpA: 110, SpD: 70, Spe: 60 },
    abilities: ["Armor Tail", "Cud Chew", "Sap Sipper"], items: ["Sitrus Berry", "Colbur Berry", "Mental Herb", "Leftovers"],
    moves: ["Trick Room", "Psychic", "Helping Hand", "Protect", "Hyper Voice", "Twin Beam", "Imprison", "Thunderbolt"], ...image(981),
  },
  {
    name: "Archaludon", dex: 1018, types: ["Steel", "Dragon"], role: "Bulky special attacker",
    summary: "Builds Defense through Stamina and threatens strong rain-boosted Electro Shots.",
    stats: { HP: 90, Atk: 105, Def: 130, SpA: 125, SpD: 65, Spe: 85 },
    abilities: ["Stamina", "Sturdy", "Stalwart"], items: ["Leftovers", "Choice Scarf", "Chople Berry", "Sitrus Berry"],
    moves: ["Electro Shot", "Flash Cannon", "Protect", "Dragon Pulse", "Draco Meteor", "Aura Sphere", "Thunderbolt", "Snarl"], ...image(1018),
  },
  {
    name: "Whimsicott", dex: 547, types: ["Grass", "Fairy"], role: "Speed control",
    summary: "Uses priority Tailwind and disruption to create favorable turns for its partners.",
    stats: { HP: 60, Atk: 67, Def: 85, SpA: 77, SpD: 75, Spe: 116 },
    abilities: ["Prankster", "Infiltrator", "Chlorophyll"], items: ["Focus Sash", "Fairy Feather", "Mental Herb", "Coba Berry"],
    moves: ["Tailwind", "Moonblast", "Encore", "Protect", "Sunny Day", "Taunt", "Fake Tears", "Helping Hand"], ...image(547),
  },
  {
    name: "Pelipper", dex: 279, types: ["Water", "Flying"], role: "Rain support",
    summary: "Sets rain, controls speed with Tailwind, and protects partners with Wide Guard.",
    stats: { HP: 60, Atk: 50, Def: 100, SpA: 95, SpD: 70, Spe: 65 },
    abilities: ["Drizzle", "Keen Eye", "Rain Dish"], items: ["Focus Sash", "Sitrus Berry", "Choice Scarf", "Leftovers"],
    moves: ["Hurricane", "Weather Ball", "Tailwind", "Wide Guard", "Protect", "Muddy Water", "U-turn", "Rain Dance"], ...image(279),
  },
  {
    name: "Sylveon", dex: 700, types: ["Fairy"], role: "Special spread attacker",
    summary: "Applies steady Fairy-type spread pressure through Pixilate-boosted Hyper Voice.",
    stats: { HP: 95, Atk: 65, Def: 65, SpA: 110, SpD: 130, Spe: 60 },
    abilities: ["Pixilate", "Cute Charm"], items: ["Fairy Feather", "Leftovers", "Sitrus Berry", "Choice Scarf"],
    moves: ["Hyper Voice", "Quick Attack", "Hyper Beam", "Protect", "Detect", "Moonblast", "Calm Mind", "Yawn"], ...image(700),
  },
  {
    name: "Rotom-Wash", dex: 479, types: ["Electric", "Water"], role: "Bulky utility",
    summary: "Checks physical attackers with Will-O-Wisp while maintaining pressure and positioning.",
    stats: { HP: 50, Atk: 65, Def: 107, SpA: 105, SpD: 107, Spe: 86 },
    abilities: ["Levitate"], items: ["Sitrus Berry", "Choice Scarf", "Leftovers", "Magnet"],
    moves: ["Hydro Pump", "Thunderbolt", "Will-O-Wisp", "Volt Switch", "Protect", "Electroweb", "Trick", "Discharge"], ...image(479),
  },
];

const featuredNames = new Set(FEATURED_POKEMON.map((pokemon) => pokemon.name));
const catalogBySpecies = new Map(championsCatalog.map((pokemon) => [pokemon.name, pokemon]));
const COMPLETE_CATALOG: PokemonData[] = championsCatalog
  .filter((pokemon) => !featuredNames.has(pokemon.name))
  .map((pokemon) => ({
    ...pokemon,
    sprite: pokemonSprite(pokemon.dex, pokemon.sprite),
    artwork: pokemonArtwork(pokemon.dex, pokemon.artwork),
    role: pokemon.usage > 0 ? "Regulation MB contender" : "Regulation MB eligible",
    summary: "A legal Regulation MB Pokémon with all available moves, abilities, and items.",
  }));

export const POKEMON: PokemonData[] = [
  ...FEATURED_POKEMON.map((pokemon) => {
    const catalogPokemon = catalogBySpecies.get(pokemon.name);
    return {
      ...pokemon,
      stats: catalogPokemon?.stats ?? pokemon.stats,
      types: catalogPokemon?.types ?? pokemon.types,
      dex: catalogPokemon?.dex ?? pokemon.dex,
      sprite: pokemonSprite(catalogPokemon?.dex ?? pokemon.dex, catalogPokemon?.sprite || pokemon.sprite),
      artwork: pokemonArtwork(catalogPokemon?.dex ?? pokemon.dex, catalogPokemon?.artwork || pokemon.artwork),
      megaForms: catalogPokemon?.megaForms ?? [],
      abilities: catalogPokemon?.abilities ?? pokemon.abilities,
      items: catalogPokemon?.items ?? pokemon.items,
      moves: catalogPokemon?.moves ?? pokemon.moves,
    };
  }),
  ...COMPLETE_CATALOG,
];

const emptyEvs = (): PokemonBuild["evs"] => ({ HP: 0, Atk: 0, Def: 0, SpA: 0, SpD: 0, Spe: 0 });

export function createBuild(data: PokemonData): PokemonBuild {
  return {
    id: `${data.dex}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    species: data.name,
    item: "",
    ability: "",
    nature: "",
    moves: ["", "", "", ""],
    evs: emptyEvs(),
  };
}

export function validateTeam(team: PokemonBuild[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (team.length > 0 && team.length < 4) issues.push({ message: `A battle-ready VGC team needs at least four Pokémon. Add ${4 - team.length} more.` });
  const itemCounts = new Map<string, number>();
  team.forEach((pokemon) => itemCounts.set(pokemon.item, (itemCounts.get(pokemon.item) ?? 0) + 1));
  team.forEach((pokemon) => {
    const data = POKEMON.find((entry) => entry.name === pokemon.species);
    if (!data) return issues.push({ message: `${pokemon.species} is not supported in this Regulation MB snapshot.`, pokemonId: pokemon.id });
    if (pokemon.item && (itemCounts.get(pokemon.item) ?? 0) > 1) issues.push({ message: `${pokemon.item} is already held by another teammate. VGC uses an item clause.`, pokemonId: pokemon.id });
    if (pokemon.ability && !data.abilities.includes(pokemon.ability)) issues.push({ message: `${pokemon.ability} is not available to ${pokemon.species}.`, pokemonId: pokemon.id });
    if (Object.values(pokemon.evs).some((value) => value > CHAMPIONS_STAT_POINT_MAX)) issues.push({ message: `${pokemon.species} has more than 32 Stat Points in one stat.`, pokemonId: pokemon.id });
    if (Object.values(pokemon.evs).reduce((sum, value) => sum + value, 0) > CHAMPIONS_STAT_POINT_TOTAL) issues.push({ message: `${pokemon.species} has more than 66 total Stat Points assigned.`, pokemonId: pokemon.id });
  });
  return issues;
}

export function coachTeam(team: PokemonBuild[]): CoachInsight[] {
  if (!team.length) return [{ tone: "good", message: "Add Pokémon to start building your team." }];
  const data = team.map((build) => POKEMON.find((pokemon) => pokemon.name === build.species)!).filter(Boolean);
  const messages: CoachInsight[] = [];
  const roles = data.map((pokemon) => pokemon.role.toLowerCase());
  const moves = team.flatMap((pokemon) => pokemon.moves);
  if (!moves.some((move) => move === "Tailwind" || move === "Trick Room" || move === "Icy Wind")) messages.push({ tone: "warning", message: "This team has no obvious speed control. Tailwind, Trick Room, or Icy Wind could help." });
  else messages.push({ tone: "good", message: "You have a way to control speed, which helps your team execute its game plan." });
  if (!moves.includes("Fake Out") && !moves.includes("Follow Me") && !moves.includes("Rage Powder")) messages.push({ tone: "warning", message: "Your attackers may want a support partner with Fake Out or redirection." });
  if (roles.filter((role) => role.includes("support")).length >= 2) messages.push({ tone: "good", message: "Multiple support options give you flexible leads into different matchups." });
  if (data.filter((pokemon) => pokemon.types.includes("Fire")).length >= 2) messages.push({ tone: "warning", message: "You are leaning heavily into Fire types. Watch for shared Water and Ground pressure." });
  if (team.length >= 4) messages.push({ tone: "good", message: "You have enough Pokémon to battle. The final slots can focus on difficult matchups." });
  return messages;
}

export function exportShowdown(team: PokemonBuild[]): string {
  return team.map((pokemon) => {
    const evs = Object.entries(pokemon.evs).filter(([, value]) => value > 0).map(([stat, value]) => `${value} ${stat}`).join(" / ");
    return [
      `${pokemon.species}${pokemon.item ? ` @ ${pokemon.item}` : ""}`,
      pokemon.ability ? `Ability: ${pokemon.ability}` : "",
      `Level: 50`,
      evs ? `EVs: ${evs}` : "",
      pokemon.nature ? `${pokemon.nature} Nature` : "",
      ...pokemon.moves.filter(Boolean).map((move) => `- ${move}`),
    ].filter(Boolean).map((line) => `${line}  `).join("\n");
  }).join("\n\n");
}

export function importShowdown(text: string): PokemonBuild[] {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const species = lines[0]?.split(" @ ")[0]?.replace(/\s+\([MF]\)$/, "");
    const data = POKEMON.find((pokemon) => pokemon.name.toLowerCase() === species?.toLowerCase());
    if (!data) return null;
    const build = createBuild(data);
    const item = lines[0]?.split(" @ ")[1];
    const ability = lines.find((line) => line.startsWith("Ability: "))?.replace("Ability: ", "");
    const nature = lines.find((line) => line.endsWith(" Nature"))?.replace(" Nature", "");
    const moves = lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2)).slice(0, 4);
    const evLine = lines.find((line) => line.startsWith("EVs: "))?.replace("EVs: ", "");
    const evs = emptyEvs();
    evLine?.split(" / ").forEach((entry) => {
      const [value, stat] = entry.split(" ");
      if (stat in evs) evs[stat as StatKey] = Number(value);
    });
    return { ...build, item: item ?? build.item, ability: ability ?? build.ability, nature: nature ?? build.nature, moves: moves.length === 4 ? moves : build.moves, evs };
  }).filter((pokemon): pokemon is PokemonBuild => pokemon !== null);
}
import championsCatalog from "../data/champions-regmb.json";
