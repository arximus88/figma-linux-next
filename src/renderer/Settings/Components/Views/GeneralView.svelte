<script lang="ts">
  import { SettingRow, Toggle } from "Common";
  import { settings } from "../../store";
  import { SETTINGS } from "../../schema";
  import SettingsIcon from "../SettingsIcon.svelte";

  async function changeExportDir() {
    const directory = await window.figmaApi.invoke("selectExportDirectory");
    if (directory) $settings.app.exportDir = directory;
  }
</script>

<section class="settings-group">
  <h3 class="settings-group-title">Startup & files</h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.restoreTabs}>
      <Toggle bind:checked={$settings.app.saveLastOpenedTabs} />
    </SettingRow>
    <SettingRow setting={SETTINGS.exportDir} subtitle={$settings.app.exportDir} truncate>
      <button type="button" class="s-btn" onclick={changeExportDir}>
        <SettingsIcon name="folder" size={14} />Change folder
      </button>
    </SettingRow>
  </div>
</section>

<section class="settings-group">
  <h3 class="settings-group-title">Desktop</h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.tray}>
      <Toggle bind:checked={$settings.app.trayEnabled} />
    </SettingRow>
    <SettingRow setting={SETTINGS.zenity}>
      <Toggle bind:checked={$settings.app.useZenity} />
    </SettingRow>
  </div>
</section>

<section class="settings-group">
  <h3 class="settings-group-title">Trackpad</h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.trackpadPanSpeed}>
      <input
        class="s-range"
        type="range"
        min="0.25"
        max="4"
        step="0.25"
        aria-label={SETTINGS.trackpadPanSpeed.title}
        bind:value={$settings.app.trackpadPanSpeed}
      />
      <span class="s-value">{$settings.app.trackpadPanSpeed}×</span>
    </SettingRow>
    <SettingRow setting={SETTINGS.trackpadZoomSpeed}>
      <input
        class="s-range"
        type="range"
        min="0.25"
        max="4"
        step="0.25"
        aria-label={SETTINGS.trackpadZoomSpeed.title}
        bind:value={$settings.app.trackpadZoomSpeed}
      />
      <span class="s-value">{$settings.app.trackpadZoomSpeed}×</span>
    </SettingRow>
    <SettingRow setting={SETTINGS.trackpadMomentum}>
      <Toggle bind:checked={$settings.app.trackpadMomentum} />
    </SettingRow>
    <SettingRow setting={SETTINGS.trackpadMomentumGlide}>
      <input
        class="s-range"
        type="range"
        min="0.5"
        max="0.95"
        step="0.05"
        aria-label={SETTINGS.trackpadMomentumGlide.title}
        disabled={!$settings.app.trackpadMomentum}
        bind:value={$settings.app.trackpadMomentumGlide}
      />
      <span class="s-value">{$settings.app.trackpadMomentumGlide}</span>
    </SettingRow>
  </div>
</section>
