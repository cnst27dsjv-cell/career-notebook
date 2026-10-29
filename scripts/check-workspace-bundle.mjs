import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Run after build:vinext. Count all eager dependencies, not just the entry file,
// so moving code into another eagerly loaded chunk cannot hide a regression.
const root = resolve("dist/client");
const manifest = JSON.parse(readFileSync(resolve(root, ".vite/manifest.json"), "utf8"));
const visited = new Set();
function eagerBytes(key) {
  if (visited.has(key)) return 0;
  visited.add(key);
  const chunk = manifest[key];
  assert.ok(chunk, `Missing build entry: ${key}`);
  return statSync(resolve(root, chunk.file)).size +
    (chunk.imports || []).reduce((sum, dependency) => sum + eagerBytes(dependency), 0);
}

const bytes = eagerBytes("components/workspace.tsx");
console.log(`Workspace eager JavaScript: ${(bytes / 1024).toFixed(1)} KiB`);
assert.ok(bytes <= 512 * 1024, "Workspace startup exceeds 512 KiB; defer inactive views before hydration");
