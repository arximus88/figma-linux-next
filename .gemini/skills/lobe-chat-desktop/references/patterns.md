# LobeChat Desktop Patterns

## 1. ControllerModule & @IpcMethod

Controllers handle the main-process logic and expose methods to the renderer via IPC.

```typescript
import { ControllerModule, IpcMethod } from 'lobe-chat-desktop';

export class FileSystemController extends ControllerModule {
  @IpcMethod()
  async selectDirectory(options: OpenDialogOptions): Promise<string[]> {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      ...options,
    });
    return filePaths;
  }
}
```

## 2. IPC Registry

Register controllers to make them available for the renderer.

```typescript
import { IpcRegistry } from 'lobe-chat-desktop';
import { FileSystemController } from './FileSystemController';

export const registerControllers = (registry: IpcRegistry) => {
  registry.register(new FileSystemController());
};
```

## 3. Shared IPC Types

Define the interface for your IPC methods to ensure type safety between processes.

```typescript
export interface IpcApi {
  'file:selectDirectory': (options: OpenDialogOptions) => Promise<string[]>;
}
```

## 4. Renderer Service

Consume the IPC methods in the renderer process.

```typescript
import { createIpcClient } from 'lobe-chat-desktop-client';

const client = createIpcClient<IpcApi>();

export const selectDirectory = async (options: OpenDialogOptions) => {
  return await client.call('file:selectDirectory', options);
};
```
