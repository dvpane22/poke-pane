/// <reference lib="webworker" />

type Point = { x: number; y: number };
type Reference = { id: string; name: string; sprite: string };
type Candidate = { speciesId: string; confidence: number };
type SpriteEmbedding = { speciesId: string; embedding: number[] };

type CorrectMessage = {
  type: "correct";
  requestId: number;
  frame: ImageBitmap;
  points: Point[];
};

type ScanMessage = {
  type: "scan";
  requestId: number;
  frame: ImageBitmap;
  points: Point[];
  references: Reference[];
  embeddings: SpriteEmbedding[];
};

type Classification = { label: string; score: number };
type VisionClassifier = (input: string | ImageBitmap | Array<string | ImageBitmap>, candidateLabels: string[], options: {
  hypothesis_template: string;
}) => Promise<Classification[] | Classification[][]>;

let classifier: VisionClassifier | null = null;
type ImageEmbedder = (input: string | Array<string>) => Promise<{ data: Float32Array; dims: number[] }>;
let imageEmbedder: ImageEmbedder | null = null;

self.onmessage = async (event: MessageEvent<CorrectMessage | ScanMessage>) => {
  const message = event.data;
  try {
    if (message.type === "correct") {
      const frame = await correctFrame(message.frame, message.points);
      self.postMessage({ type: "corrected", requestId: message.requestId, frame }, [frame]);
      return;
    }

    self.postMessage({ type: "progress", requestId: message.requestId, value: 0.04, label: "Correcting the game display…" });
    const corrected = await correctFrame(message.frame, message.points);
    const results = await classifyOpponentSlots(corrected, message.references, message.embeddings, (value, label) => {
      self.postMessage({ type: "progress", requestId: message.requestId, value, label });
    });
    // Keep the exact six portrait crops visible in the UI. This lets the player tell
    // whether an incorrect result came from a bad crop or from a weak visual match.
    const crops = Array.from({ length: 6 }, (_, index) => cropOpponentSlot(corrected, index).transferToImageBitmap());
    self.postMessage({ type: "scanned", requestId: message.requestId, slots: results, frame: corrected, crops }, [corrected, ...crops]);
  } catch (error) {
    self.postMessage({ type: "error", requestId: message.requestId, message: error instanceof Error ? error.message : "Vision processing failed." });
  }
};

async function correctFrame(frame: ImageBitmap, points: Point[]) {
  if (points.length !== 4) throw new Error("Select all four display corners before continuing.");
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas processing is unavailable in this browser.");
  context.drawImage(frame, 0, 0);
  frame.close();

  try {
    const cv = await import("@techstark/opencv-js");
    await waitForOpenCv(cv);
    const source = cv.matFromImageData(context.getImageData(0, 0, canvas.width, canvas.height));
    const destination = new cv.Mat();
    const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap((point) => [point.x, point.y]));
    const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1280, 0, 1280, 720, 0, 720]);
    const transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
    cv.warpPerspective(source, destination, transform, new cv.Size(1280, 720), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    const output = new OffscreenCanvas(1280, 720);
    const outputContext = output.getContext("2d");
    if (!outputContext) throw new Error("Canvas processing is unavailable in this browser.");
    outputContext.putImageData(new ImageData(new Uint8ClampedArray(destination.data), destination.cols, destination.rows), 0, 0);
    source.delete();
    destination.delete();
    sourcePoints.delete();
    destinationPoints.delete();
    transform.delete();
    return output.transferToImageBitmap();
  } catch (error) {
    // Keep pairing usable when a browser blocks WebAssembly. The calibrated quadrilateral
    // still constrains the image to its bounding box, while the UI explains detection can be corrected manually.
    const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
    const maxX = Math.min(canvas.width, Math.ceil(Math.max(...points.map((point) => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
    const maxY = Math.min(canvas.height, Math.ceil(Math.max(...points.map((point) => point.y))));
    if (maxX <= minX || maxY <= minY) throw error;
    const output = new OffscreenCanvas(1280, 720);
    const outputContext = output.getContext("2d");
    if (!outputContext) throw error;
    outputContext.drawImage(canvas, minX, minY, maxX - minX, maxY - minY, 0, 0, 1280, 720);
    return output.transferToImageBitmap();
  }
}

async function waitForOpenCv(cv: typeof import("@techstark/opencv-js")) {
  if (cv.Mat) return;
  await new Promise<void>((resolve) => {
    const previous = cv.onRuntimeInitialized;
    cv.onRuntimeInitialized = () => {
      previous?.();
      resolve();
    };
  });
}

async function classifyOpponentSlots(frame: ImageBitmap, references: Reference[], embeddings: SpriteEmbedding[], progress: (value: number, label: string) => void) {
  if (embeddings.length) return classifyWithChampionsSprites(frame, embeddings, progress);
  return classifyWithTextLabels(frame, references, progress);
}

async function classifyWithTextLabels(frame: ImageBitmap, references: Reference[], progress: (value: number, label: string) => void) {
  const model = await getClassifier(progress);
  const labels = references.map((reference) => reference.name);
  // Run all six crops as a single CLIP batch. This avoids encoding the 234 label prompts six
  // separate times and keeps scan latency low enough to be useful in a live match.
  progress(0.22, "Reading the six opponent portraits locally…");
  const imageUrls = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
    const blob = await cropOpponentSlot(frame, index).convertToBlob({ type: "image/png" });
    return URL.createObjectURL(blob);
  }));
  let outputs: Classification[][];
  try {
    const result = await model(imageUrls, labels, { hypothesis_template: "a Pokémon battle-game portrait of {}" });
    outputs = (Array.isArray(result[0]) ? result : [result]) as Classification[][];
  } finally {
    imageUrls.forEach((imageUrl) => URL.revokeObjectURL(imageUrl));
  }
  const slots = outputs.slice(0, 6).map((output) => output.slice(0, 3).map((match) => ({
    speciesId: references.find((reference) => reference.name === match.label)?.id ?? "",
    confidence: Math.max(0, Math.min(1, Number(match.score) || 0)),
  })).filter((match) => match.speciesId));
  progress(0.98, "Preparing editable suggestions…");
  return slots;
}

