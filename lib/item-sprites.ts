import itemSprites from "../data/item-sprites.json";

const SPRITE_MAP = itemSprites as Record<string, string>;

export function getItemSpriteUrl(name: string): string | undefined {
  return SPRITE_MAP[name];
}

export function itemSpriteSlug(name: string): string {
  return name.toLowerCase().replace(/['’.]/g, "").replace(/\s+/g, "-");
}

export function itemSpriteFallbackUrls(name: string): string[] {
  if (!name.trim()) return [];
  const slug = itemSpriteSlug(name);
  const compact = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    SPRITE_MAP[name],
    `https://play.pokemonshowdown.com/sprites/itemicons/${slug}.png`,
    `https://www.serebii.net/itemdex/sprites/${compact}.png`,
  ].filter((url, index, list): url is string => !!url && list.indexOf(url) === index);
}
