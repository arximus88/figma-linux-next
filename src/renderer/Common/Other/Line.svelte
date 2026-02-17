<script lang="ts">
  import type { Snippet } from "svelte";

  // Явно описуємо контракт нашого компонента
  interface Props {
    width?: string;
    height?: string;
    type?: "H" | "V";
    children?: Snippet; // Значок "?" робить контент необов'язковим
  }

  // Передаємо інтерфейс у $props()
  let { 
    width: widthProp = undefined, 
    height: heightProp = undefined, 
    type = "H", 
    children 
  }: Props = $props();

  let width = $derived(type === "H" ? (widthProp || "100%") : widthProp);
  let height = $derived(type === "V" ? (heightProp || "100%") : heightProp);
</script>

<div
  style={`
    --width: ${width};
    --height: ${height};
  `}
>
  {@render children?.()}
</div>

<style>
  div {
    border: 1px solid var(--borders);
    width: var(--width);
    height: var(--height);
  }
</style>