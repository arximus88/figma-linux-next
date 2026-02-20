let zoom = $state<number>(1);

export const panelZoom = {
  get value() {
    return zoom;
  },
  set(value: number) {
    zoom = value;
  },
};
