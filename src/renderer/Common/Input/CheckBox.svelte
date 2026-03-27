<script lang="ts">
  let { text, checked = $bindable(), checkSize = "14px", checkWidth = "30px", checkBorder = "1px", description = "", badge = "" } = $props();
</script>

<div
  style={`
    --checkSize: ${checkSize};
    --checkWidth: ${checkWidth};
    --checkBorder: ${checkBorder};
  `}
>
  <label>
    <input bind:checked type="checkbox" />
    <span>{text}{#if badge} <span class="badge">{badge}</span>{/if}</span>
  </label>
  {#if description}
    <span class="info-icon" data-tooltip={description} aria-label={description}>i</span>
  {/if}
</div>

<style>
  div {
    display: flex;
    align-items: center;
    width: 100%;
    color: var(--text);
    padding: 6px 0;
  }
  div > label {
    position: relative;
    flex-grow: 1;
    cursor: pointer;
  }

  div > label > span {
    position: relative;
    padding-left: 40px;
    user-select: none;
  }

  /* Track (unchecked) */
  div > label > span::before {
    content: "";
    position: absolute;
    top: 3px;
    left: 1px;
    width: var(--checkWidth);
    height: var(--checkSize);
    background-color: var(--toggle-track, #d1d5db);
    border: var(--checkBorder) solid var(--borders);
    border-radius: var(--checkSize);
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }
  div > label > span:hover::before {
    border-color: var(--text-disabled);
  }

  /* Knob (unchecked) */
  div > label > span::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 1px;
    width: var(--checkSize);
    height: var(--checkSize);
    background-color: var(--toggle-knob, #ffffff);
    border: var(--checkBorder) solid var(--borders);
    border-radius: var(--checkSize);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: left 0.2s ease, background-color 0.2s ease;
  }

  /* Track (checked) */
  div > label > input[type="checkbox"]:checked ~ span::before {
    background-color: var(--accent, #18a0fb);
    border-color: var(--accent, #18a0fb);
  }

  /* Knob (checked) */
  div > label > input[type="checkbox"]:checked ~ span::after {
    left: calc(var(--checkWidth) - var(--checkSize));
    background-color: #ffffff;
    border-color: rgba(255, 255, 255, 0.4);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  div > label > input[type="checkbox"] {
    display: none;
  }

  .badge {
    display: inline-block;
    padding: 1px 6px;
    margin-left: 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background-color: var(--accent-muted, rgba(24, 160, 251, 0.15));
    color: var(--accent, #18a0fb);
    vertical-align: middle;
  }

  /* Info icon */
  .info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-left: 8px;
    border-radius: 50%;
    border: 1px solid var(--text-disabled, #b3b3b3);
    color: var(--text-disabled, #b3b3b3);
    font-size: 10px;
    font-style: italic;
    font-weight: bold;
    font-family: serif;
    cursor: help;
    position: relative;
    line-height: 1;
  }
  .info-icon:hover {
    border-color: var(--text, #333);
    color: var(--text, #333);
  }

  /* Tooltip */
  .info-icon::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    left: auto;
    transform: none;
    background: var(--bg-overlay, #222222);
    color: var(--fg-overlay, #ffffff);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-style: normal;
    font-weight: normal;
    font-family: "Inter", sans-serif;
    white-space: normal;
    max-width: 220px;
    width: max-content;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    line-height: 1.4;
  }
  .info-icon:hover::after {
    opacity: 1;
  }
</style>
