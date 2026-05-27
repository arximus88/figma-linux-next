/**
 * AuthController — handles authentication-related IPC channels.
 */
import type { IpcMainEvent } from "electron";
import { session, shell } from "electron";

import * as Const from "Const";
import { request } from "Utils/Main";
import { isAppAuthGrandLink } from "Utils/Common";
import { storage } from "../Storage";
import { logger } from "../Logger";
import { ipcRegistry } from "./registry";
import type WindowManager from "../Ui/WindowManager";

export default class AuthController {
  constructor(private windowManager: WindowManager) {
    this.register();
  }

  private register() {
    ipcRegistry.on("setAuthedUsers", this.setAuthedUsers.bind(this), "AuthController");
    ipcRegistry.on("startAppAuth", this.startAppAuth.bind(this), "AuthController");
    ipcRegistry.on("finishAppAuth", this.finishAppAuth.bind(this), "AuthController");
    ipcRegistry.on("setInitialOptions", this.setInitialOptions.bind(this), "AuthController");
    ipcRegistry.on("setUser", this.setUser.bind(this), "AuthController");
  }

  private async setAuthedUsers(_: IpcMainEvent, userIds: string[]) {
    if (!Array.isArray(storage.settings.authedUserIDs)) {
      storage.settings.authedUserIDs = userIds;
      await storage.save();
    }

    storage.settings.authedUserIDs = [...new Set([...storage.settings.authedUserIDs, ...userIds])];
  }

  private startAppAuth(_: IpcMainEvent, data: { grantPath: string }) {
    if (isAppAuthGrandLink(data.grantPath)) {
      const url = `${Const.HOMEPAGE}${data.grantPath}?desktop_protocol=figma`;

      shell.openExternal(url);
    }
  }

  private finishAppAuth(event: IpcMainEvent, data: { redirectURL?: string | null }) {
    // Figma's SPA fires finishAppAuth without redirectURL after a successful
    // in-place add-account redeem (it updated __Host-figma.authn itself and
    // refreshed the profile switcher). Concatenating `${HOMEPAGE}${null}`
    // produces "https://www.figma.comnull/" which lands MainTab on a
    // chrome-error page and breaks the preload bridge for subsequent
    // attempts. When no redirect is given, just refresh in place.
    if (!data.redirectURL) {
      this.windowManager.reloadAllWindows();
      return;
    }

    const url = `${Const.HOMEPAGE}${data.redirectURL}`;

    this.windowManager.handleUrl(url);
    this.windowManager.reloadAllWindows();
    this.windowManager.tryHandleAppAuthRedeemUrl(data.redirectURL);

    const window = this.windowManager.getWindowByWebContentsId(event.sender.id);
    if (window) {
      setTimeout(() => {
        window.loadUrlMainTab(url);
      }, 100);
    }
  }

  private setInitialOptions(event: IpcMainEvent, data: WebApi.SetInitOptions) {
    if (data.userId) {
      storage.settings.userId = data.userId;
    }

    const window = this.windowManager.getWindowByWebContentsId(event.sender.id);

    if (window) {
      window.setUserId(data.userId);
    }
  }

  private setUser(event: IpcMainEvent, userId: string) {
    if (userId) {
      storage.settings.userId = userId;
    }

    const window = this.windowManager.getWindowByWebContentsId(event.sender.id);

    if (window) {
      window.setUserId(userId);
    }
  }

  public async logout() {
    await request({
      url: Const.LOGOUT_PAGE,
      useSessionCookies: true,
    });

    storage.settings.authedUserIDs = [];

    try {
      await Promise.all([
        session.defaultSession.clearStorageData(),
        session.defaultSession.clearCache(),
      ]);
    } catch (error) {
      logger.error(error);
    }

    this.windowManager.closeTabOnAllWindows();
    this.windowManager.loadLoginPageAllWindows();
  }
}
