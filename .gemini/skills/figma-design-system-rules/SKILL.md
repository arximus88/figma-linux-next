---
name: figma-design-system-rules
description: Generates custom design system rules for the user's codebase. Use when user says "create design system rules", "set up design rules", or wants to establish project-specific conventions for Figma-to-code workflows. Requires Figma MCP server.
---

# Create Design System Rules

This skill helps you generate custom design system rules tailored to your project's specific needs. These rules guide AI coding agents to produce consistent, high-quality code when implementing Figma designs.

## Supported Rule Files

| Agent | Rule File |
|-------|-----------|
| Gemini CLI | `GEMINI.md` |
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursor/rules/figma-design-system.mdc` |

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Run the Create Design System Rules Tool

Call the Figma MCP server's `create_design_system_rules` tool for the initial template.
- `clientLanguages`: e.g., "typescript,javascript".
- `clientFrameworks`: e.g., "react", "vue", "svelte", "unknown".

### Step 2: Analyze the Codebase

Identify project-specific patterns:
- **Component Organization:** Where are UI components? (e.g., `src/components/ui/`)
- **Styling Approach:** (e.g., Tailwind, CSS Modules)
- **Design Tokens:** (e.g., CSS variables, theme files)
- **Naming Conventions:** (e.g., PascalCase)

### Step 3: Generate Project-Specific Rules

Based on your analysis, create rules including:
- **General Component Rules:** Location, naming, export patterns.
- **Styling Rules:** Framework, token location, spacing system.
- **Figma MCP Integration Rules:** Required implement-design workflow (context, screenshot, assets).
- **Asset Handling Rules:** Location for downloaded assets, handling of localhost sources.

### Step 4: Save Rules

Save the generated rules to the corresponding file:
- **Gemini CLI:** `GEMINI.md` in the project root.
- **Claude Code:** `CLAUDE.md` in the project root.
- **Cursor:** `.cursor/rules/figma-design-system.mdc`.

For Cursor, use YAML frontmatter:
```markdown
---
description: Rules for implementing Figma designs using the Figma MCP server.
globs: "src/components/**"
alwaysApply: false
---
[Generated rules here]
```

## Best Practices

- **Be Specific:** Instead of "Use the design system," write "Use Button components from `src/components/ui/Button.tsx`."
- **IMPORTANT:** Use "IMPORTANT:" for critical rules.
- **Actionable:** Tell the agent exactly what to do, not just what to avoid.
