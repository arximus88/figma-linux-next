<script lang="ts">
  let {width = "auto", padding = "auto", whiteSpace = "nowrap", overflow = "auto", textOverflow = "auto", size = "auto", color: colorProp = "var(--text)", disabledColor = "var(--text-disabled)", disabled = false, children, ...rest} = $props();

  let color = $derived((typeof disabled === "boolean" && disabled) ? disabledColor : colorProp);
</script>

<span
  {...rest}
  style={`
    --size: ${size};
    --width: ${width};
    --color: ${color};
    --padding: ${padding};
    --overflow: ${overflow};
    --whiteSpace: ${whiteSpace};
    --textOverflow: ${textOverflow};
  `}
>
  {@render children?.()}
</span>

<style>
  span {
    color: var(--color);
    width: var(--width);
    padding: var(--padding);
    overflow: var(--overflow);
    white-space: var(--whiteSpace);
    text-overflow: var(--textOverflow);
    font-size: var(--size);
  }
</style>
