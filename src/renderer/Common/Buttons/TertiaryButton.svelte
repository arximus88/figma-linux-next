<script lang="ts">
  import Button from "./Button.svelte";

  let {
    padding = "0 7px",
    normalFgColor = "var(--text)",
    activeFgColor = "var(--fg-toolbar-active)",
    normalBgColor = "transparent",
    activeBgColor = "var(--bg-toolbar-active)",
    hoverBgColor = "transparent",
    isActive = false,
    normalBorder = "1px solid var(--text)",
    activeBorder = "1px solid var(--bg-toolbar-active)",
    hoverBorder = "1px solid var(--text)",
    normalCursor = "pointer",
    activeCursor = "pointer",
    hoverCursor = "pointer",
    onButtonClick,
    children,
  } = $props();
</script>

<Button
  {padding}
  {normalFgColor}
  {activeFgColor}
  {normalBgColor}
  {activeBgColor}
  {hoverBgColor}
  {isActive}
  {normalBorder}
  {activeBorder}
  {hoverBorder}
  {normalCursor}
  {activeCursor}
  {hoverCursor}
  round={3}
  height="36px"
  {onButtonClick}
>
  {@render children?.()}
</Button>

