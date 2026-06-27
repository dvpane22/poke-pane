import fs from "node:fs/promises";
import ts from "typescript";

const RAW = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master";
const USAGE = "https://www.smogon.com/stats/2026-06/chaos/gen9championsvgc2026regmb-1500.json";
const USAGE_FALLBACK = "https://www.smogon.com/stats/2026-05/chaos/gen9championsvgc2026regma-1500.json";

async function loadUsage() {
  for (const url of [USAGE, USAGE_FALLBACK]) {
    const response = await fetch(url);
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      if (url === USAGE_FALLBACK) console.warn("Regulation MB usage stats are not published yet; using Regulation MA usage data.");
      return response.json();
    }
  }
  throw new Error("Unable to load Champions usage data.");
}

async function loadTable(path, exportName) {
  const source = await fetch(`${RAW}/${path}`).then((response) => response.text());
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  Function("exports", "module", compiled)(module.exports, module);
  return module.exports[exportName];
}

const [pokedex, formatsData, learnsets, moves, items, championItems, abilities, moveText, itemText, abilityText, usage, spriteIndex, recentSpriteIndex] = await Promise.all([
  loadTable("data/pokedex.ts", "Pokedex"),
  loadTable("data/mods/champions/formats-data.ts", "FormatsData"),
  loadTable("data/mods/champions/learnsets.ts", "Learnsets"),
  loadTable("data/moves.ts", "Moves"),
  loadTable("data/items.ts", "Items"),
  loadTable("data/mods/champions/items.ts", "Items"),
  loadTable("data/abilities.ts", "Abilities"),
  loadTable("data/text/moves.ts", "MovesText"),
  loadTable("data/text/items.ts", "ItemsText"),
  loadTable("data/text/abilities.ts", "AbilitiesText"),
  loadUsage(),
  fetch("https://play.pokemonshowdown.com/sprites/gen5/").then((response) => response.text()),
  fetch("https://play.pokemonshowdown.com/sprites/afd/").then((response) => response.text()),
]);

const lookupName = (table, id) => table[id]?.name || id.replace(/(^|[^a-z])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
const alphabetize = (values) => values.sort((a, b) => a.localeCompare(b));
const mergedItems = Object.fromEntries(Object.keys(items).map((id) => [id, { ...items[id], ...championItems[id] }]));
const legalItems = alphabetize(Object.entries(mergedItems)
  .filter(([, item]) => !item.isNonstandard)
  .map(([id]) => lookupName(items, id)));
const spriteFiles = [...spriteIndex.matchAll(/href="\.\/([^"]+\.png)"/g)].map((match) => match[1]);
const normalizedSpriteFiles = new Map(spriteFiles.map((file) => [file.replace(/\.png$/, "").replace(/[^a-z0-9]/g, ""), file]));
const recentSpriteFiles = [...recentSpriteIndex.matchAll(/href="\.\/([^"]+\.png)"/g)].map((match) => match[1]);
const normalizedRecentSpriteFiles = new Map(recentSpriteFiles.map((file) => [file.replace(/\.png$/, "").replace(/[^a-z0-9]/g, ""), file]));
const spriteUrlFor = (name, fallbackName = name) => {
  const file = normalizedSpriteFiles.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""))
    || normalizedSpriteFiles.get(fallbackName.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return file ? `https://play.pokemonshowdown.com/sprites/gen5/${file}` : "";
};
const megaSpriteUrlFor = (name, fallbackName) => {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const currentFile = normalizedSpriteFiles.get(normalizedName);
  if (currentFile) return `https://play.pokemonshowdown.com/sprites/gen5/${currentFile}`;
  const recentFile = normalizedRecentSpriteFiles.get(normalizedName);
  if (recentFile) return `https://play.pokemonshowdown.com/sprites/afd/${recentFile}`;
  return spriteUrlFor(fallbackName);
};
const statBlock = (species) => ({
  HP: species.baseStats.hp,
  Atk: species.baseStats.atk,
  Def: species.baseStats.def,
  SpA: species.baseStats.spa,
  SpD: species.baseStats.spd,
  Spe: species.baseStats.spe,
});
const megaFormsFor = (species) => Object.values(pokedex)
  .filter((form) => form.baseSpecies === species.name && form.forme?.startsWith("Mega"))
  .map((form) => ({
    name: form.name,
    stats: statBlock(form),
    ability: Object.values(form.abilities || {})[0] || "",
    types: form.types || species.types,
    artwork: megaSpriteUrlFor(form.name, species.name),
  }));

const catalog = Object.entries(pokedex)
  .filter(([id, species]) => {
    const format = formatsData[id];
    if (!format || format.tier === "Illegal" || format.isNonstandard === "Past") return false;
    if (species.num <= 0 || species.battleOnly || species.isMega || species.requiredItem || species.requiredItems) return false;
    if (species.tags?.some((tag) => tag === "Mythical" || tag === "Restricted Legendary")) return false;
    return true;
  })
  .map(([id, species]) => {
    const stats = usage.data[species.name];
    return {
      name: species.name,
      dex: species.num,
      types: species.types,
      stats: statBlock(species),
      megaForms: megaFormsFor(species),
      sprite: spriteUrlFor(species.name),
      artwork: spriteUrlFor(species.name),
      abilities: alphabetize([...new Set(Object.values(species.abilities || {}))]),
      items: legalItems,
      moves: alphabetize(Object.keys(learnsets[id]?.learnset || {}).map((move) => lookupName(moves, move))),
      usage: stats?.usage || 0,
    };
  })
  .sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));

await fs.mkdir("data", { recursive: true });
await fs.writeFile("data/champions-regmb.json", `${JSON.stringify(catalog, null, 2)}\n`);
await fs.writeFile("data/champions-options.json", `${JSON.stringify({
  moves: Object.fromEntries(Object.entries(moves).map(([id, move]) => [move.name, {
    description: moveText[id]?.shortDesc || moveText[id]?.desc || "No description available.",
    type: move.type,
    category: move.category,
    power: move.basePower || null,
    accuracy: move.accuracy,
    priority: move.priority,
  }])),
  items: Object.fromEntries(Object.entries(items).map(([id, item]) => [item.name, {
    description: itemText[id]?.shortDesc || itemText[id]?.desc || "No description available.",
  }])),
  abilities: Object.fromEntries(Object.entries(abilities).map(([id, ability]) => [ability.name, {
    description: abilityText[id]?.shortDesc || abilityText[id]?.desc || "No description available.",
  }])),
}, null, 2)}\n`);
console.log(`Generated ${catalog.length} legal Regulation MB Pokémon.`);