async function classifyWithChampionsSprites(frame: ImageBitmap, embeddings: SpriteEmbedding[], progress: (value: number, label: string) => void) {
  const model = await getImageEmbedder(progress);
  progress(0.26, "Comparing the six portraits with Champions menu sprites…");
  const imageUrls = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
    const blob = await cropOpponentSlot(frame, index).convertToBlob({ type: "image/png" });
    return URL.createObjectURL(blob);
  }));
  try {
    const features = await model(imageUrls);
    const width = features.dims.at(-1);
    if (!width || features.data.length < width * 6) throw new Error("Could not read the six opponent portraits.");
    const slots: Candidate[][] = [];
    for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
      const vector = normalizeVector(features.data.slice(slotIndex * width, (slotIndex + 1) * width));
      const bestBySpecies = new Map<string, number>();
      for (const reference of embeddings) {
        if (reference.embedding.length !== vector.length) continue;
        const similarity = dot(vector, reference.embedding);
        if (similarity > (bestBySpecies.get(reference.speciesId) ?? -Infinity)) {
          bestBySpecies.set(reference.speciesId, similarity);
        }
      }
      slots.push([...bestBySpecies.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([speciesId, confidence]) => ({ speciesId, confidence: Math.max(0, Math.min(1, confidence)) })));
      progress(0.38 + ((slotIndex + 1) / 6) * 0.56, `Matching opponent ${slotIndex + 1} of 6…`);
    }
    progress(0.98, "Preparing editable Champions matches…");
    return slots;
  } finally {
    imageUrls.forEach((imageUrl) => URL.revokeObjectURL(imageUrl));
  }
}

function normalizeVector(vector: Float32Array) {
  const magnitude = Math.hypot(...vector) || 1;
  return Array.from(vector, (value) => value / magnitude);
}

function dot(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += left[index] * right[index];
  return total;
}

function cropOpponentSlot(frame: ImageBitmap, index: number) {
  // Champions places six opponent cards in a fixed rail at the far right of its 1280×720
  // preview. Only retain the portrait well at the left of the card. The old 100×78 crop
  // included the pink card, type/gender icons, and text, all of which drowned out the sprite.
  const canvas = new OffscreenCanvas(160, 160);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas processing is unavailable in this browser.");
  context.fillStyle = "#090d12";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const top = 110 + index * 90;
  context.drawImage(frame, 1081, top, 63, 63, 16, 16, 128, 128);
  return canvas;
}

async function getImageEmbedder(progress: (value: number, label: string) => void) {
  if (imageEmbedder) return imageEmbedder;
  progress(0.08, "Loading the on-device visual matcher (first scan only)…");
  const { env, pipeline } = await import("@huggingface/transformers");
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const instance = await pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32", {
    dtype: "q8",
    progress_callback: (event: { progress?: number; status?: string }) => {
      if (typeof event.progress === "number") progress(0.08 + Math.min(event.progress, 100) / 100 * 0.16, "Caching the on-device visual matcher…");
      else if (event.status === "done") progress(0.24, "Champions references ready. Matching portraits…");
    },
  });
  imageEmbedder = instance as unknown as ImageEmbedder;
  return imageEmbedder;
}

async function getClassifier(progress: (value: number, label: string) => void) {
  if (classifier) return classifier;
  progress(0.08, "Downloading the on-device vision model (first scan only)…");
  const { env, pipeline } = await import("@huggingface/transformers");
  env.useBrowserCache = true;
  env.useWasmCache = true;
  const instance = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
    dtype: "q8",
    progress_callback: (event: { progress?: number; status?: string }) => {
      if (typeof event.progress === "number") progress(0.08 + Math.min(event.progress, 100) / 100 * 0.1, "Caching the on-device vision model…");
      else if (event.status === "done") progress(0.18, "Vision model ready. Reading the team preview…");
    },
  });
  classifier = instance as unknown as VisionClassifier;
  return classifier;
}

export {};
