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
