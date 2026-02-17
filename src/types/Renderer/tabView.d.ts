declare namespace Types {
  interface TabItem {
    id: string;
    text: string;
    disabled?: boolean;
    itemArgs?: Types.Dic<unknown>;
    item: import("svelte").Component<any>;
  }

  interface SetingsTabItem extends TabItem {
    bodyComponent: import("svelte").Component<any>;
    headerComponent?: import("svelte").Component<any>;
  }

  interface ThemeCreatorPopupMenuItem extends TabItem {
    handler: () => void;
  }
}
