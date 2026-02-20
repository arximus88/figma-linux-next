<script lang="ts">
  let {round = 0, size = undefined, width: _width = "auto", height: _height = "auto", padding: _padding = "0", margin = "0", normalFgColor = "var(--text)", activeFgColor = "var(--text-active)", hoverFgColor = "var(--text-active)", normalBgAlpha = "1", activeBgAlpha = "1", hoverBgAlpha = "1", normalBgColor = "var(--normal-bg-color, transparent)", hoverBgColor = "var(--hover-bg-color, var(--bg-tab-hover))", activeBgColor = "var(--active-bg-color, var(--bg-tab-hover))", disabledBgColor = "var(--disabled-bg-color, var(--borders))", normalBorder = "var(--normal-border, none)", activeBorder = "var(--active-border, none)", hoverBorder = "var(--hover-border, none)", normalCursor = "default", activeCursor = "default", hoverCursor = "default", isActive = false, disabled = false, onButtonClick = undefined, children = undefined} = $props();
  
  let width = $derived(size ? `${size}px` : _width);
  let height = $derived(size ? `${size}px` : _height);
  let padding = $derived(size ? "0" : _padding);

  function clickHandler(event: MouseEvent) {
    if (!disabled) {
      onButtonClick?.(event);
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  onmouseupcapture={clickHandler}
  class={`
    ${isActive ? "button__active " : ""}
    ${disabled ? "button__disabled" : ""}
  `}
  style={`
    --padding: ${padding};
    --margin: ${margin};
    --width: ${width};
    --height: ${height};
    --border-radius: ${round}px;

    --normal-bg-alpha: ${normalBgAlpha};
    --active-bg-alpha: ${activeBgAlpha};
    --hover-bg-alpha: ${hoverBgAlpha};

    --normal-bg-color: ${normalBgColor};
    --hover-bg-color: ${hoverBgColor};
    --active-bg-color: ${activeBgColor};
    --disabled-bg-color: ${disabledBgColor};

    --normal-fg-color: ${normalFgColor};
    --active-fg-color: ${activeFgColor};
    --hover-fg-color: ${hoverFgColor};

    --normal-border: ${normalBorder};
    --active-border: ${activeBorder};
    --hover-border: ${hoverBorder};

    --normal-cursor: ${normalCursor};
    --active-cursor: ${activeCursor};
    --hover-cursor: ${hoverCursor};
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
    border: var(--normal-border);
    cursor: var(--normal-cursor);
    border-radius: var(--border-radius);
    width: var(--width, 100%);
    height: var(--height, 100%);
    padding: var(--padding);
    margin: var(--margin);
    transition: all 0.08s ease;
    user-select: none;
  }
  div:hover {
    border: var(--hover-border);
    cursor: var(--hover-cursor);
    color: var(--hover-fg-color);
    background-color: var(--hover-bg-color);
  }
  div:active {
    border: var(--active-border);
    cursor: var(--active-cursor);
    color: var(--active-fg-color);
    background-color: var(--active-bg-color);
  }
  .button__active {
    border: var(--active-border);
    cursor: var(--active-cursor);
    color: var(--active-fg-color);
    background-color: var(--active-bg-color);
  }
  .button__active:hover {
    border: var(--active-border);
    cursor: var(--active-cursor);
    color: var(--active-fg-color);
    background-color: var(--active-bg-color);
  }

  .button__disabled {
    user-select: none;
    background-color: var(--disabled-bg-color);
  }
  .button__disabled:hover {
    user-select: none;
    background-color: var(--disabled-bg-color);
  }
</style>
