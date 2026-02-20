let menuOpen = $state<boolean>(false);

export const isMenuOpen = {
  get value() {
    return menuOpen;
  },
  set(value: boolean) {
    menuOpen = value;
  },
  toggle() {
    menuOpen = !menuOpen;
  },
};
