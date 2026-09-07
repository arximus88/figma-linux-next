/**
 * Panel layout preferences pushed from main (`getSettings` on boot,
 * `loadSettings` after the Settings modal closes).
 */
let newTabAfterTabs = $state<boolean>(false);
let tabHoverPreviews = $state<boolean>(true);

export const layout = {
  /** `app.newTabButtonAfterTabs`: the "+" sits after the last tab instead of in the left corner. */
  get newTabAfterTabs() {
    return newTabAfterTabs;
  },
  setNewTabAfterTabs(value: boolean) {
    newTabAfterTabs = value;
  },
  /** `app.tabHoverPreviews`: hover a tab to get a card with its last thumbnail. */
  get tabHoverPreviews() {
    return tabHoverPreviews;
  },
  setTabHoverPreviews(value: boolean) {
    tabHoverPreviews = value;
  },
};
