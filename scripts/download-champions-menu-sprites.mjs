import fs from "node:fs/promises";
import path from "node:path";

const API_URL = "https://archives.bulbagarden.net/w/api.php";
const CATEGORY = "Category:Champions_menu_sprites";
const catalog = JSON.parse(await fs.readFile("data/champions-regmb.json", "utf8"));
const outputDirectory = "public/champions-menu-sprites";
const outputManifest = "data/champions-menu-sprites.json";

const femaleAliases = new Set([
  "basculegion-f", "frillish-f", "jellicent-f", "hippopotas-f", "hippowdon-f",
  "indeedee-f", "meowstic-f", "oinkologne-f", "pyroar-f", "unfezant-f",
]);

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formFromName(name) {
  if (femaleAliases.has(name.toLowerCase())) return "female";
  return name.split("-").slice(1).join("-");
}

function parseTitle(title) {
  const match = title.match(/^File:Menu CP (\d{4})(?:-(.+))?\.png$/i);
  if (!match) return null;
  return { dex: Number(match[1]), form: match[2] ?? "", title };
}

async function getCategoryFiles() {
  const files = [];
  let cmcontinue = undefined;
  do {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      list: "categorymembers",
      cmtitle: CATEGORY,
      cmtype: "file",
      cmlimit: "500",
      ...(cmcontinue ? { cmcontinue } : {}),
    }).toString();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not list Champions sprites (${response.status}).`);
    const payload = await response.json();
    files.push(...(payload.query?.categorymembers ?? []));
    cmcontinue = payload.continue?.cmcontinue;
  } while (cmcontinue);
  return files;
}

async function getImageInfo(titles) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    titles: titles.join("|"),
  }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read Champions sprite URLs (${response.status}).`);
  const payload = await response.json();
  return payload.query?.pages ?? [];
}

const byDex = new Map();
for (const pokemon of catalog) {
  const current = byDex.get(pokemon.dex) ?? [];
  current.push(pokemon);
  byDex.set(pokemon.dex, current);
}

function findPokemonForSprite(sprite) {
  const choices = byDex.get(sprite.dex) ?? [];
  if (!choices.length) return null;
  if (!sprite.form || normalize(sprite.form) === "mega") {
    return choices.find((pokemon) => !formFromName(pokemon.name)) ?? choices[0];
  }
  const form = normalize(sprite.form);
  return choices.find((pokemon) => normalize(formFromName(pokemon.name)) === form)
    ?? choices.find((pokemon) => normalize(pokemon.name).endsWith(form))
    ?? null;
}

const categoryFiles = await getCategoryFiles();
const parsed = categoryFiles.map((file) => parseTitle(file.title)).filter(Boolean);
const eligible = parsed.map((sprite) => ({ sprite, pokemon: findPokemonForSprite(sprite) })).filter((entry) => entry.pokemon);
const infoByTitle = new Map();
for (let index = 0; index < eligible.length; index += 40) {
  const pages = await getImageInfo(eligible.slice(index, index + 40).map((entry) => entry.sprite.title));
  pages.forEach((page) => {
    const info = page.imageinfo?.[0];
    if (info?.url) infoByTitle.set(page.title, info);
  });
}

await fs.mkdir(outputDirectory, { recursive: true });
const references = [];
for (const { sprite, pokemon } of eligible) {
  const info = infoByTitle.get(sprite.title);
  if (!info) continue;
  const filename = `${String(sprite.dex).padStart(4, "0")}${sprite.form ? `-${slug(sprite.form)}` : ""}.png`;
  const localPath = path.join(outputDirectory, filename);
  try {
    await fs.access(localPath);
  } catch {
    const response = await fetch(info.url);
    if (!response.ok) throw new Error(`Could not download ${sprite.title} (${response.status}).`);
    await fs.writeFile(localPath, Buffer.from(await response.arrayBuffer()));
  }
  references.push({
    speciesId: slug(pokemon.name),
    name: pokemon.name,
    dex: sprite.dex,
    form: sprite.form || null,
    asset: `/${outputDirectory.replace(/^public\//, "")}/${filename}`,
    source: info.url,
  });
}

await fs.writeFile(outputManifest, `${JSON.stringify({
  version: 1,
  source: "Bulbagarden Archives / Category:Champions menu sprites",
  generatedAt: new Date().toISOString(),
  references,
}, null, 2)}\n`);

const coveredSpecies = new Set(references.map((reference) => reference.speciesId));
console.log(`Downloaded or reused ${references.length} Champions menu sprites for ${coveredSpecies.size}/${catalog.length} legal species.`);
if (coveredSpecies.size !== catalog.length) {
  const missing = catalog.filter((pokemon) => !coveredSpecies.has(slug(pokemon.name))).map((pokemon) => pokemon.name);
  console.log(`Missing assets: ${missing.join(", ")}`);
}
