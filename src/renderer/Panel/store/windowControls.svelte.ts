let hideMinMax = $state<boolean>(false);

export const windowControls = {
  get hideMinMax() {
    return hideMinMax;
  },
  setHideMinMax(value: boolean) {
    hideMinMax = value;
  },
};
