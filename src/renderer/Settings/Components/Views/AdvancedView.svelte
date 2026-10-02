<script lang="ts">
  import { settings } from "../../store";
  import { SETTINGS } from "../../schema";
  import SettingsIcon from "../SettingsIcon.svelte";

  async function addFontDir() {
    const directory = await window.figmaApi.invoke("selectExportDirectory");
    if (directory && !$settings.app.fontDirs.includes(directory)) {
      $settings.app.fontDirs = [...$settings.app.fontDirs, directory];
    }
  }
  function removeFontDir(dir: string) {
    $settings.app.fontDirs = $settings.app.fontDirs.filter((d) => d !== dir);
  }

  function addSwitch() {
    $settings.app.commandSwitches = [...$settings.app.commandSwitches, { switch: "" }];
  }
  function editSwitch(index: number, field: "switch" | "value", text: string) {
    $settings.app.commandSwitches = $settings.app.commandSwitches.map((s, i) =>
      i === index ? { ...s, [field]: text } : s,
    );
  }
  function removeSwitch(index: number) {
    $settings.app.commandSwitches = $settings.app.commandSwitches.filter((_, i) => i !== index);
  }
</script>

<section class="settings-group" id={`setting-${SETTINGS.fontDirs.id}`}>
  <h3 class="settings-group-title">{SETTINGS.fontDirs.title}</h3>
  <div class="settings-card">
    <p class="list-help">{SETTINGS.fontDirs.subtitle}</p>
    {#each $settings.app.fontDirs as dir (dir)}
      <div class="list-row">
        <span class="s-mono path" title={dir}>{dir}</span>
        <button
          type="button"
          class="s-btn icon"
          aria-label={`Remove ${dir}`}
          onclick={() => removeFontDir(dir)}
        >
          <SettingsIcon name="trash" size={14} />
        </button>
      </div>
    {:else}
      <p class="list-empty">No extra folders. System fonts are always used.</p>
    {/each}
    <div class="list-actions">
      <button type="button" class="s-btn" onclick={addFontDir}>
        <SettingsIcon name="folder" size={14} />Add folder
      </button>
    </div>
  </div>
</section>

<section class="settings-group" id={`setting-${SETTINGS.commandSwitches.id}`}>
  <h3 class="settings-group-title">
    {SETTINGS.commandSwitches.title}
    <span class="settings-group-note">Applied on the next start</span>
  </h3>
  <div class="settings-card">
    <p class="list-help">{SETTINGS.commandSwitches.subtitle}</p>
    {#each $settings.app.commandSwitches as item, index (index)}
      <div class="list-row">
        <input
          class="s-input s-mono grow"
          placeholder="switch-name"
          aria-label={`Switch ${index + 1}`}
          value={item.switch}
          oninput={(e) => editSwitch(index, "switch", e.currentTarget.value)}
        />
        <input
          class="s-input s-mono value"
          placeholder="value (optional)"
          aria-label={`Value of switch ${index + 1}`}
          value={item.value ?? ""}
          oninput={(e) => editSwitch(index, "value", e.currentTarget.value)}
        />
        <button
          type="button"
          class="s-btn icon"
          aria-label={`Remove switch ${item.switch || index + 1}`}
          onclick={() => removeSwitch(index)}
        >
          <SettingsIcon name="trash" size={14} />
        </button>
      </div>
    {:else}
      <p class="list-empty">No custom switches. The defaults are used.</p>
    {/each}
    <div class="list-actions">
      <button type="button" class="s-btn" onclick={addSwitch}>Add switch</button>
    </div>
  </div>
</section>

<style>
  .list-help,
  .list-empty {
    margin: 0;
    padding: 12px 16px 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .list-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .value {
    width: 160px;
  }
  .list-actions {
    display: flex;
    justify-content: flex-end;
    padding: 8px 16px 14px;
  }
</style>
