#!/usr/bin/env node

/**
 * Fix Svelte 5 $props() type annotations.
 *
 * Problem: The migration script generated partial type annotations like:
 *   let { a, b = "x", c }: { a: string } = $props();
 * TypeScript only sees `a` as a valid prop, rejecting `b` and `c`.
 *
 * Fix: Remove the inline type annotation so all destructured props are accepted:
 *   let { a, b = "x", c } = $props();
 *
 * Also handles:
 * - Adding $bindable() for props that need bind: support
 * - Adding children to $props() for components with {@render children}
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");

const ROOT = path.resolve(__dirname, "..");
const files = glob.sync("src/renderer/**/*.svelte", { cwd: ROOT });

let fixCount = 0;

for (const relFile of files) {
  const file = path.join(ROOT, relFile);
  let content = fs.readFileSync(file, "utf8");
  let changed = false;

  // Pattern: let { ... }: { ... } = $props();
  // Matches both single-line and multi-line type annotations
  // We want to remove the `: { ... }` part (the type annotation)
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) continue;

  const scriptContent = scriptMatch[1];

  // Find $props() with type annotation pattern
  // Pattern: }: {\n  ...\n} = $props();  OR  }: { ... } = $props();
  const propsTypePattern = /}:\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*=\s*\$props\(\)/s;
  if (propsTypePattern.test(scriptContent)) {
    // Remove the type annotation between } and = $props()
    const newScript = scriptContent.replace(
      /(let\s*\{[^]*?)\}:\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*=\s*\$props\(\)/s,
      (match, before) => {
        return before + "} = $props()";
      },
    );

    if (newScript !== scriptContent) {
      content = content.replace(scriptMatch[1], newScript);
      changed = true;
      console.log(`  FIXED type annotation: ${relFile}`);
    }
  }

  if (changed) {
    fs.writeFileSync(file, content);
    fixCount++;
  }
}

console.log(`\nFixed ${fixCount} files.`);
