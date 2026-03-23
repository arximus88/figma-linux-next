import { app } from "electron";
import type { IpcMainEvent } from "electron";
import * as path from "path";
import * as fs from "fs";

import { DEFAULT_SETTINGS, access } from "Utils/Main";
import { logger } from "./Logger";

/**
 * Main-process settings storage.
 * IPC handlers are registered externally via IpcRegistry (see index.ts).
 */
export class Storage {
  private filePath: string;
  public settings: Types.SettingsInterface;
  private writePromise: Promise<void> | null = null;
  private nextWriteData: Types.SettingsInterface | null = null;

  constructor() {}

  public async initialize(): Promise<void> {
    if (this.filePath) return;

    this.filePath = path.join(app.getPath("userData"), "settings.json");

    await this.load();
  }

  private load = async (): Promise<void> => {
    const exist = await access(this.filePath);

    if (!exist) {
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...this.settings,
      };

      this.settings = mergedSettings;
      await this.writeAsync(mergedSettings);

      return;
    }

    this.settings = await this.readAsync();

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...this.settings,
      app: {
        ...DEFAULT_SETTINGS.app,
        ...this.settings.app,
      },
      ui: {
        ...DEFAULT_SETTINGS.ui,
        ...this.settings.ui,
      },
      theme: {
        ...DEFAULT_SETTINGS.theme,
        ...this.settings.theme,
      },
    };

    await this.writeAsync(this.settings);
  };

  private readAsync = async (): Promise<Types.SettingsInterface> => {
    try {
      const content = (await fs.promises.readFile(this.filePath)).toString();
      return JSON.parse(content);
    } catch (error) {
      logger.error("Read/Parse settings.json file error: ", error);
      logger.warn("Apply default settings instead file settings.");
      return DEFAULT_SETTINGS;
    }
  };

  private writeAsync = async (settings: Types.SettingsInterface): Promise<void> => {
    await fs.promises.writeFile(this.filePath, JSON.stringify(settings, null, 2));
  };

  public save(): Promise<void> {
    this.nextWriteData = structuredClone(this.settings);
    if (this.writePromise) {
      return this.writePromise;
    }

    this.writePromise = (async () => {
      while (this.nextWriteData !== null) {
        const dataToWrite = this.nextWriteData;
        this.nextWriteData = null;
        try {
          await this.writeAsync(dataToWrite);
        } catch (e) {
          logger.error("Error saving settings.json:", e);
        }
      }
      this.writePromise = null;
    })();
    return this.writePromise;
  }

  public setFeatureFlags(_: IpcMainEvent, data: { featureFlags: Types.FeatureFlags }) {
    this.settings.app.featureFlags = {
      ...this.settings.app.featureFlags,
      ...data.featureFlags,
    };
  }

  public getSettings() {
    return this.settings;
  }
}

export const storage = new Storage();
