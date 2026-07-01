import { NEW_PROJECT_TAB_URL } from "Const";
import { logger } from "../Logger";
import Tab from "./Tab";

/**
 * Narrow view of the owning Window that WarmTabManager needs — passed as
 * getters so Window stays the single owner of userId / theme color and no
 * circular import on Window is introduced.
 */
export interface WarmTabHost {
  getUserId(): string;
  getBgColor(): string;
}

/**
 * WarmTabManager — the pre-warmed background "new file" tab state machine.
 *
 * Keeps a hidden, already-loaded new-file Tab ready so opening a new file is
 * instant. Owns the TTL/bootstrap/scheduling state extracted verbatim from
 * Window.ts (Phase A3 of the Window decomposition). Window keeps the public
 * methods (setUserId/newProject/setLoading/...) and delegates the warm-specific
 * logic here. No behavior change.
 */
export class WarmTabManager {
  private warmTab: Tab | null = null;
  private warmTabCreatedAt = 0;
  private warmTabScheduled = false;
  private warmTabBootstrapped = false;
  private static readonly WARM_TAB_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private windowId: number,
    private host: WarmTabHost,
  ) {}

  /** webContents id of the live warm tab, if any (for IPC routing). */
  get activeWebContentsId(): number | null {
    if (this.warmTab && !this.warmTab.view.webContents.isDestroyed()) {
      return this.warmTab.id;
    }
    return null;
  }

  isWarmTab(id: number): boolean {
    return !!this.warmTab && id === this.warmTab.id;
  }

  /**
   * React to a user-id change: a warm tab baked the previous user's id into its
   * URL, so on an actual switch tear it down and reschedule. Always ensures a
   * warm tab is scheduled once a user id is known (first boot included).
   */
  onUserIdChanged(previousId: string | undefined, newId: string): void {
    // Skip when previousId is undefined (first boot) or equal (the warm tab's
    // own setUser cascade after it bootstraps).
    if (previousId && previousId !== newId && this.warmTab) {
      if (!this.warmTab.view.webContents.isDestroyed()) {
        this.warmTab.view.webContents.destroy();
      }
      this.warmTab = null;
      this.warmTabBootstrapped = false;
      this.warmTabScheduled = false;
    }

    // Guard with warmTabScheduled to prevent cascade: the warm tab itself loads
    // Figma which sends setUser again, which would re-trigger this.
    if (!this.warmTab && !this.warmTabScheduled) {
      this.scheduleWarmTab(2000);
    }
  }

  /**
   * Track the warm tab's readiness signal (setLoading(false)). Returns true if
   * the event originated from the warm tab (and must not be forwarded).
   */
  handleSetLoading(tabId: number, loading: boolean): boolean {
    if (this.warmTab && tabId === this.warmTab.id) {
      if (loading === false) {
        this.warmTabBootstrapped = true;
      }
      return true;
    }
    return false;
  }

  /**
   * Hand off the live warm tab for promotion. Clears it, warms the next one,
   * and reports whether it had bootstrapped (so the caller can decide the
   * skeleton/loading flag). Returns null when no warm tab is ready.
   */
  takeWarmTab(): { tab: Tab; wasBootstrapped: boolean } | null {
    const warm = this.warmTab;
    if (warm && !warm.view.webContents.isDestroyed()) {
      const wasBootstrapped = this.warmTabBootstrapped;
      this.warmTab = null;
      this.warmTabBootstrapped = false;
      // Warm the next one for next time
      this.scheduleWarmTab(100);
      return { tab: warm, wasBootstrapped };
    }
    return null;
  }

  /** On window focus: re-warm if the tab died or aged past the TTL. */
  refreshIfStale(): void {
    const isAlive = this.warmTab && !this.warmTab.view.webContents.isDestroyed();
    const isStale = Date.now() - this.warmTabCreatedAt > WarmTabManager.WARM_TAB_TTL;

    if (!isAlive || isStale) {
      this.scheduleWarmTab(0);
    }
  }

  destroy(): void {
    if (this.warmTab && !this.warmTab.view.webContents.isDestroyed()) {
      this.warmTab.view.webContents.destroy();
    }
    this.warmTab = null;
  }

  private scheduleWarmTab(delayMs: number): void {
    if (this.warmTabScheduled) return;
    this.warmTabScheduled = true;
    setTimeout(() => {
      this.warmTabScheduled = false;
      this.initWarmTab();
    }, delayMs);
  }

  private initWarmTab(): void {
    const userId = this.host.getUserId();
    if (!userId) return;

    // Destroy previous warm tab if still alive
    if (this.warmTab && !this.warmTab.view.webContents.isDestroyed()) {
      this.warmTab.view.webContents.destroy();
    }

    const tab = new Tab(this.windowId);
    tab.view.setBackgroundColor(this.host.getBgColor());
    const url = new URL(NEW_PROJECT_TAB_URL);
    url.searchParams.set("fuid", userId);
    tab.loadUrl(url.toString());

    this.warmTab = tab;
    this.warmTabCreatedAt = Date.now();
    this.warmTabBootstrapped = false;
    logger.debug("WarmTab: initialized");
  }
}
