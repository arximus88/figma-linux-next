<script lang="ts">
  let { size = undefined, value = $bindable(), key = "", width: _width = "auto", height: _height = "auto", onMouseClick = undefined, onchange = undefined } = $props();

  let width = $derived(size ? `${size}px` : _width);
  let height = $derived(size ? `${size}px` : _height);

  function onMouseDownHandler(event: MouseEvent) {
    onMouseClick?.({ input: event.target, button: event.button, value, key });
  }
</script>

<input
  bind:value
  type="color"
  style={`
    --inputWidth: ${width};
    --inputHeight: ${height};
  `}
  {onchange}
  onmousedown={onMouseDownHandler}
/>

<style>
  input {
    width: var(--inputWidth);
    height: var(--inputHeight);
    background-color: transparent;
    border: none;
    outline: none;
    margin: 0;
    padding: 0;
  }

  input::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  input::-webkit-color-swatch {
    /* border: 1px solid var(--borders); */
    border: 0;
    border-radius: 3px;
  }

  input:focus,
  input:active {
    background-color: transparent;
  }
</style>
