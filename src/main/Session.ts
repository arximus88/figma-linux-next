import { session, Event, Cookie, app } from "electron";

import * as Const from "Const";
import { logger } from "./Logger";
import { isSameCookieDomain } from "Utils/Main";

export default class Session {
  private _hasFigmaSession: boolean;
  private assessSessionTimer: NodeJS.Timer;

  constructor() {
    this._hasFigmaSession = null;
    this.assessSessionTimer = null;
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
    const userAgent = defaultUserAgent.replace(/Figma([^/]+)\/([^\s]+)/, "Figma$1/$2 Figma/$2");

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
    session.defaultSession.on("will-download", (event, item, webContents) => {
      const fileName = item.getFilename();
      const url = item.getURL();

      logger.info(`[Download] Starting download: ${fileName} from ${url}`);

      item.on("updated", (event, state) => {
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
      item.once("done", (event, state) => {
        if (state === "completed") {
          logger.info(`[Download] Completed: ${fileName}`);
        } else {
          logger.warn(`[Download] Failed: ${fileName} state: ${state}`);
        }
      });
    });
  };
}
