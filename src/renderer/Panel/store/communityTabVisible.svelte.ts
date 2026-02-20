let visible = $state<boolean>(false);

export const communityTabVisible = {
  get value() {
    return visible;
  },
  set(value: boolean) {
    visible = value;
  },
  toggle() {
    visible = !visible;
  },
};
