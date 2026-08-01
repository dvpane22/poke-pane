import fs from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

const spriteManifest = JSON.parse(await fs.readFile("data/champions-menu-sprites.json", "utf8"));
const modelId = "Xenova/clip-vit-base-patch32";
const output = "public/battle-reference-embeddings.json";
const references = spriteManifest.references ?? [];

function normalize(vector) {
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(7)));
}

env.useBrowserCache = false;
env.allowLocalModels = false;
console.log("Loading the CLIP image encoder (downloaded once and cached locally)…");
const extractor = await pipeline("image-feature-extraction", modelId, {
  dtype: "q8",
  progress_callback: (event) => {
    if (event.status === "progress" && typeof event.progress === "number") {
      process.stdout.write(`\rLoading model: ${Math.round(event.progress)}%`);
    }
  },
});
console.log("\nEncoding Champions menu sprites…");

const encoded = [];
const batchSize = 12;
for (let start = 0; start < references.length; start += batchSize) {
  const batch = references.slice(start, start + batchSize);
  const paths = batch.map((reference) => path.resolve("public", reference.asset.replace(/^\//, "")));
  const features = await extractor(paths);
  const width = features.dims.at(-1);
  if (!width || features.data.length !== batch.length * width) {
    throw new Error(`Unexpected embedding shape ${features.dims.join(" × ")}.`);
  }
  for (let index = 0; index < batch.length; index += 1) {
    const offset = index * width;
    encoded.push({
      speciesId: batch[index].speciesId,
      asset: batch[index].asset,
      embedding: normalize(Array.from(features.data.slice(offset, offset + width))),
    });
  }
  console.log(`Encoded ${Math.min(start + batch.length, references.length)}/${references.length} sprites.`);
}

await fs.writeFile(output, JSON.stringify({ version: 1, model: modelId, dimensions: encoded[0]?.embedding.length ?? 0, references: encoded }));
console.log(`Wrote ${encoded.length} image embeddings to ${output}.`);
