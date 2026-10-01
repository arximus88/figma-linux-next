/** Whether this window has a Settings tab in its strip (see Main/Ui/SettingsTab). */
let open = $state<boolean>(false);

export const settingsTabOpen = {
  get value() {
    return open;
  },
  set(value: boolean) {
    open = value;
  },
};
