---
name: figma-implement-design
description: Translates Figma designs into production-ready code with 1:1 visual fidelity. Use when implementing UI from Figma files, "generate code", "build Figma design", or when provided with Figma URLs. Requires Figma MCP server.
---

# Implement Design

This skill provides a structured workflow for translating Figma designs into production-ready code with pixel-perfect accuracy. It ensures consistent integration with the Figma MCP server, proper use of design tokens, and 1:1 visual parity with designs.

## Prerequisites

- **Figma MCP server** must be connected and accessible.
- User must provide a Figma URL in the format: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
  - `:fileKey` is the file key.
  - `1-2` is the node ID (the specific component or frame to implement).
- **OR** when using `figma-desktop` MCP: User can select a node directly in the Figma desktop app (no URL required).

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Get Node ID

- **From URL:** Extract `:fileKey` (after `/design/`) and `node-id` (query parameter).
- **From Desktop MCP:** If no URL is provided, the `figma-desktop` MCP automatically uses the currently selected node.

### Step 2: Fetch Design Context

Run `get_design_context(fileKey=":fileKey", nodeId="1-2")`.
- If the response is too large/truncated, use `get_metadata` first to identify child nodes, then fetch them individually.

### Step 3: Capture Visual Reference

Run `get_screenshot(fileKey=":fileKey", nodeId="1-2")`. This is your source of truth for visual validation.

### Step 4: Download Required Assets

Download images/icons/SVGs returned by the Figma MCP server.
- Use `localhost` sources directly if provided.
- DO NOT import new icon packages; use the Figma payload.

### Step 5: Translate to Project Conventions

Translate the Figma output (usually React + Tailwind) into this project's framework, styles, and conventions.
- Map Figma colors to project design tokens.
- Reuse existing components (buttons, inputs) instead of duplicating logic.

### Step 6: Achieve 1:1 Visual Parity

Strive for pixel-perfect matching.
- Prioritize Figma fidelity.
- Use design system tokens over hardcoded values.
- Follow WCAG accessibility requirements.

### Step 7: Validate Against Figma

Compare the final UI against the Figma screenshot.
- Check layout (spacing, alignment, sizing).
- Check typography (font, size, weight, line height).
- Check interactive states (hover, active).

## Implementation Rules

- **Component Organization:** Place UI components in the project's designated directory.
- **Design System First:** Map Figma design tokens to project tokens. Extend existing components rather than creating new ones.
- **Code Quality:** Avoid magic numbers. Add TypeScript types for props.
