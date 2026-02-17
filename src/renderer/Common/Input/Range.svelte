<script lang="ts">
  let { value = $bindable(), readonly = false, max = 0, min = 100, step = 1, width = "auto", thumbSize = "16px", trackSize = "2px", onchange = undefined } = $props();

</script>

<input
  style={`
    --inputWidth: ${width};
    --thumbSize: ${thumbSize};
    --trackSize: ${trackSize};
  `}
  type="range"
  {readonly}
  {min}
  {max}
  {step}
  bind:value
  {onchange}
/>

<style>
  input {
    background-color: transparent;
    -webkit-appearance: none;
    appearance: none;
    height: var(--thumbSize);
    margin: 0;
    padding: 0;
    border: 0;
    width: var(--inputWidth);
  }

  input::-webkit-slider-runnable-track {
    background: var(--text);
    height: var(--trackSize);
    border-radius: calc(var(--trackSize) / 2);
  }

  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    border: 1 solid var(--text);
    background: var(--text);
    width: var(--thumbSize);
    height: var(--thumbSize);
    border-radius: calc(var(--thumbSize));
    margin-top: calc(((var(--thumbSize) - var(--trackSize)) / 2) * -1);
  }

  input:hover::-webkit-slider-thumb {
    cursor: pointer;
  }

  input:hover::-webkit-slider-runnable-track {
    cursor: pointer;
  }
</style>
