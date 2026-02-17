<script lang="ts">
  let {round = 0, size = undefined, width: _width = "auto", height: _height = "auto", padding = "auto", normalFgColor = "var(--fg-header)", hoverFgColor = "var(--fg-tab-hover)", normalBgColor = "var(--bg-header)", hoverBgColor = "var(--bg-tab-hover)", normalOpacity = 0.4, hoverOpacity = 1, disabled = false, onButtonClick = undefined, onMouseenter = undefined, onMouseleave = undefined, children = undefined} = $props();

  let width = $derived(size ? `${size}px` : _width);
  let height = $derived(size ? `${size}px` : _height);

  function clickHandler(event: MouseEvent) {
    if (!disabled) {
      onButtonClick?.();
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  onmouseupcapture={clickHandler}
  onmouseenter={(e) => onMouseenter?.(e)}
  onmouseleave={(e) => onMouseleave?.(e)}
  style={`
    --padding: ${padding};
    --width: ${width};
    --height: ${height};
    --border-radius: ${round}px;
    --normal-bg-color: ${normalBgColor};
    --hover-bg-color: ${hoverBgColor};

    --normal-fg-color: ${normalFgColor};
    --hover-fg-color: ${hoverFgColor};

    --normal-opacity: ${normalOpacity};
    --hover-opacity: ${hoverOpacity};
  `}
>
  {@render children?.()}
</div>

<style>
  div {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--normal-bg-color);
    color: var(--normal-fg-color);
    border-radius: var(--border-radius);
    width: var(--width);
    height: var(--height);
    padding: var(--padding);
    opacity: var(--normal-opacity);
    transition: all 0.1s ease;
  }
  div:hover {
    fill: var(--hover-fg-color);
    color: var(--hover-fg-color);
    opacity: var(--hover-opacity);
  }
</style>
