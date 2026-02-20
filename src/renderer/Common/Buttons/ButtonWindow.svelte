<script lang="ts">
  import Button from "./Button.svelte";

  let {
    padding = "0px",
    normalBgColor = "transparent",
    activeBgColor = "var(--window-control-active-bg, rgba(255, 255, 255, 0.15))",
    hoverBgColor = "var(--window-control-hover-bg, rgba(255, 255, 255, 0.1))",
    isActive = false,
    onButtonClick,
    children,
  } = $props();
</script>

<Button {padding} {normalBgColor} {activeBgColor} {hoverBgColor} {isActive} {onButtonClick}>
  {@render children?.()}
</Button>
