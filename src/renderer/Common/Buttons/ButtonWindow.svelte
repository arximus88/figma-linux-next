<script lang="ts">
  import Button from "./Button.svelte";

  let {
    padding = "0px",
    normalBgColor = "transparent",
    activeBgColor = "var(--frame-btn-active, rgba(255, 255, 255, 0.15))",
    hoverBgColor = "var(--frame-btn-hover, rgba(255, 255, 255, 0.1))",
    isActive = false,
    onButtonClick,
    children,
  } = $props();
</script>

<Button {padding} {normalBgColor} {activeBgColor} {hoverBgColor} {isActive} {onButtonClick}>
  {@render children?.()}
</Button>
