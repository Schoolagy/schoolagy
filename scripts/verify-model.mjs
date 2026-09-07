/**
 * Verifies the self-hosted NSFW model is complete.
 *
 * Run: node scripts/verify-model.mjs
 *
 * Worth having because a truncated or partially-committed weights file doesn't
 * fail loudly — TensorFlow.js throws something opaque at load time, screening
 * then fails closed, and every upload starts getting rejected with a generic
 * "couldn't check that image". This turns that into a clear message at build
 * time instead.
 *
 * Note the weights are uint8-QUANTIZED: each value is stored in 1 byte but
 * represents a float32. Sizing them by their logical dtype makes a perfectly
 * good file look 4x too small.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = path.resolve(HERE, "../public/models/mobilenet_v2");

const BYTES_PER_DTYPE = { float32: 4, int32: 4, uint8: 1, bool: 1, float16: 2 };

const manifestPath = path.join(MODEL_DIR, "model.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath}`);
  console.error("Image screening fails closed without it — every upload would be rejected.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let failures = 0;

for (const group of manifest.weightsManifest ?? []) {
  const expected = group.weights.reduce((total, weight) => {
    const count = weight.shape.reduce((a, b) => a * b, 1);
    // Stored dtype, not logical dtype — see the note above.
    const dtype = weight.quantization ? weight.quantization.dtype : weight.dtype;
    return total + count * (BYTES_PER_DTYPE[dtype] ?? 4);
  }, 0);

  // A group's weights are concatenated across its shard files.
  let actual = 0;
  for (const shard of group.paths) {
    const shardPath = path.join(MODEL_DIR, shard);
    if (!fs.existsSync(shardPath)) {
      console.error(`  MISSING  ${shard}`);
      failures++;
      continue;
    }
    actual += fs.statSync(shardPath).size;
  }

  if (actual === expected) {
    console.log(
      `  ok  ${group.paths.join(", ")} — ${group.weights.length} tensors, ${actual.toLocaleString()} bytes`
    );
  } else {
    console.error(
      `  FAIL ${group.paths.join(", ")} — expected ${expected.toLocaleString()} bytes, found ${actual.toLocaleString()}`
    );
    failures++;
  }
}

if (failures) {
  console.error("\nModel files are incomplete. Re-download them from:");
  console.error("  https://github.com/infinitered/nsfwjs/tree/master/models/mobilenet_v2");
  process.exit(1);
}
console.log("\nNSFW model is complete and intact.");
