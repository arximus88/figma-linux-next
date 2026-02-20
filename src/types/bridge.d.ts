/**
 * FigmaApi global type declaration
 * Makes `window.figmaApi` available in renderer TypeScript files.
 */

interface FigmaApi {
  send(channel: string, ...args: any[]): void;
  invoke(channel: string, ...args: any[]): Promise<any>;
  on(channel: string, listener: (...args: any[]) => void): () => void;
  once(channel: string, listener: (...args: any[]) => void): void;
}

interface Window {
  figmaApi: FigmaApi;
}

/**
 * Convenience accessor for use in renderer modules.
 * Usage: import { figmaApi } from "Bridge";
 */
declare const figmaApi: FigmaApi;
