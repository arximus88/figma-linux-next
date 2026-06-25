<script lang="ts">
  let { checked = $bindable(), disabled = false, label = "Toggle setting" } = $props();

  function toggle() {
    if (!disabled) checked = !checked;
  }
</script>

<button
  type="button"
  class="toggle"
  class:checked
  {disabled}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={toggle}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    position: relative;
    flex-shrink: 0;
    width: 42px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: var(--toggle-track, #4a4a4a);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  .toggle.checked {
    background: var(--accent, #18a0fb);
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .toggle:focus-visible {
    outline: 2px solid var(--accent, #18a0fb);
    outline-offset: 2px;
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: left 0.2s ease;
  }
  .toggle.checked .knob {
    left: calc(100% - 21px);
  }
</style>
