<script lang="ts">
  import { SettingRow, Toggle } from "Common";
  import { settings } from "../../store";
  import { SETTINGS } from "../../schema";
  import FramePreview from "../FramePreview.svelte";

  // macOS is a placeholder on top of the Windows style — not offered.
  const STYLES: { value: Types.FrameStyle; label: string; note: string }[] = [
    { value: "gnome", label: "GNOME / Adwaita", note: "Rounded tabs, controls on discs" },
    { value: "kde", label: "KDE Plasma / Breeze", note: "Breeze glyphs, accent line" },
    { value: "windows", label: "Legacy Windows", note: "Flat tabs and controls" },
  ];
  const labelOf = (style: Types.FrameStyle | null) =>
    STYLES.find((s) => s.value === style)?.label ?? "…";

  // Main resolves the desktop from XDG_CURRENT_DESKTOP; renderers can't see the env.
  let detected = $state<Types.FrameStyle | null>(null);
  window.figmaApi
    .invoke("getRuntimeInfo")
    .then((info: Types.RuntimeInfo) => {
      detected = info?.detectedFrameStyle ?? null;
    })
    .catch(() => {});

  // What the panel actually shows: the detected style while auto is on.
  let shown = $derived($settings.app.frameStyleAuto ? (detected ?? "gnome") : $settings.app.frameStyle);

  // Picking a frame is a manual choice, so it turns automatic matching off.
  function choose(style: Types.FrameStyle) {
    $settings.app.frameStyle = style;
    $settings.app.frameStyleAuto = false;
  }
</script>

<section class="settings-group">
  <h3 class="settings-group-title">Window frame</h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.frameAuto} subtitle={`Detected on this desktop: ${labelOf(detected)}.`}>
      <Toggle bind:checked={$settings.app.frameStyleAuto} />
    </SettingRow>
    <div class="frame-block" id={`setting-${SETTINGS.frameStyle.id}`}>
      <div class="frame-head">
        <span class="frame-title">{SETTINGS.frameStyle.title}</span>
        <span class="frame-note">
          {$settings.app.frameStyleAuto ? "Picking one turns automatic matching off." : "Manual choice."}
        </span>
      </div>
      <div class="frame-grid" role="radiogroup" aria-label={SETTINGS.frameStyle.title}>
        {#each STYLES as style (style.value)}
          <button
            type="button"
            class="frame-choice"
            class:selected={shown === style.value}
            role="radio"
            aria-checked={shown === style.value}
            onclick={() => choose(style.value)}
          >
            <FramePreview style={style.value} />
            <span class="frame-label">{style.label}</span>
            <span class="frame-desc">{style.note}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>

<section class="settings-group">
  <h3 class="settings-group-title">Tabs & controls</h3>
  <div class="settings-card">
    <SettingRow setting={SETTINGS.hideMinMax}>
      <Toggle bind:checked={$settings.app.hideWindowMinMaxButtons} />
    </SettingRow>
    <SettingRow setting={SETTINGS.newTabAfterTabs}>
      <Toggle bind:checked={$settings.app.newTabButtonAfterTabs} />
    </SettingRow>
    <SettingRow setting={SETTINGS.tabPreviews}>
      <Toggle bind:checked={$settings.app.tabHoverPreviews} />
    </SettingRow>
  </div>
</section>

<style>
  .frame-block {
    padding: 12px 16px 16px;
  }
  .frame-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 12px;
  }
  .frame-title {
    font-size: 14px;
    color: var(--text);
  }
  .frame-note {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .frame-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .frame-choice {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 8px 10px;
    border: 1px solid var(--borders);
    border-radius: 8px;
    background: var(--bg-panel);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .frame-choice:hover {
    border-color: var(--text-secondary);
  }
  .frame-choice.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .frame-choice:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .frame-label {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .frame-desc {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
