let current = $state<Types.TabIdType>("mainTab");

export const currentTab = {
  get value() {
    return current;
  },
  set(value: Types.TabIdType) {
    current = value;
  },
};
