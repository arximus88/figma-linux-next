<script lang="ts">
  import Button from "./Button.svelte";

  let {
    padding = "0 7px",
    width = "auto",
    height = "36px",
    normalFgColor = "var(--text)",
    hoverFgColor = "var(--text-active)",
    normalBgColor = "transparent",
    activeBgColor = "transparent",
    hoverBgColor = "transparent",
    activeFgColor = "var(--text-active)",
    isActive = false,
    normalBorder = "1px solid var(--text)",
    activeBorder = "1px solid var(--text-active)",
    hoverBorder = "1px solid var(--text-active)",
    normalCursor = "pointer",
    activeCursor = "pointer",
    hoverCursor = "pointer",
    disabled = false,
    onButtonClick = undefined,
    children = undefined
  } = $props();
</script>

<Button
  {padding}
  {width}
  {height}
  {normalFgColor}
  {hoverFgColor}
  {normalBgColor}
  {hoverBgColor}
  {activeBgColor}
  {activeFgColor}
  {normalBorder}
  {hoverBorder}
  {activeBorder}
  {disabled}
  {isActive}
  {normalCursor}
  {activeCursor}
  {hoverCursor}
  {onButtonClick}
>
  {@render children?.()}
</Button>
