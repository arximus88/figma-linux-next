import { DEFAULT_THEME } from "Const";

let theme = $state<Themes.Theme>(structuredClone(DEFAULT_THEME));

export const themeApp = {
  get value() {
    return theme;
  },
  set(value: Themes.Theme) {
    theme = value;
  },
  reset() {
    theme = structuredClone(DEFAULT_THEME);
  },
};
