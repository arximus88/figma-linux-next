<script lang="ts">
  import Button from "./Button.svelte";

  let {
    width = "inherit",
    height = "36px",
    margin = "inherit",
    padding = "0 7px",
    normalFgColor = "var(--fg-toolbar-active)",
    normalBgColor = "var(--bg-toolbar-active)",
    activeBgColor = "var(--bg-toolbar-active)",
    hoverBgColor = "var(--bg-toolbar-active)",
    activeFgColor = "var(--fg-active)",
    hoverFgColor = "var(--fg-toolbar-active)",
    disabled = false,
    isActive = false,
    normalBorder = "none",
    activeBorder = "none",
    hoverBorder = "none",
    normalCursor = "pointer",
    activeCursor = "pointer",
    hoverCursor = "pointer",
    onButtonClick = undefined,
    children = undefined
  } = $props();
</script>

<Button
  {width}
  {height}
  {margin}
  {padding}
  {normalFgColor}
  {normalBgColor}
  {normalBorder}
  {hoverBgColor}
  {hoverBorder}
  {hoverFgColor}
  {activeBgColor}
  {activeBorder}
  {activeFgColor}
  {normalCursor}
  {activeCursor}
  {hoverCursor}
  {disabled}
  {isActive}
  {onButtonClick}
>
  {@render children?.()}
</Button>
