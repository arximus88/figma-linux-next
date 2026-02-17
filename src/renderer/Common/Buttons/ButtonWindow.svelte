<script lang="ts">
  import Button from "./Button.svelte";

  let {
    padding = "0px 18px",
    normalBgColor = "var(--bg-header-control)",
    activeBgColor = "var(--bg-header-control-hover)",
    hoverBgColor = "var(--bg-header-control-hover)",
    isActive = false,
    onButtonClick,
    children,
  } = $props();
</script>

<Button {padding} {normalBgColor} {activeBgColor} {hoverBgColor} {isActive} {onButtonClick}>
  {@render children?.()}
</Button>
