let visible = $state<boolean>(true);

export const newFileVisible = {
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
