declare module "*.css" {}

declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component;
  export default component;
}

declare module "*.png?inline" {
  const dataUrl: string;
  export default dataUrl;
}
