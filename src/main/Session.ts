import { session } from "electron";

import * as Const from "Const";
import { readAppVersion } from "Utils/Main";
import { logger } from "./Logger";

export default class Session {
  private _hasFigmaSession: boolean;

  constructor() {
    this._hasFigmaSession = null;
  }

  public get hasFigmaSession() {
    return this._hasFigmaSession;
  }

  public handleAppReady = () => {
    session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
      const whitelist = [
        "fullscreen",
        "pointerLock",
        "clipboard-read",
        "clipboard-sanitized-write",
      ];
      callback(whitelist.includes(permission));
    });

    const defaultUserAgent = session.defaultSession.getUserAgent();
    // Append "Figma/<version>" tag — Figma server inspects UA for this token
    // to differentiate the official desktop client from a generic browser.
    // Without it, server-side flows like add-account silently degrade to
    // single-session mode (no multi-user session_keys). The previous regex
    // (figma-linux 0.x) only fired when UA already contained "Figma/" (Mac
    // desktop case) — useless on Linux where UA has "figma-linux-next/0.0".
    const version = readAppVersion();
    const userAgent = defaultUserAgent.includes(" Figma/")
      ? defaultUserAgent
      : `${defaultUserAgent} Figma/${version}`;
    logger.info(`[session] UA set to: ${userAgent}`);

    session.defaultSession.setUserAgent(userAgent);
    session.defaultSession.cookies
      .get({
        url: Const.HOMEPAGE,
      })
      .then((cookies) => {
        this._hasFigmaSession = !!cookies.find((cookie) => {
          return cookie.name === Const.FIGMA_SESSION_COOKIE_NAME;
        });

        // Check if cookie exists (does not guarantee active session)
        logger.info("[wm] check for figma_session cookie:", this._hasFigmaSession);
      })
      .catch((error: Error) =>
        logger.warn("[wm] failed to get cookies during handleAppReady:", Const.HOMEPAGE, error),
      );
    session.defaultSession.on("will-download", (_event, item, _webContents) => {
      const fileName = item.getFilename();
      const url = item.getURL();

      logger.info(`[Download] Starting download: ${fileName} from ${url}`);

      item.on("updated", (_event, state) => {
        if (state === "interrupted") {
          logger.warn(`[Download] Interrupted: ${fileName}`);
        } else if (state === "progressing") {
          if (item.isPaused()) {
            logger.info(`[Download] Paused: ${fileName}`);
          } else {
            // logger.info(`[Download] Progress: ${item.getReceivedBytes()} / ${item.getTotalBytes()}`);
          }
        }
      });
      item.once("done", (_event, state) => {
        if (state === "completed") {
          logger.info(`[Download] Completed: ${fileName}`);
        } else {
          logger.warn(`[Download] Failed: ${fileName} state: ${state}`);
        }
      });
    });
  };
}
