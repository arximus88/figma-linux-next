/**
 * IPC Registry — centralized registration of all main-process IPC handlers.
 *
 * Benefits:
 * - Single source of truth for channel → handler mapping
 * - Easy to audit which channels exist
 * - Prevents duplicate handler registration
 * - Type-safe handler signatures
 */
import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { logger } from "../Logger";

type IpcOnHandler = (event: IpcMainEvent, ...args: any[]) => void;
type IpcHandleHandler = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any;

interface RegisteredChannel {
  channel: string;
  type: "on" | "handle";
  source: string;
}

class IpcRegistry {
  private registered: RegisteredChannel[] = [];
  private sealed = false;

  /**
   * Register a fire-and-forget channel (ipcMain.on)
   */
  on(channel: string, handler: IpcOnHandler, source: string) {
    this.assertNotSealed(channel);
    this.assertNotDuplicate(channel);
    ipcMain.on(channel, handler);
    this.registered.push({ channel, type: "on", source });
  }

  /**
   * Register a request/response channel (ipcMain.handle)
   */
  handle(channel: string, handler: IpcHandleHandler, source: string) {
    this.assertNotSealed(channel);
    this.assertNotDuplicate(channel);
    ipcMain.handle(channel, handler);
    this.registered.push({ channel, type: "handle", source });
  }

  /**
   * Seal the registry — no more registrations allowed after this.
   * Call after all modules have registered their handlers.
   */
  seal() {
    this.sealed = true;
    logger.info(`[IpcRegistry] Sealed with ${this.registered.length} channels:`);
    for (const entry of this.registered) {
      logger.info(`  [${entry.type}] ${entry.channel} (${entry.source})`);
    }
  }

  /**
   * Get a summary of all registered channels (useful for debugging)
   */
  getSummary() {
    return this.registered.map((r) => `${r.type}:${r.channel} (${r.source})`);
  }

  private assertNotSealed(channel: string) {
    if (this.sealed) {
      throw new Error(`[IpcRegistry] Cannot register "${channel}" — registry is sealed`);
    }
  }

  private assertNotDuplicate(channel: string) {
    if (this.registered.some((r) => r.channel === channel)) {
      throw new Error(`[IpcRegistry] Duplicate registration for channel "${channel}"`);
    }
  }
}

export const ipcRegistry = new IpcRegistry();
