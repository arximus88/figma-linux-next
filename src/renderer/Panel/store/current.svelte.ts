/** A tab the strip can show as active; "settingsTab" exists only in the panel (see Main/Ui/SettingsTab). */
export type PanelTabId = Types.TabIdType | "settingsTab";

let current = $state<PanelTabId>("mainTab");

export const currentTab = {
  get value() {
    return current;
  },
  set(value: PanelTabId) {
    current = value;
  },
};
