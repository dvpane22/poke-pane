import fs from "node:fs/promises";

const catalog = JSON.parse(await fs.readFile("data/champions-regmb.json", "utf8"));
const championsSprites = await fs.readFile("data/champions-menu-sprites.json", "utf8")
  .then(JSON.parse)
  .catch(() => ({ references: [] }));
const assetsBySpecies = new Map();
for (const asset of championsSprites.references ?? []) {
  const current = assetsBySpecies.get(asset.speciesId) ?? [];
  current.push(asset.asset);
  assetsBySpecies.set(asset.speciesId, current);
}
const references = catalog.map((pokemon) => ({
  id: pokemon.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name: pokemon.name,
  dex: pokemon.dex,
  sprite: pokemon.sprite,
  assets: assetsBySpecies.get(pokemon.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) ?? [],
}));

await fs.mkdir("public", { recursive: true });
await fs.writeFile("public/battle-reference-manifest.json", `${JSON.stringify({ version: 1, references }, null, 2)}\n`);
const spriteCount = references.reduce((count, reference) => count + reference.assets.length, 0);
console.log(`Generated ${references.length} Battle Companion reference entries with ${spriteCount} Champions menu sprites.`);
