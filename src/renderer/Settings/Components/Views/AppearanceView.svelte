<script lang="ts">
  import { untrack } from "svelte";
  import { SettingRow, Toggle } from "Common";
  import { TOPPANELHEIGHT } from "Const";
  import { settings } from "../../store";
  import { SETTINGS } from "../../schema";

  const percent = (v: number) => `${Math.round(v * 100)}%`;

  // Both scales preview live while dragging; the value itself is saved by
  // autosave like any other setting.
  function setFigmaUiScale(value: number) {
    $settings.ui.scaleFigmaUI = value;
    window.figmaApi.invoke("updateFigmaUiScale", value);
  }
  function setPanelScale(value: number) {
    $settings.ui.scalePanel = value;
    untrack(() => {
      $settings.app.panelHeight = Math.floor(TOPPANELHEIGHT * value);
    });
    window.figmaApi.invoke("updatePanelScale", value);
  }
</script>

<section class="settings-group">
  <h3 class="settings-group-title">
    Interface scale <span class="settings-group-note">Applies as you drag</span>
  </h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.scaleFigmaUi}>
      <input
        class="s-range"
        type="range"
        min="0.5"
        max="1.5"
        step="0.05"
        aria-label={SETTINGS.scaleFigmaUi.title}
        value={$settings.ui.scaleFigmaUI}
        oninput={(e) => setFigmaUiScale(Number(e.currentTarget.value))}
      />
      <span class="s-value">{percent($settings.ui.scaleFigmaUI)}</span>
    </SettingRow>
    <SettingRow setting={SETTINGS.scalePanel}>
      <input
        class="s-range"
        type="range"
        min="0.5"
        max="1.5"
        step="0.05"
        aria-label={SETTINGS.scalePanel.title}
        value={$settings.ui.scalePanel}
        oninput={(e) => setPanelScale(Number(e.currentTarget.value))}
      />
      <span class="s-value">{percent($settings.ui.scalePanel)}</span>
    </SettingRow>
  </div>
</section>

<section class="settings-group">
  <h3 class="settings-group-title">Rendering</h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.srgb} badge="Restart" badgeKind="warning">
      <Toggle bind:checked={$settings.app.enableColorSpaceSrgb} />
    </SettingRow>
    <SettingRow
      setting={SETTINGS.webgpu}
      badges={[
        { text: "Experimental" },
        { text: "Restart", kind: "warning" },
      ]}
    >
      <Toggle bind:checked={$settings.app.enableWebGPU} />
    </SettingRow>
  </div>
</section>
