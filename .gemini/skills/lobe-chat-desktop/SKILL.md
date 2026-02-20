---
name: lobe-chat-desktop
description: Architectural patterns for Electron desktop features (IPC handlers, windowing, and menu configuration) inspired by the LobeChat desktop repository. Use when building or refactoring Electron-based desktop apps to follow a Controller-based IPC architecture.
---

# LobeChat Desktop Patterns

This skill guides the implementation of Electron desktop features using a Controller-based Inter-Process Communication (IPC) architecture.

## Core Architecture

The architecture follows a modular approach:
- **Main Process**: Uses `ControllerModule` classes and `@IpcMethod` decorators to handle system APIs.
- **IPC Registry**: Centralizes controller registration and IPC routing.
- **Renderer Process**: Reuses web code and consumes IPC methods via typed services.
- **Preload Scripts**: Securely exposes minimal, typed API surfaces.

## Workflows

### 1. Adding a New Controller

1.  Create a class inheriting from `ControllerModule` in `src/main/controllers/`.
2.  Use `@IpcMethod()` on methods you want to expose.
3.  Register the controller in `src/main/controllers/registry.ts`.
4.  Define shared IPC types for the interface.

See [references/patterns.md](references/patterns.md) for implementation examples.

### 2. Consuming IPC in Renderer

1.  Use the typed client to call IPC methods from services in `src/renderer/services/`.
2.  Ensure methods are asynchronous to avoid UI jank.

### 3. Testing

1.  Add unit tests for main-process controllers in `__tests__/` directories.
2.  Mock Electron APIs for isolated testing.

See [references/testing.md](references/testing.md) for testing patterns.

## Best Practices

- **Security**: Validate all IPC inputs and keep the main-process API surface minimal.
- **Performance**: Batch data transfers and prefer asynchronous calls.
- **UX**: Use progress indicators and handle errors gracefully.
