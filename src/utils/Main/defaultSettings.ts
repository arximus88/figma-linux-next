import { randomUUID } from "node:crypto";
import { BASE_DEFAULT_SETTINGS } from "Utils/Common/defaultSettings";

// Main-process defaults: the shared env-independent base plus the fields that
// require a Node runtime (a random clientId and $HOME-derived paths). These are
// the values actually persisted to settings.json by Storage.
export const DEFAULT_SETTINGS: Types.SettingsInterface = {
  ...BASE_DEFAULT_SETTINGS,
  clientId: randomUUID(),
  app: {
    ...BASE_DEFAULT_SETTINGS.app,
    exportDir: `${process.env.HOME}/Pictures/Figma`,
    fontDirs: [...BASE_DEFAULT_SETTINGS.app.fontDirs, `${process.env.HOME}/.local/share/fonts`],
  },
};
