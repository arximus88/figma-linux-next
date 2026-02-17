#!/usr/bin/env node
/**
 * Svelte 5 Migration Script
 * Converts Svelte 3/4 syntax to Svelte 5 Runes
 *
 * Handles:
 * - export let → $props()
 * - createEventDispatcher → callback props
 * - on:event → onevent
 * - <slot /> → {@render children()}
 * - $: reactive → $derived / $effect
 */

const fs = require("fs");
const path = require("path");
const glob = require("child_process").execSync;

const SRC_DIR = path.resolve(__dirname, "../src");

// Find all .svelte files
const files = glob(`find ${SRC_DIR} -name '*.svelte' -type f`, { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

console.log(`Found ${files.length} Svelte files to migrate\n`);

let migratedCount = 0;
let skippedCount = 0;
let errors = [];

for (const file of files) {
  try {
    const original = fs.readFileSync(file, "utf8");
    let content = original;
    const relPath = path.relative(SRC_DIR, file);
    const changes = [];

    // ===== 1. Extract export let declarations =====
    const exportLetRegex =
      /^\s*export\s+let\s+(\w+)(?:\s*:\s*([^=;]+?))?\s*(?:=\s*(.+?))?\s*;?\s*$/gm;
    const exportLetMatches = [...content.matchAll(exportLetRegex)];

    if (exportLetMatches.length > 0) {
      // Build $props() destructuring
      const propEntries = exportLetMatches.map((m) => {
        const name = m[1];
        const type = m[2]?.trim();
        const defaultVal = m[3]?.trim();

        if (defaultVal) {
          return `${name} = ${defaultVal}`;
        }
        return name;
      });

      // Build type interface
      const typeEntries = exportLetMatches
        .filter((m) => m[2]?.trim())
        .map((m) => {
          const name = m[1];
          const type = m[2].trim();
          const hasDefault = m[3]?.trim();
          return `    ${name}${hasDefault ? "?" : ""}: ${type};`;
        });

      // Build the $props() line
      let propsLine;
      if (typeEntries.length > 0) {
        propsLine = `  let { ${propEntries.join(", ")} }: {\n${typeEntries.join("\n")}\n  } = $props();`;
      } else {
        propsLine = `  let { ${propEntries.join(", ")} } = $props();`;
      }

      // Remove all export let lines and replace with $props()
      const firstExportIndex = content.indexOf(exportLetMatches[0][0]);
      const lastExport = exportLetMatches[exportLetMatches.length - 1];
      const lastExportEnd = content.indexOf(lastExport[0]) + lastExport[0].length;

      // Actually, it's safer to replace each line individually
      // First, remove all export let lines
      for (const m of exportLetMatches) {
        content = content.replace(m[0], "");
      }

      // Remove consecutive blank lines that result
      content = content.replace(/\n{3,}/g, "\n\n");

      // Insert $props() after <script> tag
      const scriptMatch = content.match(/<script[^>]*>/);
      if (scriptMatch) {
        const insertPos = content.indexOf(scriptMatch[0]) + scriptMatch[0].length;
        content = content.slice(0, insertPos) + "\n" + propsLine + content.slice(insertPos);
      }

      changes.push(`export let (${exportLetMatches.length}) → $props()`);
    }

    // ===== 2. Handle createEventDispatcher =====
    const dispatcherImportRegex =
      /\s*import\s*\{\s*createEventDispatcher\s*(?:,\s*[^}]+)?\}\s*from\s*["']svelte["']\s*;?\s*\n?/;
    const dispatcherDeclRegex = /\s*const\s+dispatch\s*=\s*createEventDispatcher\(\)\s*;?\s*\n?/;

    const hasDispatcher = dispatcherImportRegex.test(content) || dispatcherDeclRegex.test(content);

    if (hasDispatcher) {
      // Find all dispatch calls to understand which events are dispatched
      const dispatchCallRegex = /dispatch\(["'](\w+)["'](?:\s*,\s*([^)]+))?\)/g;
      const dispatchMatches = [...content.matchAll(dispatchCallRegex)];
      const eventNames = [...new Set(dispatchMatches.map((m) => m[1]))];

      if (eventNames.length > 0) {
        // Add callback props for each event
        // Check if we already have $props() from the export let migration
        const hasPropsAlready = content.includes("$props()");

        if (hasPropsAlready) {
          // Add event callbacks to existing $props()
          const callbackProps = eventNames.map((name) => {
            // Convert event names: buttonClick → onButtonClick, mouseenter → onMouseenter
            const propName = "on" + name.charAt(0).toUpperCase() + name.slice(1);
            return propName;
          });

          // Add to destructuring
          content = content.replace(
            /let\s*\{([^}]+)\}\s*(?::\s*\{[^}]+\})?\s*=\s*\$props\(\)/,
            (match, props) => {
              const newProps = props.trim() + ", " + callbackProps.join(", ");
              return match.replace(props, " " + newProps + " ");
            },
          );

          // Replace dispatch calls with direct callback calls
          for (const m of dispatchMatches) {
            const eventName = m[1];
            const payload = m[2];
            const propName = "on" + eventName.charAt(0).toUpperCase() + eventName.slice(1);

            if (payload) {
              content = content.replace(m[0], `${propName}?.(${payload})`);
            } else {
              content = content.replace(m[0], `${propName}?.()`);
            }
          }
        } else {
          // Create new $props() with just event callbacks
          const callbackProps = eventNames.map((name) => {
            const propName = "on" + name.charAt(0).toUpperCase() + name.slice(1);
            return propName;
          });

          const propsLine = `  let { ${callbackProps.join(", ")} } = $props();`;

          const scriptMatch = content.match(/<script[^>]*>/);
          if (scriptMatch) {
            const insertPos = content.indexOf(scriptMatch[0]) + scriptMatch[0].length;
            content = content.slice(0, insertPos) + "\n" + propsLine + content.slice(insertPos);
          }

          // Replace dispatch calls
          for (const m of dispatchMatches) {
            const eventName = m[1];
            const payload = m[2];
            const propName = "on" + eventName.charAt(0).toUpperCase() + eventName.slice(1);

            if (payload) {
              content = content.replace(m[0], `${propName}?.(${payload})`);
            } else {
              content = content.replace(m[0], `${propName}?.()`);
            }
          }
        }

        changes.push(`createEventDispatcher → callback props (${eventNames.join(", ")})`);
      }

      // Remove createEventDispatcher import (might be combined with other imports)
      // Handle: import { createEventDispatcher } from "svelte";
      // Handle: import { createEventDispatcher, onMount } from "svelte";
      content = content.replace(/,?\s*createEventDispatcher\s*,?/g, (match) => {
        // If it's between other imports, keep the comma
        if (match.startsWith(",") && match.endsWith(",")) return ",";
        return "";
      });

      // Clean up empty import
      content = content.replace(/import\s*\{\s*\}\s*from\s*["']svelte["']\s*;?\s*\n?/, "");

      // Remove dispatcher declaration
      content = content.replace(dispatcherDeclRegex, "");
    }

    // ===== 3. Convert on:event to onevent on DOM elements =====
    // on:click={handler} → onclick={handler}
    // on:mouseup|capture={handler} → onmouseupcapture={handler}
    // on:change={handler} → onchange={handler}
    const onEventRegex = /on:(\w+)(?:\|(\w+))?=/g;
    if (onEventRegex.test(content)) {
      content = content.replace(/on:(\w+)(?:\|(\w+))?=/g, (match, event, modifier) => {
        if (modifier === "capture") {
          return `on${event}capture=`;
        }
        // For other modifiers like preventDefault, stopPropagation — just remove the modifier
        // The handler should call event.preventDefault() etc directly
        return `on${event}=`;
      });
      changes.push("on:event → onevent");
    }

    // ===== 4. Convert <slot /> to {@render children()} =====
    if (content.includes("<slot />") || content.includes("<slot/>")) {
      // Check if children is already in $props
      if (content.includes("$props()")) {
        // Add children to existing props
        content = content.replace(
          /let\s*\{([^}]+)\}\s*(?::\s*\{[^}]+\})?\s*=\s*\$props\(\)/,
          (match, props) => {
            if (!props.includes("children")) {
              return match.replace(props, props.trim() + ", children");
            }
            return match;
          },
        );
      } else {
        // Create new $props with children
        const scriptMatch = content.match(/<script[^>]*>/);
        if (scriptMatch) {
          const insertPos = content.indexOf(scriptMatch[0]) + scriptMatch[0].length;
          content =
            content.slice(0, insertPos) +
            "\n  let { children } = $props();" +
            content.slice(insertPos);
        }
      }

      // Add Snippet import type comment for TypeScript awareness
      content = content.replace(/<slot\s*\/>/g, "{@render children?.()}");
      content = content.replace(/<slot\/>/g, "{@render children?.()}");
      changes.push("<slot /> → {@render children()}");
    }

    // ===== 5. Convert $: reactive statements =====
    // $: derived = expr; → const derived = $derived(expr);
    // $: { side_effect } → $effect(() => { side_effect });
    const reactiveStatements = /^\s*\$:\s+(.+)/gm;
    const reactiveMatches = [...content.matchAll(reactiveStatements)];

    for (const m of reactiveMatches) {
      const stmt = m[1].trim();

      // Check if it's a derivation (variable assignment)
      const derivationMatch = stmt.match(/^(?:let|const|)\s*(\w+)\s*=\s*(.+?)\s*;?\s*$/);

      if (derivationMatch) {
        const varName = derivationMatch[1];
        let expr = derivationMatch[2];
        // Remove trailing semicolon if present
        if (expr.endsWith(";")) expr = expr.slice(0, -1);
        content = content.replace(
          m[0],
          m[0].replace(/\$:\s+.+/, `let ${varName} = $derived(${expr});`),
        );
        changes.push(`$: ${varName} = ... → $derived`);
      } else if (stmt.startsWith("{")) {
        // It's a block side effect
        content = content.replace(
          m[0],
          m[0].replace(/\$:\s+\{/, "$effect(() => {").replace(/\}$/, "});"),
        );
        changes.push("$: { } → $effect");
      } else {
        // Single statement side effect
        content = content.replace(m[0], m[0].replace(/\$:\s+(.+)/, "$effect(() => { $1 });"));
        changes.push(`$: stmt → $effect`);
      }
    }

    // ===== 6. Clean up: remove trailing/leading whitespace issues =====
    content = content.replace(/\n{3,}/g, "\n\n");

    // ===== 7. Handle on:event on components (dispatch forwarding like on:click) =====
    // on:click (without handler, event forwarding) → needs callback prop
    // These are harder to auto-migrate — skip for now

    if (content !== original) {
      fs.writeFileSync(file, content);
      console.log(`✅ ${relPath}: ${changes.join(", ")}`);
      migratedCount++;
    } else {
      console.log(`⏭️  ${relPath}: no changes needed`);
      skippedCount++;
    }
  } catch (err) {
    console.error(`❌ ${path.relative(SRC_DIR, file)}: ${err.message}`);
    errors.push({ file, error: err.message });
  }
}

console.log(`\n--- Migration Summary ---`);
console.log(`Migrated: ${migratedCount}`);
console.log(`Skipped: ${skippedCount}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(`  ${e.file}: ${e.error}`));
}
